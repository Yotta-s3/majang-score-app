import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseName = 'mahjong-score-db'

const createVersion2Database = () => {
  const legacy = new Dexie(databaseName)
  legacy.version(1).stores({ records: 'id, date, createdAt' })
  legacy.version(2).stores({
    rooms: 'id, date, createdAt',
    hands: 'id, roomId, createdAt',
    records: 'id, date, createdAt',
  })
  return legacy
}

describe('IndexedDB migration', () => {
  beforeAll(async () => {
    await Dexie.delete(databaseName)
  })

  afterAll(async () => {
    const { db } = await import('./db')
    db.close()
    await Dexie.delete(databaseName)
  })

  it('v2のRoomとHandをSession付きの現行schemaへ移行する', async () => {
    const legacy = createVersion2Database()
    await legacy.open()
    await legacy.table('rooms').add({
      id: 'room-1', date: '2026-09-01', players: ['A', 'B', 'C', 'D'],
      umaRule: '10-20', okaRule: 'oka20', tieRule: 'split', feeEnabled: true, feeAmount: 1200,
      createdAt: 100, updatedAt: 200,
    })
    await legacy.table('hands').add({
      id: 'hand-1', roomId: 'room-1', scores: [25000, 25000, 25000, 25000], createdAt: 150, updatedAt: 150,
    })
    legacy.close()

    const { db } = await import('./db')
    await db.open()

    const room = await db.rooms.get('room-1')
    const session = await db.sessions.get('migration-session-room-1')
    const hand = await db.hands.get('hand-1')

    expect(room).toMatchObject({ id: 'room-1', name: 'A / B / C / D' })
    expect(session).toMatchObject({
      id: 'migration-session-room-1', roomId: 'room-1', date: '2026-09-01', feeEnabled: true, feeAmount: 1200,
    })
    expect(hand).toMatchObject({ roomId: 'room-1', sessionId: 'migration-session-room-1' })
  })
})
