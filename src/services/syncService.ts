import type { HandRecord, Room, Session } from '../db'
import { supabaseSyncService } from './supabaseSyncService'

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

export const syncService: SyncService = supabaseSyncService
