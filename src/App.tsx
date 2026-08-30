import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  type HandRecord,
  type OkaRuleId,
  type Room,
  type Session,
  type TieBreakOrder,
  type TieRuleId,
  type UmaRuleId,
} from './db'
import { BACKUP_FORMAT_VERSION, parseBackup, type BackupData } from './backup'
import './App.css'

const UMA_RULES: Array<{ id: UmaRuleId; label: string; bonuses: [number, number, number, number] }> = [
  { id: '5-10', label: 'ゴットー (5-10)', bonuses: [10, 5, -5, -10] },
  { id: '10-20', label: 'ワンツー (10-20)', bonuses: [20, 10, -10, -20] },
  { id: '10-30', label: 'ワンスリー (10-30)', bonuses: [30, 10, -10, -30] },
]
const OKA_RULES: Array<{ id: OkaRuleId; label: string; base: number; oka: number }> = [
  { id: 'oka20', label: 'オカあり (25000持ち/30000返し +20)', base: 30000, oka: 20 },
  { id: 'oka0', label: 'オカなし (25000持ち/25000返し)', base: 25000, oka: 0 },
]
const TIE_RULES: Array<{ id: TieRuleId; label: string }> = [
  { id: 'split', label: '同点は同着' },
  { id: 'seat', label: '同点は席順' },
]
const defaultPlayers: [string, string, string, string] = ['A', 'B', 'C', 'D']
const defaultScoreInputs: [string, string, string, string] = ['', '', '', '']
const todayString = () => new Date().toISOString().slice(0, 10)
const backupTimestamp = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
const filenameSafe = (value: string) => value.replace(/[\\/:*?"<>|]/g, '_').trim() || 'ルーム'
const makeId = () => crypto.randomUUID?.() ?? `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
/** 点数入力では末尾の 00 を省略し、250 を 25,000 点として扱う。 */
const parseScore = (value: string) => (/^-?\d+$/.test(value.trim()) ? Number.parseInt(value, 10) * 100 : null)
const formatScoreInput = (score: number) => String(score / 100)
const parsePositiveInt = (value: string) => (/^[1-9]\d*$/.test(value.trim()) ? Number.parseInt(value, 10) : null)
const formatAmount = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1))
const getUmaRule = (id: UmaRuleId) => UMA_RULES.find((rule) => rule.id === id) ?? UMA_RULES[0]
const getOkaRule = (id: OkaRuleId) => OKA_RULES.find((rule) => rule.id === id) ?? OKA_RULES[0]

type TieGroup = { score: number; playerIndexes: number[] }
const getTieGroups = (scores: number[]): TieGroup[] => {
  const groups = new Map<number, number[]>()
  scores.forEach((score, index) => groups.set(score, [...(groups.get(score) ?? []), index]))
  return [...groups.entries()]
    .filter(([, playerIndexes]) => playerIndexes.length > 1)
    .map(([score, playerIndexes]) => ({ score, playerIndexes }))
}
const resolveTieOrder = (group: TieGroup, orders?: TieBreakOrder[]) => {
  const saved = orders?.find((order) => order.score === group.score)?.playerIndexes
  return saved && saved.length === group.playerIndexes.length && saved.every((index) => group.playerIndexes.includes(index))
    ? saved
    : group.playerIndexes
}

const computeHandPoints = (room: Room, scores: number[], tieBreakOrders?: TieBreakOrder[]) => {
  const uma = getUmaRule(room.umaRule)
  const oka = getOkaRule(room.okaRule)
  const tieOrderByPlayer = new Map<number, number>()
  getTieGroups(scores).forEach((group) => resolveTieOrder(group, tieBreakOrders).forEach((player, position) => tieOrderByPlayer.set(player, position)))
  const items = scores.map((score, index) => ({ score, index })).sort((a, b) =>
    b.score !== a.score ? b.score - a.score : (tieOrderByPlayer.get(a.index) ?? a.index) - (tieOrderByPlayer.get(b.index) ?? b.index),
  )
  const ranks = Array(scores.length).fill(0) as number[]
  const bonuses = Array(scores.length).fill(0) as number[]
  if (room.tieRule === 'seat') {
    items.forEach((item, position) => {
      ranks[item.index] = position + 1
      bonuses[item.index] = uma.bonuses[position] + (position === 0 ? oka.oka : 0)
    })
  } else {
    let position = 0
    while (position < items.length) {
      const group = items.filter((item) => item.score === items[position].score)
      const start = position
      const bonus = sum(group.map((_, offset) => uma.bonuses[start + offset] + (start + offset === 0 ? oka.oka : 0))) / group.length
      group.forEach((item) => { ranks[item.index] = start + 1; bonuses[item.index] = bonus })
      position += group.length
    }
  }
  return { ranks, points: scores.map((score, index) => (score - oka.base) / 1000 + bonuses[index]) }
}

/** 通算・日別成績は席順を使わず、同点を同着として扱う。 */
const computeAggregateRanks = (totals: number[]) => {
  const sorted = totals.map((total, index) => ({ total, index })).sort((a, b) => b.total - a.total)
  const ranks = Array(totals.length).fill(0) as number[]
  let position = 0
  while (position < sorted.length) {
    const group = sorted.filter((item) => item.total === sorted[position].total)
    group.forEach((item) => { ranks[item.index] = position + 1 })
    position += group.length
  }
  return ranks
}
const computeFeeShares = (totals: number[], amount: number) => {
  const weights = [0, 1 / 6, 2 / 6, 3 / 6]
  const sorted = totals.map((total, index) => ({ total, index })).sort((a, b) => b.total - a.total)
  const shares = Array(totals.length).fill(0) as number[]
  let position = 0
  while (position < sorted.length) {
    const group = sorted.filter((item) => item.total === sorted[position].total)
    const share = sum(group.map((_, offset) => weights[position + offset])) / group.length
    group.forEach((item) => { shares[item.index] = amount * share })
    position += group.length
  }
  return shares
}

type SessionSummary = { session: Session; hands: HandRecord[]; totals: number[]; ranks: number[]; feeShares: number[] }
const createSessionSummary = (room: Room, session: Session, hands: HandRecord[]): SessionSummary => {
  const totals = [0, 0, 0, 0]
  hands.forEach((hand) => computeHandPoints(room, hand.scores, hand.tieBreakOrders).points.forEach((point, index) => { totals[index] += point }))
  return { session, hands, totals, ranks: computeAggregateRanks(totals), feeShares: session.feeEnabled ? computeFeeShares(totals, session.feeAmount) : [0, 0, 0, 0] }
}

function App() {
  const backupInputRef = useRef<HTMLInputElement>(null)
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [roomName, setRoomName] = useState('')
  const [roomPlayers, setRoomPlayers] = useState(defaultPlayers)
  const [roomUma, setRoomUma] = useState<UmaRuleId>('10-20')
  const [roomOka, setRoomOka] = useState<OkaRuleId>('oka20')
  const [roomTie, setRoomTie] = useState<TieRuleId>('split')
  const [newSessionDate, setNewSessionDate] = useState(todayString)
  const [newSessionFeeEnabled, setNewSessionFeeEnabled] = useState(false)
  const [newSessionFeeAmount, setNewSessionFeeAmount] = useState('')
  const [editingHandId, setEditingHandId] = useState<string | null>(null)
  const [editingHandCreatedAt, setEditingHandCreatedAt] = useState<number | null>(null)
  const [scoreInputs, setScoreInputs] = useState(defaultScoreInputs)
  const [tieBreakOrders, setTieBreakOrders] = useState<TieBreakOrder[]>([])
  const [showTotalFees, setShowTotalFees] = useState(false)
  const [highlightedPlayerIndex, setHighlightedPlayerIndex] = useState<number | null>(null)
  const [backupMessage, setBackupMessage] = useState('')

  const rooms = useLiveQuery(() => db.rooms.orderBy('createdAt').reverse().toArray(), [], [] as Room[])
  const activeRoomId = selectedRoomId ?? rooms[0]?.id ?? null
  const allSessions = useLiveQuery(() => db.sessions.toArray(), [], [] as Session[])
  const sessions = useLiveQuery(() => activeRoomId ? db.sessions.where('roomId').equals(activeRoomId).sortBy('date') : Promise.resolve([] as Session[]), [activeRoomId], [] as Session[])
  const roomHands = useLiveQuery(() => activeRoomId ? db.hands.where('roomId').equals(activeRoomId).sortBy('createdAt') : Promise.resolve([] as HandRecord[]), [activeRoomId], [] as HandRecord[])
  const activeSessionId = selectedSessionId && sessions.some((session) => session.id === selectedSessionId) ? selectedSessionId : sessions.at(-1)?.id ?? null
  const selectedRoom = rooms.find((room) => room.id === activeRoomId) ?? null
  const selectedSession = sessions.find((session) => session.id === activeSessionId) ?? null
  const hands = activeSessionId ? roomHands.filter((hand) => hand.sessionId === activeSessionId) : []
  const activeHighlightedPlayerIndex = selectedRoom && highlightedPlayerIndex !== null && highlightedPlayerIndex < selectedRoom.players.length
    ? highlightedPlayerIndex
    : null

  const parsedScores = scoreInputs.map(parseScore)
  const scoreReady = parsedScores.every((score) => score !== null)
  const scoreTotal = scoreReady ? sum(parsedScores as number[]) : null
  const scoreOk = scoreTotal === 100000
  const tieGroups = scoreReady ? getTieGroups(parsedScores as number[]) : []
  const handPreview = selectedRoom && scoreReady ? computeHandPoints(selectedRoom, parsedScores as number[], tieBreakOrders) : null
  const summaries = selectedRoom ? sessions.map((session) => createSessionSummary(selectedRoom, session, roomHands.filter((hand) => hand.sessionId === session.id))) : []
  const selectedSummary = summaries.find((summary) => summary.session.id === activeSessionId)
  const playerStats = !selectedRoom ? [] : selectedRoom.players.map((player, index) => {
      const handResults = roomHands.map((hand) => computeHandPoints(selectedRoom, hand.scores, hand.tieBreakOrders))
      const ranks = handResults.map((result) => result.ranks[index])
      const totalPoints = sum(summaries.map((summary) => summary.totals[index]))
      const finalScores = roomHands.map((hand) => hand.scores[index])
      const sessionCount = summaries.filter((summary) => summary.hands.length > 0).length
      return { player, totalPoints, averagePoints: sessionCount ? totalPoints / sessionCount : 0, sessionCount, averageRank: ranks.length ? sum(ranks) / ranks.length : 0, ranks, finalScores, fee: sum(summaries.map((summary) => summary.feeShares[index])) }
    })
  const newSessionFeeValue = parsePositiveInt(newSessionFeeAmount)
  const roomCanSave = roomName.trim().length > 0 && roomPlayers.every((player) => player.trim())
  const hasSessionFees = sessions.some((session) => session.feeEnabled)
  const dailyPointSeries = summaries
    .filter((summary) => summary.hands.length > 0)
    .map((summary) => ({ date: summary.session.date, totals: summary.totals }))
  const chartValues = dailyPointSeries.flatMap((item) => item.totals)
  const chartMin = Math.min(0, ...chartValues)
  const chartMax = Math.max(0, ...chartValues)
  const chartRange = chartMax - chartMin || 1

  const resetRoomForm = () => { setRoomName(''); setRoomPlayers(defaultPlayers); setRoomUma('10-20'); setRoomOka('oka20'); setRoomTie('split') }
  const resetHandForm = () => { setEditingHandId(null); setEditingHandCreatedAt(null); setScoreInputs(defaultScoreInputs); setTieBreakOrders([]) }
  const saveRoom = async () => {
    if (!roomCanSave) return
    const now = Date.now(); const room: Room = { id: makeId(), name: roomName.trim(), players: roomPlayers, umaRule: roomUma, okaRule: roomOka, tieRule: roomTie, createdAt: now, updatedAt: now }
    await db.rooms.add(room); setSelectedRoomId(room.id); resetRoomForm()
  }
  const addSession = async () => {
    if (!activeRoomId || !newSessionDate || (newSessionFeeEnabled && newSessionFeeValue === null)) return
    const now = Date.now(); const session: Session = { id: makeId(), roomId: activeRoomId, date: newSessionDate, feeEnabled: newSessionFeeEnabled, feeAmount: newSessionFeeEnabled ? newSessionFeeValue ?? 0 : 0, createdAt: now, updatedAt: now }
    await db.sessions.add(session); setSelectedSessionId(session.id); resetHandForm()
  }
  const saveHand = async () => {
    if (!activeRoomId || !activeSessionId || !scoreOk) return
    const now = new Date().valueOf(); const hand: HandRecord = { id: editingHandId ?? makeId(), roomId: activeRoomId, sessionId: activeSessionId, scores: parsedScores as [number, number, number, number], tieBreakOrders: selectedRoom?.tieRule === 'seat' ? tieGroups.map((group) => ({ score: group.score, playerIndexes: resolveTieOrder(group, tieBreakOrders) })) : undefined, createdAt: editingHandCreatedAt ?? now, updatedAt: now }
    await db.hands.put(hand); resetHandForm()
  }
  const editHand = (hand: HandRecord) => { setEditingHandId(hand.id); setEditingHandCreatedAt(hand.createdAt); setScoreInputs(hand.scores.map(formatScoreInput) as typeof defaultScoreInputs); setTieBreakOrders(hand.tieBreakOrders ?? []) }
  const deleteHand = async (id: string) => { await db.hands.delete(id); if (editingHandId === id) resetHandForm() }
  const deleteSession = async (sessionId: string) => { await db.hands.where('sessionId').equals(sessionId).delete(); await db.sessions.delete(sessionId); if (activeSessionId === sessionId) resetHandForm() }
  const deleteRoom = async (roomId: string) => { await db.transaction('rw', db.rooms, db.sessions, db.hands, async () => { await db.hands.where('roomId').equals(roomId).delete(); await db.sessions.where('roomId').equals(roomId).delete(); await db.rooms.delete(roomId) }); if (activeRoomId === roomId) { setSelectedRoomId(null); setSelectedSessionId(null); resetHandForm() } }
  const updateRoom = async (changes: Partial<Pick<Room, 'name' | 'players'>>) => { if (selectedRoom) await db.rooms.update(selectedRoom.id, { ...changes, updatedAt: new Date().valueOf() }) }
  const updateSessionFee = async (changes: Partial<Pick<Session, 'feeEnabled' | 'feeAmount'>>) => { if (selectedSession) await db.sessions.update(selectedSession.id, { ...changes, updatedAt: new Date().valueOf() }) }
  const exportBackup = async () => {
    if (!selectedRoom) { setBackupMessage('書き出すルームを選択してください。'); return }
    const sessions = await db.sessions.where('roomId').equals(selectedRoom.id).toArray()
    const backup: BackupData = { format: 'mahjong-score-backup', version: BACKUP_FORMAT_VERSION, exportedAt: new Date().toISOString(), rooms: [selectedRoom], sessions, hands: await db.hands.where('roomId').equals(selectedRoom.id).toArray() }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `${filenameSafe(selectedRoom.name)}_${backupTimestamp()}.json`; link.click()
    URL.revokeObjectURL(url)
    setBackupMessage(`${backup.rooms.length}件のルームをバックアップしました。`)
  }
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const backup = parseBackup(await file.text())
      if (!window.confirm(`現在のデータを削除せずに取り込みます。\nルーム ${backup.rooms.length}件、対局日 ${backup.sessions.length}件、半荘 ${backup.hands.length}件を追加・更新します。\n\n続けますか？`)) return
      await db.transaction('rw', db.rooms, db.sessions, db.hands, async () => {
        const existingRooms = await db.rooms.bulkGet(backup.rooms.map((room) => room.id))
        const existingSessions = await db.sessions.bulkGet(backup.sessions.map((session) => session.id))
        const existingHands = await db.hands.bulkGet(backup.hands.map((hand) => hand.id))
        const roomsToPut = backup.rooms.filter((room, index) => !existingRooms[index] || room.updatedAt > existingRooms[index].updatedAt)
        const sessionsToPut = backup.sessions.filter((session, index) => !existingSessions[index] || session.updatedAt > existingSessions[index].updatedAt)
        const handsToPut = backup.hands.filter((hand, index) => !existingHands[index] || hand.updatedAt > existingHands[index].updatedAt)
        await db.rooms.bulkPut(roomsToPut)
        await db.sessions.bulkPut(sessionsToPut)
        await db.hands.bulkPut(handsToPut)
      })
      setBackupMessage('バックアップを取り込みました。既存の別ルームは保持されています。')
    } catch (error) {
      setBackupMessage(`復元できませんでした: ${error instanceof Error ? error.message : '不明なエラー'}`)
    }
  }
  const moveTiePlayer = (group: TieGroup, playerIndex: number, direction: -1 | 1) => {
    const order = [...resolveTieOrder(group, tieBreakOrders)]; const position = order.indexOf(playerIndex); const nextPosition = position + direction
    if (nextPosition < 0 || nextPosition >= order.length) return
    ;[order[position], order[nextPosition]] = [order[nextPosition], order[position]]
    setTieBreakOrders((orders) => [...orders.filter((order) => order.score !== group.score), { score: group.score, playerIndexes: order }])
  }
  const latestDate = (roomId: string) => allSessions.filter((session) => session.roomId === roomId).map((session) => session.date).sort().at(-1)

  return <div className="page">
    <header className="header"><div><p className="eyebrow">Mahjong Score</p><h1>麻雀点数記録アプリ</h1></div></header>
    <section className="card"><div className="card-title"><h2>ルーム作成</h2></div><div className="grid">
      <label className="field">ルーム名<input value={roomName} onChange={(event) => setRoomName(event.target.value)} placeholder="例: 金曜麻雀" /></label>
      <div className="grid">{roomPlayers.map((player, index) => <label key={index} className="field">プレイヤー{index + 1}<input className="name" value={player} onChange={(event) => { const next = [...roomPlayers] as typeof roomPlayers; next[index] = event.target.value; setRoomPlayers(next) }} /></label>)}</div>
      <label className="field">ウマ<select value={roomUma} onChange={(event) => setRoomUma(event.target.value as UmaRuleId)}>{UMA_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
      <label className="field">オカ<select value={roomOka} onChange={(event) => setRoomOka(event.target.value as OkaRuleId)}>{OKA_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
      <label className="field">同点処理<select value={roomTie} onChange={(event) => setRoomTie(event.target.value as TieRuleId)}>{TIE_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}</select></label>
    </div><div className="actions"><button onClick={saveRoom} disabled={!roomCanSave}>ルームを作成</button><button className="ghost" onClick={resetRoomForm}>クリア</button></div></section>
    <section className="card"><div className="card-title"><h2>ルーム一覧</h2></div>{!rooms.length && <p className="muted">まだルームがありません。</p>}<div className="room-list">{rooms.map((room) => <div key={room.id} className="room-item"><button className={room.id === activeRoomId ? 'room-button active' : 'room-button'} onClick={() => { setSelectedRoomId(room.id); resetHandForm() }}><div>{room.name}</div><div className="small">{room.players.join(' / ')}</div><div className="small">最新対局日: {latestDate(room.id) ?? 'なし'}</div><div className="small">{getUmaRule(room.umaRule).label} / {getOkaRule(room.okaRule).label}</div></button><button className="danger room-delete" onClick={() => deleteRoom(room.id)} aria-label="ルーム削除">×</button></div>)}</div></section>
    <section className="card"><div className="card-title"><h2>バックアップ</h2><span className="small">端末変更・同期前の保全用</span></div><div className="actions"><button className="ghost" onClick={() => void exportBackup()} disabled={!selectedRoom}>選択中のルームをJSONに書き出す</button><button className="ghost" onClick={() => backupInputRef.current?.click()}>JSONを取り込む</button><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void importBackup(event)} /></div><p className="small">取り込みでは既存データを削除しません。同じIDのデータは更新日時が新しい方を採用します。</p>{backupMessage && <p className="small">{backupMessage}</p>}</section>
    {selectedRoom && <>
      <section className="card" key={selectedRoom.id}><div className="card-title"><h2>ルーム設定</h2><span className="small">入力欄から移動すると保存されます</span></div><div className="grid"><label className="field">ルーム名<input defaultValue={selectedRoom.name} onBlur={(event) => { const name = event.target.value.trim(); if (name && name !== selectedRoom.name) void updateRoom({ name }) }} /></label>{selectedRoom.players.map((player, index) => <label key={index} className="field">プレイヤー{index + 1}<input defaultValue={player} onBlur={(event) => { const name = event.target.value.trim(); if (!name || name === selectedRoom.players[index]) return; const players = [...selectedRoom.players] as Room['players']; players[index] = name; void updateRoom({ players }) }} /></label>)}</div></section>
      <section className="card"><div className="card-title"><h2>{selectedRoom.name} の対局日</h2></div><div className="actions"><label className="field inline-field">日付<input type="date" value={newSessionDate} onChange={(event) => setNewSessionDate(event.target.value)} /></label><label className="field checkbox inline-field">場代計算<input type="checkbox" checked={newSessionFeeEnabled} onChange={(event) => setNewSessionFeeEnabled(event.target.checked)} /></label>{newSessionFeeEnabled && <label className="field inline-field">場代<input type="number" min="1" value={newSessionFeeAmount} onChange={(event) => setNewSessionFeeAmount(event.target.value)} />{newSessionFeeValue === null && <span className="alert-inline">場代を入力してください</span>}</label>}<button onClick={addSession} disabled={newSessionFeeEnabled && newSessionFeeValue === null}>対局日を追加</button></div><div className="session-list">{sessions.map((session) => { const summary = summaries.find((item) => item.session.id === session.id); return <div key={session.id} className={session.id === activeSessionId ? 'session-item active' : 'session-item'}><button onClick={() => { setSelectedSessionId(session.id); resetHandForm() }}><strong>{session.date}</strong><span className="small"> {summary?.hands.length ?? 0} 半荘 / {session.feeEnabled ? `場代 ${session.feeAmount}` : '場代なし'}</span></button><button className="danger" onClick={() => deleteSession(session.id)} aria-label="対局日を削除">×</button></div> })}</div></section>
      {!selectedSession && <section className="card"><p className="muted">対局日を追加すると点数を記録できます。</p></section>}
      {selectedSession && <section className="card compact"><div className="card-title compact-title"><h2>{selectedSession.date} の点数記録</h2><div className="compact-meta"><span className="small">末尾00は省略（例: 250 → 25000点）</span><span className={scoreOk ? 'badge ok' : 'badge warn'}>合計: {scoreReady ? scoreTotal : '未入力'}</span>{scoreReady && !scoreOk && <span className="alert-inline">100000点に揃っていません</span>}</div></div>
        <div className="actions"><label className="field checkbox inline-field">この日の場代計算<input type="checkbox" checked={selectedSession.feeEnabled} onChange={(event) => void updateSessionFee({ feeEnabled: event.target.checked, feeAmount: event.target.checked ? selectedSession.feeAmount : 0 })} /></label>{selectedSession.feeEnabled && <label className="field inline-field">場代<input type="number" min="1" defaultValue={selectedSession.feeAmount || ''} onBlur={(event) => { const amount = parsePositiveInt(event.target.value); if (amount !== null) void updateSessionFee({ feeAmount: amount }) }} /></label>}</div>
        <div className="table-wrap"><table className="hand-table"><thead><tr><th className="col-head">#</th>{selectedRoom.players.map((player) => <th key={player}>{player}</th>)}<th className="col-actions">操作</th></tr>{selectedSummary && <tr className="summary-row"><th className="row-label">日計</th>{selectedRoom.players.map((player, index) => <th key={player}><div className="summary-cell"><span>{selectedSummary.totals[index].toFixed(1)}pt</span><span className="small">順位 {selectedSummary.ranks[index]}</span></div></th>)}<th /></tr>}{selectedSummary && selectedSession.feeEnabled && <tr className="summary-row"><th className="row-label">場代</th>{selectedRoom.players.map((player, index) => <th key={player}>{formatAmount(selectedSummary.feeShares[index])}</th>)}<th /></tr>}</thead><tbody>
          <tr className="input-row"><td className="row-label">{editingHandId ? '編集' : '追加'}</td>{selectedRoom.players.map((player, index) => <td key={player}><div className="score-input-with-suffix"><input type="text" className="score compact-input" inputMode="numeric" placeholder="250" aria-label={`${player}の点数（末尾00省略）`} value={scoreInputs[index]} onChange={(event) => { const next = [...scoreInputs] as typeof scoreInputs; next[index] = event.target.value; setScoreInputs(next) }} /><span aria-hidden="true">00</span></div>{handPreview && <div className="small">{handPreview.points[index].toFixed(1)}pt / {handPreview.ranks[index]}位</div>}</td>)}<td className="row-actions"><button onClick={saveHand} disabled={!scoreOk} aria-label="保存">💾</button></td></tr>
          {!hands.length && <tr><td colSpan={6} className="muted">まだ半荘がありません。</td></tr>}
          {hands.map((hand, index) => { const result = computeHandPoints(selectedRoom, hand.scores, hand.tieBreakOrders); return <tr key={hand.id}><td className="row-label">{index + 1}</td>{selectedRoom.players.map((player, playerIndex) => <td key={player}><div>{hand.scores[playerIndex]}</div><div className="small">{result.points[playerIndex].toFixed(1)}pt / {result.ranks[playerIndex]}位</div></td>)}<td className="row-actions"><button onClick={() => editHand(hand)} aria-label="編集">✎</button><button className="danger" onClick={() => deleteHand(hand.id)} aria-label="削除">×</button></td></tr> })}
        </tbody></table></div>
        {selectedRoom.tieRule === 'seat' && tieGroups.length > 0 && <div className="tie-break"><strong>同点時の上位順</strong>{tieGroups.map((group) => <div key={group.score} className="tie-group"><span>{group.score}点:</span>{resolveTieOrder(group, tieBreakOrders).map((playerIndex, position) => <span key={playerIndex} className="tie-player">{position + 1}位 {selectedRoom.players[playerIndex]}<button onClick={() => moveTiePlayer(group, playerIndex, -1)} disabled={position === 0}>↑</button><button onClick={() => moveTiePlayer(group, playerIndex, 1)} disabled={position === group.playerIndexes.length - 1}>↓</button></span>)}</div>)}</div>}
      </section>}
      <section className="card"><div className="card-title"><h2>通算成績</h2><div className="compact-meta"><span className="small">全対局日を合算</span>{hasSessionFees && <label className="field checkbox inline-field">総場代を表示<input type="checkbox" checked={showTotalFees} onChange={(event) => setShowTotalFees(event.target.checked)} /></label>}</div></div><div className="table-wrap"><table className="stats-table"><thead><tr><th>プレイヤー</th><th>総得点 / 総収支</th><th>平均得点</th><th>平均順位</th><th>飛び率</th>{showTotalFees && <th>総場代</th>}</tr></thead><tbody>{playerStats.map((stat) => { const completed = stat.ranks.length; const bustRate = stat.finalScores.length ? `${(stat.finalScores.filter((score) => score < 0).length / stat.finalScores.length * 100).toFixed(1)}%` : '-'; return <tr key={stat.player}><th>{stat.player}</th><td>{stat.totalPoints.toFixed(1)}pt</td><td>{stat.sessionCount ? stat.averagePoints.toFixed(1) : '-'}</td><td>{completed ? stat.averageRank.toFixed(2) : '-'}</td><td>{bustRate}</td>{showTotalFees && <td>{formatAmount(stat.fee)}</td>}</tr> })}</tbody></table></div></section>
      <section className="card"><div className="card-title"><h2>日別総合ポイントの推移</h2><label className="field inline-field chart-player-select">強調するプレイヤー<select value={activeHighlightedPlayerIndex ?? ''} onChange={(event) => setHighlightedPlayerIndex(event.target.value === '' ? null : Number(event.target.value))}><option value="">なし</option>{selectedRoom.players.map((player, index) => <option key={player} value={index}>{player}</option>)}</select></label></div><p className="small">対局日の半荘ポイント合計</p>{!dailyPointSeries.length ? <p className="muted">半荘を記録すると推移を表示できます。</p> : <><div className="chart-legend">{selectedRoom.players.map((player, index) => <span key={player} style={{ opacity: activeHighlightedPlayerIndex === null || activeHighlightedPlayerIndex === index ? 1 : 0.25 }}><i style={{ backgroundColor: ['#0f5132', '#b54708', '#2764a8', '#8a3fa0'][index] }} />{player}</span>)}</div><div className="chart-wrap"><svg className="revenue-chart" viewBox="0 0 640 280" role="img" aria-label="プレイヤー別の日別総合ポイント推移"><line x1="52" y1="18" x2="52" y2="236" className="chart-axis" /><line x1="52" y1="236" x2="620" y2="236" className="chart-axis" /><line x1="52" y1={18 + (chartMax / chartRange) * 218} x2="620" y2={18 + (chartMax / chartRange) * 218} className="chart-zero" /><text x="4" y="24" className="chart-label">{chartMax.toFixed(1)}pt</text><text x="4" y="236" className="chart-label">{chartMin.toFixed(1)}pt</text>{selectedRoom.players.map((player, playerIndex) => { const color = ['#0f5132', '#b54708', '#2764a8', '#8a3fa0'][playerIndex]; const points = dailyPointSeries.map((item, index) => { const x = dailyPointSeries.length === 1 ? 336 : 52 + index / (dailyPointSeries.length - 1) * 568; const y = 18 + (chartMax - item.totals[playerIndex]) / chartRange * 218; return `${x},${y}` }).join(' '); return <g key={player} opacity={activeHighlightedPlayerIndex === null || activeHighlightedPlayerIndex === playerIndex ? 1 : 0.15}><polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{dailyPointSeries.map((item, index) => { const x = dailyPointSeries.length === 1 ? 336 : 52 + index / (dailyPointSeries.length - 1) * 568; const y = 18 + (chartMax - item.totals[playerIndex]) / chartRange * 218; return <circle key={item.date} cx={x} cy={y} r="4" fill={color}><title>{`${item.date}: ${player} ${item.totals[playerIndex].toFixed(1)}pt`}</title></circle> })}</g> })}<text x="52" y="264" className="chart-label">{dailyPointSeries[0].date}</text>{dailyPointSeries.length > 1 && <text x="620" y="264" textAnchor="end" className="chart-label">{dailyPointSeries[dailyPointSeries.length - 1].date}</text>}</svg></div></>}</section>
      <section className="card"><div className="card-title"><h2>順位分布</h2><span className="small">半荘ごとの順位の割合</span></div><div className="table-wrap"><table className="stats-table rank-distribution"><thead><tr><th>順位</th>{playerStats.map((stat) => <th key={stat.player}>{stat.player}</th>)}</tr></thead><tbody>{[1, 2, 3, 4].map((rank) => <tr key={rank}><th>{rank}位</th>{playerStats.map((stat) => { const rate = stat.ranks.length ? stat.ranks.filter((value) => value === rank).length / stat.ranks.length * 100 : 0; return <td key={stat.player}><span className="rank-rate" style={{ backgroundColor: `hsl(142 35% ${100 - rate * 0.35}%)` }}>{stat.ranks.length ? `${rate.toFixed(1)}%` : '-'}</span></td> })}</tr>)}</tbody></table></div></section>
    </>}
  </div>
}

export default App
