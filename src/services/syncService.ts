import type { HandRecord, Room, Session } from '../db'
import { gasSyncService } from '../sync'
import { supabaseSyncService } from './supabaseSyncService'
import { isSupabaseConfigured } from './supabaseClient'

export type RoomSyncPayload = {
  room: Room
  sessions: Session[]
  hands: HandRecord[]
}

export type SyncResult = {
  ok: boolean
  error?: string
  code?: 'conflict'
  roomId?: string
  shareCode?: string
  revision?: number
  updatedAt?: number
  payload?: RoomSyncPayload | null
}

export type SyncService = {
  getRoom: (roomId: string) => Promise<SyncResult>
  getRoomByShareCode: (shareCode: string) => Promise<SyncResult>
  saveRoom: (roomId: string, baseRevision: number, payload: RoomSyncPayload) => Promise<SyncResult>
}

// 接続情報を設定した環境だけSupabaseを使う。未設定の公開版は移行完了までGASを使い続ける。
export const syncService: SyncService = isSupabaseConfigured ? supabaseSyncService : gasSyncService
