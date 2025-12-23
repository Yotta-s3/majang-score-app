import Dexie, { type Table } from 'dexie'

export type UmaRuleId = '5-10' | '10-20' | '10-30'
export type OkaRuleId = 'oka20' | 'oka0'
export type TieRuleId = 'split' | 'seat'

export type Room = {
  id: string
  date: string
  players: [string, string, string, string]
  umaRule: UmaRuleId
  okaRule: OkaRuleId
  tieRule: TieRuleId
  feeEnabled: boolean
  feeAmount: number
  createdAt: number
  updatedAt: number
}

export type HandRecord = {
  id: string
  roomId: string
  scores: [number, number, number, number]
  createdAt: number
  updatedAt: number
}

class AppDB extends Dexie {
  rooms!: Table<Room, string>
  hands!: Table<HandRecord, string>
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
  }
}

export const db = new AppDB()
