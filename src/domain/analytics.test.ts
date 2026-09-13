import { describe, expect, it } from 'vitest'
import type { Room, Session } from '../db'
import { createSessionSummary } from './analytics'

const room: Room = {
  id: 'room-1', name: 'テストルーム', players: ['A', 'B', 'C', 'D'],
  umaRule: '10-20', okaRule: 'oka20', tieRule: 'split', createdAt: 0, updatedAt: 0,
}
const session: Session = {
  id: 'session-1', roomId: room.id, date: '2026-09-13', feeEnabled: true, feeAmount: 6000, createdAt: 0, updatedAt: 0,
}

describe('createSessionSummary', () => {
  it('半荘を合算し、日計順位と場代を返す', () => {
    const summary = createSessionSummary(room, session, [
      { id: 'hand-1', roomId: room.id, sessionId: session.id, scores: [40000, 30000, 20000, 10000], createdAt: 0, updatedAt: 0 },
      { id: 'hand-2', roomId: room.id, sessionId: session.id, scores: [10000, 20000, 30000, 40000], createdAt: 0, updatedAt: 0 },
    ])

    expect(summary.totals).toEqual([10, -10, -10, 10])
    expect(summary.ranks).toEqual([1, 3, 3, 1])
    expect(summary.feeShares).toEqual([500, 2500, 2500, 500])
  })
})
