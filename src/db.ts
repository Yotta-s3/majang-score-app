import Dexie, { type Table } from 'dexie'

export type UmaRuleId = '5-10' | '10-20' | '10-30'
export type OkaRuleId = 'oka20' | 'oka0'
export type TieRuleId = 'split' | 'seat'

export type Room = {
  id: string
  shareCode?: string
  /** v2 の対局日。v3 以降は Session.date を使用する。 */
  date?: string
  name: string
  players: [string, string, string, string]
  umaRule: UmaRuleId
  okaRule: OkaRuleId
  tieRule: TieRuleId
  /** v3 までの room 単位の場代。v4 以降は Session に移行する。 */
  feeEnabled?: boolean
  feeAmount?: number
  createdAt: number
  updatedAt: number
}

export type Session = {
  id: string
  roomId: string
  date: string
  feeEnabled: boolean
  feeAmount: number
  createdAt: number
  updatedAt: number
}

export type TieBreakOrder = {
  score: number
  /** 同点グループ内で上位から並べた player index */
  playerIndexes: number[]
}

export type HandRecord = {
  id: string
  roomId: string
  sessionId: string
  scores: [number, number, number, number]
  tieBreakOrders?: TieBreakOrder[]
  createdAt: number
  updatedAt: number
}

export type SyncState = {
  roomId: string
  revision: number
  updatedAt: number
}

class AppDB extends Dexie {
  rooms!: Table<Room, string>
  sessions!: Table<Session, string>
  hands!: Table<HandRecord, string>
  syncStates!: Table<SyncState, string>
  records!: Table<unknown, string>

  constructor() {
    super('mahjong-score-db')
    this.version(1).stores({
      records: 'id, date, createdAt',
    })
    this.version(2).stores({
      rooms: 'id, date, createdAt',
      hands: 'id, roomId, createdAt',
      records: 'id, date, createdAt',
    })
    this.version(3)
      .stores({
        rooms: 'id, date, createdAt',
        sessions: 'id, roomId, date, createdAt',
        hands: 'id, roomId, sessionId, createdAt',
        records: 'id, date, createdAt',
      })
      .upgrade(async (transaction) => {
        const roomTable = transaction.table('rooms') as Table<Room, string>
        const sessionTable = transaction.table('sessions') as Table<Session, string>
        const handTable = transaction.table('hands') as Table<HandRecord, string>
        const rooms = await roomTable.toArray()

        for (const room of rooms) {
          const now = room.updatedAt ?? room.createdAt ?? Date.now()
          const sessionId = `migration-session-${room.id}`
          await roomTable.put({
            ...room,
            name: room.name?.trim() || room.players?.join(' / ') || '名称未設定ルーム',
            updatedAt: now,
          })
          await sessionTable.put({
            id: sessionId,
            roomId: room.id,
            date: room.date || new Date(now).toISOString().slice(0, 10),
            feeEnabled: room.feeEnabled ?? false,
            feeAmount: room.feeAmount ?? 0,
            createdAt: room.createdAt ?? now,
            updatedAt: now,
          })

          const hands = await handTable.where('roomId').equals(room.id).toArray()
          await Promise.all(hands.map((hand) => handTable.put({ ...hand, sessionId })))
        }
      })
    this.version(4)
      .stores({
        rooms: 'id, date, createdAt',
        sessions: 'id, roomId, date, createdAt',
        hands: 'id, roomId, sessionId, createdAt',
        records: 'id, date, createdAt',
      })
      .upgrade(async (transaction) => {
        const roomTable = transaction.table('rooms') as Table<Room, string>
        const sessionTable = transaction.table('sessions') as Table<Session, string>
        const rooms = await roomTable.toArray()
        const roomById = new Map(rooms.map((room) => [room.id, room]))
        const sessions = await sessionTable.toArray()
        await Promise.all(sessions.map((session) => {
          const room = roomById.get(session.roomId)
          return sessionTable.put({
            ...session,
            feeEnabled: session.feeEnabled ?? room?.feeEnabled ?? false,
            feeAmount: session.feeAmount ?? room?.feeAmount ?? 0,
          })
        }))
      })
    this.version(5).stores({
      rooms: 'id, date, createdAt',
      sessions: 'id, roomId, date, createdAt',
      hands: 'id, roomId, sessionId, createdAt',
      syncStates: 'roomId, updatedAt',
      records: 'id, date, createdAt',
    })
  }
}

export const db = new AppDB()
