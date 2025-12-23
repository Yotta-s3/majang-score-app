import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type HandRecord, type OkaRuleId, type Room, type TieRuleId, type UmaRuleId } from './db'
import './App.css'

const UMA_RULES: Array<{
  id: UmaRuleId
  label: string
  bonuses: [number, number, number, number]
}> = [
  { id: '5-10', label: 'ゴットー (5-10)', bonuses: [10, 5, -5, -10] },
  { id: '10-20', label: 'ワンツー (10-20)', bonuses: [20, 10, -10, -20] },
  { id: '10-30', label: 'ワンスリー (10-30)', bonuses: [30, 10, -10, -30] },
]

const OKA_RULES: Array<{
  id: OkaRuleId
  label: string
  base: number
  oka: number
}> = [
  { id: 'oka20', label: 'オカあり (25000持ち/30000返し +20)', base: 30000, oka: 20 },
  { id: 'oka0', label: 'オカなし (25000持ち/25000返し)', base: 25000, oka: 0 },
]

const TIE_RULES: Array<{ id: TieRuleId; label: string }> = [
  { id: 'split', label: '同点は同着' },
  { id: 'seat', label: '同点は席順' },
]

const defaultPlayers: [string, string, string, string] = ['A', 'B', 'C', 'D']
const defaultScores: [number, number, number, number] = [0, 0, 0, 0]
const defaultScoreInputs: [string, string, string, string] = ['', '', '', '']

