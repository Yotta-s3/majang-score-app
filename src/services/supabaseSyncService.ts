import type { HandRecord, Room, Session, TieBreakOrder } from '../db'
import type { RoomSyncPayload, SyncResult, SyncService } from './syncService'
import { ensureAnonymousSession, supabase } from './supabaseClient'

type RemoteHand = {
  id: string
  session_id: string
  scores: number[]
  tie_break_orders: TieBreakOrder[] | null
  created_at: string
  updated_at: string
}

type RemoteSession = {
  id: string
  date: string
  fee_enabled: boolean
  fee_amount: number
  created_at: string
  updated_at: string
  hands: RemoteHand[] | null
}

type RemoteRoom = {
  id: string
  share_code: string
  name: string
  players: string[]
  uma_rule: Room['umaRule']
  oka_rule: Room['okaRule']
  tie_rule: Room['tieRule']
  fee_enabled: boolean
  fee_amount: number
  revision: number
  created_at: string
  updated_at: string
  sessions: RemoteSession[] | null
}

const timestamp = (value: string) => {
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? Date.now() : parsed
}

const asPlayers = (players: string[]): Room['players'] => {
  if (players.length !== 4) throw new Error('サーバーのプレイヤー設定が不正です。')
  return [players[0], players[1], players[2], players[3]]
}

const toPayload = (remote: RemoteRoom): RoomSyncPayload => {
  const sessions = remote.sessions ?? []
  return {
    room: {
      id: remote.id,
      shareCode: remote.share_code,
      name: remote.name,
      players: asPlayers(remote.players),
      umaRule: remote.uma_rule,
      okaRule: remote.oka_rule,
      tieRule: remote.tie_rule,
      feeEnabled: remote.fee_enabled,
      feeAmount: Number(remote.fee_amount),
      createdAt: timestamp(remote.created_at),
      updatedAt: timestamp(remote.updated_at),
    },
    sessions: sessions.map((session): Session => ({
      id: session.id,
      roomId: remote.id,
      date: session.date,
      feeEnabled: session.fee_enabled,
      feeAmount: Number(session.fee_amount),
      createdAt: timestamp(session.created_at),
      updatedAt: timestamp(session.updated_at),
    })),
    hands: sessions.flatMap((session) =>
      (session.hands ?? []).map((hand): HandRecord => ({
        id: hand.id,
        roomId: remote.id,
        sessionId: hand.session_id,
        scores: [hand.scores[0], hand.scores[1], hand.scores[2], hand.scores[3]],
        tieBreakOrders: hand.tie_break_orders ?? undefined,
        createdAt: timestamp(hand.created_at),
        updatedAt: timestamp(hand.updated_at),
      })),
    ),
  }
}

const errorResult = (error: { message: string; code?: string }): SyncResult => ({
  ok: false,
  code: error.code === 'P0001' && error.message === 'room conflict' ? 'conflict' : undefined,
  error: error.message,
})

const connectionError = (error: unknown) => {
  if (error instanceof Error && error.name === 'AbortError') {
    return 'サーバーからの応答がタイムアウトしました。通信状況を確認して再試行してください。'
  }
  return error instanceof Error ? error.message : 'サーバーへ接続できませんでした。'
}

const getRoom = async (roomId: string): Promise<SyncResult> => {
  try {
    await ensureAnonymousSession()
    if (!supabase) throw new Error('Supabaseの接続情報が設定されていません。')
    const { data, error } = await supabase
      .from('rooms')
      .select('id, share_code, name, players, uma_rule, oka_rule, tie_rule, fee_enabled, fee_amount, revision, created_at, updated_at, sessions (id, date, fee_enabled, fee_amount, created_at, updated_at, hands (id, session_id, scores, tie_break_orders, created_at, updated_at))')
      .eq('id', roomId)
      .maybeSingle()
    if (error) return errorResult(error)
    if (!data) return { ok: true, roomId, revision: 0, payload: null }

    const remote = data as RemoteRoom
    return {
      ok: true,
      roomId: remote.id,
      shareCode: remote.share_code,
      revision: remote.revision,
      updatedAt: timestamp(remote.updated_at),
      payload: toPayload(remote),
    }
  } catch (error) {
    return { ok: false, error: connectionError(error) }
  }
}

export const supabaseSyncService: SyncService = {
  getRoom,
  getRoomByShareCode: async (shareCode) => {
    try {
      await ensureAnonymousSession()
      if (!supabase) throw new Error('Supabaseの接続情報が設定されていません。')
      const { data, error } = await supabase.rpc('join_room_by_share_code', {
        input_share_code: shareCode,
      })
      if (error) return errorResult(error)
      if (!data) return { ok: false, error: '共有コードに一致するルームが見つかりません。' }
      return getRoom(String(data))
    } catch (error) {
      return { ok: false, error: connectionError(error) }
    }
  },
  saveRoom: async (roomId, baseRevision, payload) => {
    try {
      await ensureAnonymousSession()
      if (!supabase) throw new Error('Supabaseの接続情報が設定されていません。')
      const { data, error } = await supabase.rpc('save_room_snapshot', {
        p_room: { ...payload.room, id: roomId },
        p_sessions: payload.sessions,
        p_hands: payload.hands,
        p_base_revision: baseRevision,
      })
      if (error) return errorResult(error)
      const result = Array.isArray(data) ? data[0] : data
      if (!result) return { ok: false, error: 'サーバーから保存結果を取得できませんでした。' }
      const saved = result as {
        room_id: string
        share_code: string
        revision: number
        updated_at: number
      }
      return {
        ok: true,
        roomId: saved.room_id,
        shareCode: saved.share_code,
        revision: Number(saved.revision),
        updatedAt: Number(saved.updated_at),
      }
    } catch (error) {
      return { ok: false, error: connectionError(error) }
    }
  },
}