const todayString = () => new Date().toISOString().slice(0, 10)
const makeId = () =>
  typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `rec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const sumScores = (scores: number[]) => scores.reduce((sum, value) => sum + value, 0)
const parseScore = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^-?\d+$/.test(trimmed)) return null
  return Number.parseInt(trimmed, 10)
}
const parsePositiveInt = (value: string) => {
  const trimmed = value.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return null
  return Number.parseInt(trimmed, 10)
}

const getUmaRule = (id: UmaRuleId) => UMA_RULES.find((rule) => rule.id === id) ?? UMA_RULES[0]
const getOkaRule = (id: OkaRuleId) => OKA_RULES.find((rule) => rule.id === id) ?? OKA_RULES[0]

type RankingResult = {
  ranks: number[]
  bonuses: number[]
}

const computeRankings = (
  scores: number[],
  tieRule: TieRuleId,
  umaBonuses: number[],
  okaBonus: number,
): RankingResult => {
  const items = scores.map((score, index) => ({ score, index }))
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })

  const ranks = Array(scores.length).fill(0) as number[]
  const bonuses = Array(scores.length).fill(0) as number[]

  if (tieRule === 'seat') {
    items.forEach((item, position) => {
      const rank = position + 1
      const bonus = umaBonuses[position] + (rank === 1 ? okaBonus : 0)
      ranks[item.index] = rank
      bonuses[item.index] = bonus
    })
    return { ranks, bonuses }
  }

  let position = 1
  let cursor = 0
  while (cursor < items.length) {
    const score = items[cursor].score
    const group: typeof items = []
    while (cursor < items.length && items[cursor].score === score) {
      group.push(items[cursor])
      cursor += 1
    }
    const groupSize = group.length
    const bonusStart = position - 1
    const bonusEnd = bonusStart + groupSize - 1
    let bonusSum = 0
    for (let i = bonusStart; i <= bonusEnd; i += 1) {
      const rank = i + 1
      bonusSum += umaBonuses[i] + (rank === 1 ? okaBonus : 0)
    }
    const bonusAvg = bonusSum / groupSize
    group.forEach((item) => {
      ranks[item.index] = position
      bonuses[item.index] = bonusAvg
    })
    position += groupSize
  }

  return { ranks, bonuses }
}

const computeHandPoints = (room: Room, scores: number[]) => {
  const umaRule = getUmaRule(room.umaRule)
  const okaRule = getOkaRule(room.okaRule)
  const base = okaRule.base
  const { ranks, bonuses } = computeRankings(scores, room.tieRule, umaRule.bonuses, okaRule.oka)
  const points = scores.map((score, index) => (score - base) / 1000 + bonuses[index])
  return { points, ranks }
}

const computeFinalRanks = (totals: number[], tieRule: TieRuleId) => {
  const items = totals.map((score, index) => ({ score, index }))
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })
  const ranks = Array(totals.length).fill(0) as number[]
  if (tieRule === 'seat') {
    items.forEach((item, position) => {
      ranks[item.index] = position + 1
    })
    return ranks
  }
  let position = 1
  let cursor = 0
  while (cursor < items.length) {
    const score = items[cursor].score
    const group: typeof items = []
    while (cursor < items.length && items[cursor].score === score) {
      group.push(items[cursor])
      cursor += 1
    }
    group.forEach((item) => {
      ranks[item.index] = position
    })
    position += group.length
  }
  return ranks
}

const computeFeeShares = (totals: number[], tieRule: TieRuleId, feeAmount: number) => {
  const sharesByPosition = [0, 1 / 6, 2 / 6, 3 / 6]
  const items = totals.map((score, index) => ({ score, index }))
  items.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })

  const shares = Array(totals.length).fill(0) as number[]

  if (tieRule === 'seat') {
    items.forEach((item, position) => {
      shares[item.index] = feeAmount * sharesByPosition[position]
    })
    return shares
  }

  let position = 1
  let cursor = 0
  while (cursor < items.length) {
    const score = items[cursor].score
    const group: typeof items = []
    while (cursor < items.length && items[cursor].score === score) {
      group.push(items[cursor])
      cursor += 1
    }
    const groupSize = group.length
    const shareStart = position - 1
    const shareEnd = shareStart + groupSize - 1
    let shareSum = 0
    for (let i = shareStart; i <= shareEnd; i += 1) {
      shareSum += sharesByPosition[i]
    }
    const shareAvg = shareSum / groupSize
    group.forEach((item) => {
      shares[item.index] = feeAmount * shareAvg
    })
    position += groupSize
  }

  return shares
}

const formatAmount = (value: number) => (Number.isInteger(value) ? `${value}` : value.toFixed(1))

function App() {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [roomDate, setRoomDate] = useState(todayString)
  const [roomPlayers, setRoomPlayers] = useState(defaultPlayers)
  const [roomUma, setRoomUma] = useState<UmaRuleId>('10-20')
  const [roomOka, setRoomOka] = useState<OkaRuleId>('oka20')
  const [roomTie, setRoomTie] = useState<TieRuleId>('split')
  const [roomFeeEnabled, setRoomFeeEnabled] = useState(false)
  const [roomFeeAmount, setRoomFeeAmount] = useState('')

  const [editingHandId, setEditingHandId] = useState<string | null>(null)
  const [editingHandCreatedAt, setEditingHandCreatedAt] = useState<number | null>(null)
  const [scoreInputs, setScoreInputs] = useState(defaultScoreInputs)

  const rooms = useLiveQuery(
    () => db.rooms.orderBy('createdAt').reverse().toArray(),
    [],
    [] as Room[],
  )
  const selectedRoom = rooms.find((room) => room.id === selectedRoomId) ?? null
  const hands = useLiveQuery(
    () =>
      selectedRoomId
        ? db.hands.where('roomId').equals(selectedRoomId).sortBy('createdAt')
        : Promise.resolve([] as HandRecord[]),
    [selectedRoomId],
    [] as HandRecord[],
  )

  useEffect(() => {
    if (!selectedRoomId && rooms.length) {
      setSelectedRoomId(rooms[0].id)
    }
  }, [rooms, selectedRoomId])

  const parsedScores = useMemo(
    () => scoreInputs.map((value) => parseScore(value)),
    [scoreInputs],
  )
  const scoreTotal = useMemo(() => {
    if (parsedScores.some((value) => value === null)) return null
    return sumScores(parsedScores as number[])
  }, [parsedScores])
  const scoreReady = parsedScores.every((value) => value !== null)
  const scoreOk = scoreReady && scoreTotal === 100000
  const handCanSave = scoreOk

  const roomFeeValue = parsePositiveInt(roomFeeAmount)
  const roomFeeValid = !roomFeeEnabled || roomFeeValue !== null
  const roomCanSave = roomPlayers.every((player) => player.trim().length > 0) && roomFeeValid

  const handPreview = useMemo(() => {
    if (!selectedRoom) return null
    if (parsedScores.some((value) => value === null)) return null
    return computeHandPoints(selectedRoom, parsedScores as number[])
  }, [parsedScores, selectedRoom])

  const totals = useMemo(() => {
    if (!selectedRoom || !hands.length) return defaultScores
    const totalsBase = [0, 0, 0, 0] as [number, number, number, number]
    hands.forEach((hand) => {
      const { points } = computeHandPoints(selectedRoom, hand.scores)
      points.forEach((point, index) => {
        totalsBase[index] += point
      })
    })
    return totalsBase
  }, [hands, selectedRoom])

  const finalRanks = useMemo(() => {
    if (!selectedRoom) return [1, 2, 3, 4] as number[]
    return computeFinalRanks(totals, selectedRoom.tieRule)
  }, [selectedRoom, totals])

  const feeEnabled = selectedRoom?.feeEnabled ?? false
  const feeAmount = selectedRoom?.feeAmount ?? 0
  const feeShares = useMemo(() => {
    if (!selectedRoom || !feeEnabled) return null
    return computeFeeShares(totals, selectedRoom.tieRule, feeAmount)
  }, [feeAmount, feeEnabled, selectedRoom, totals])

  const resetRoomForm = () => {
    setRoomDate(todayString())
    setRoomPlayers(defaultPlayers)
    setRoomUma('10-20')
    setRoomOka('oka20')
    setRoomTie('split')
    setRoomFeeEnabled(false)
    setRoomFeeAmount('')
  }

  const resetHandForm = () => {
    setEditingHandId(null)
    setEditingHandCreatedAt(null)
    setScoreInputs(defaultScoreInputs)
  }

  const saveRoom = async () => {
    const now = Date.now()
    if (!roomCanSave) return
    const room: Room = {
      id: makeId(),
      date: roomDate,
      players: roomPlayers,
      umaRule: roomUma,
      okaRule: roomOka,
      tieRule: roomTie,
      feeEnabled: roomFeeEnabled,
      feeAmount: roomFeeEnabled ? (roomFeeValue ?? 0) : 0,
      createdAt: now,
      updatedAt: now,
    }
    await db.rooms.add(room)
    setSelectedRoomId(room.id)
    resetRoomForm()
  }

  const saveHand = async () => {
    if (!selectedRoomId) return
    if (!handCanSave) return
    const now = Date.now()
    const hand: HandRecord = {
      id: editingHandId ?? makeId(),
      roomId: selectedRoomId,
      scores: parsedScores as [number, number, number, number],
      createdAt: editingHandCreatedAt ?? now,
      updatedAt: now,
    }
    await db.hands.put(hand)
    resetHandForm()
  }

  const editHand = (hand: HandRecord) => {
    setEditingHandId(hand.id)
    setEditingHandCreatedAt(hand.createdAt)
    setScoreInputs(hand.scores.map((score) => String(score)) as typeof defaultScoreInputs)
  }

  const deleteHand = async (id: string) => {
    await db.hands.delete(id)
    if (editingHandId === id) {
      resetHandForm()
    }
  }

  const deleteRoom = async (id: string) => {
    await db.hands.where('roomId').equals(id).delete()
    await db.rooms.delete(id)
    if (selectedRoomId === id) {
      setSelectedRoomId(null)
    }
  }

  return (
    <div className="page">
      <header className="header">
        <div>
          <p className="eyebrow">Mahjong Score</p>
          <h1>麻雀点数記録アプリ</h1>
        </div>
      </header>

      <section className="card">
        <div className="card-title">
          <h2>ルーム作成</h2>
        </div>
        <div className="grid">
          <label className="field">
            日付
            <input
              type="date"
              value={roomDate}
              onChange={(event) => setRoomDate(event.target.value)}
            />
          </label>
          <div className="grid">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="row">
                <input
                  className="name"
                  value={roomPlayers[index]}
                  onChange={(event) => {
                    const next = [...roomPlayers] as typeof roomPlayers
                    next[index] = event.target.value
                    setRoomPlayers(next)
                  }}
                />
              </div>
            ))}
          </div>
          <label className="field">
            ウマ
            <select value={roomUma} onChange={(event) => setRoomUma(event.target.value as UmaRuleId)}>
              {UMA_RULES.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            オカ
            <select value={roomOka} onChange={(event) => setRoomOka(event.target.value as OkaRuleId)}>
              {OKA_RULES.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            同点処理
            <select value={roomTie} onChange={(event) => setRoomTie(event.target.value as TieRuleId)}>
              {TIE_RULES.map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field checkbox">
            場代計算
            <input
              type="checkbox"
              checked={roomFeeEnabled}
              onChange={(event) => setRoomFeeEnabled(event.target.checked)}
            />
          </label>
          {roomFeeEnabled && (
            <label className="field">
              場代（自然数）
              <input
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={roomFeeAmount}
                onChange={(event) => setRoomFeeAmount(event.target.value)}
              />
              {!roomFeeValid && <span className="alert-inline">場代を入力してください</span>}
            </label>
          )}
        </div>
        <div className="actions">
          <button onClick={saveRoom} disabled={!roomCanSave}>
            ルームを作成
          </button>
          <button className="ghost" onClick={resetRoomForm}>
            クリア
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card-title">
          <h2>ルーム一覧</h2>
        </div>
        {!rooms.length && <p className="muted">まだルームがありません。</p>}
        <div className="room-list">
          {rooms.map((room) => (
            <div key={room.id} className="room-item">
              <button
                className={room.id === selectedRoomId ? 'room-button active' : 'room-button'}
                onClick={() => setSelectedRoomId(room.id)}
              >
                <div>{room.date}</div>
                <div className="small">{room.players.join(' / ')}</div>
                <div className="small">
                  {getUmaRule(room.umaRule).label} / {getOkaRule(room.okaRule).label}
                </div>
                <div className="small">{room.feeEnabled ? `場代: ${room.feeAmount}` : '場代なし'}</div>
              </button>
              <button className="danger room-delete" onClick={() => deleteRoom(room.id)} aria-label="ルーム削除">
                ×
              </button>
            </div>
          ))}
        </div>
      </section>

      {selectedRoom && (
        <section className="card compact">
          <div className="card-title compact-title">
            <h2>点数記録</h2>
            <div className="compact-meta">
              <span className={scoreOk ? 'badge ok' : 'badge warn'}>
                合計: {scoreReady ? scoreTotal : '未入力'}
              </span>
              {!scoreOk && scoreReady && (
                <span className="alert-inline">100000点に揃っていません</span>
              )}
            </div>
          </div>

          <div className="table-wrap">
            <table className="hand-table">
              <thead>
                <tr>
                  <th className="col-head">#</th>
                  {selectedRoom.players.map((player) => (
                    <th key={player}>{player}</th>
                  ))}
                  <th className="col-actions">操作</th>
                </tr>
                <tr className="summary-row">
                  <th className="row-label">合計</th>
                  {selectedRoom.players.map((player, index) => (
                    <th key={player}>
                      <div className="summary-cell">
                        <span>{totals[index].toFixed(1)}pt</span>
                        <span className="small">順位 {finalRanks[index]}</span>
                      </div>
                    </th>
                  ))}
                  <th></th>
                </tr>
                {feeEnabled && feeShares && (
                  <tr className="summary-row">
                    <th className="row-label">場代</th>
                    {selectedRoom.players.map((player, index) => (
                      <th key={player}>{formatAmount(feeShares[index])}</th>
                    ))}
                    <th></th>
                  </tr>
                )}
              </thead>
              <tbody>
                <tr className="input-row">
                  <td className="row-label">{editingHandId ? '編集' : '追加'}</td>
                  {selectedRoom.players.map((player, index) => (
                    <td key={player}>
                      <input
                        type="text"
                        className="score compact-input"
                        inputMode="decimal"
                        value={scoreInputs[index]}
                        onChange={(event) => {
                          const next = [...scoreInputs] as typeof scoreInputs
                          next[index] = event.target.value
                          setScoreInputs(next)
                        }}
                      />
                      {handPreview && (
                        <div className="small">
                          {handPreview.points[index].toFixed(1)}pt / {handPreview.ranks[index]}位
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="row-actions">
                    <button onClick={saveHand} disabled={!handCanSave} aria-label="保存">
                      💾
                    </button>
                  </td>
                </tr>

                {!hands.length && (
                  <tr>
                    <td colSpan={selectedRoom.players.length + 2} className="muted">
                      まだ半荘がありません。
                    </td>
                  </tr>
                )}

                {hands.map((hand, index) => {
                  const { points } = computeHandPoints(selectedRoom, hand.scores)
                  const handTotal = sumScores(hand.scores)
                  return (
                    <tr key={hand.id}>
                      <td className="row-label">{index + 1}</td>
                      {selectedRoom.players.map((player, i) => (
                        <td key={player}>
                          <div>{hand.scores[i]}</div>
                          <div className="small">{points[i].toFixed(1)}pt</div>
                        </td>
                      ))}
                      <td className="row-actions">
                        <button onClick={() => editHand(hand)} aria-label="編集">
                          ✎
                        </button>
                        <button
                          className="danger"
                          onClick={() => deleteHand(hand.id)}
                          aria-label="削除"
                        >
                          ×
                        </button>
                        {handTotal !== 100000 && (
                          <div className="small warn">合計NG</div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

export default App
