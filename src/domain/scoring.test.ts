import { describe, expect, it } from 'vitest'
import type { Room } from '../db'
import { computeAggregateRanks, computeFeeShares, computeHandPoints, getTieGroups, hasSelectedTieOrder } from './scoring'

const room = (overrides: Partial<Room> = {}): Room => ({
  id: 'room-1',
  name: 'テストルーム',
  players: ['A', 'B', 'C', 'D'],
  umaRule: '10-20',
  okaRule: 'oka20',
  tieRule: 'split',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
})

describe('computeHandPoints', () => {
  it('ウマとオカを含めて通常順位のポイントを計算する', () => {
    expect(computeHandPoints(room(), [40000, 30000, 20000, 10000])).toEqual({
      ranks: [1, 2, 3, 4],
      points: [50, 10, -20, -40],
    })
  })

  it('同着ではウマとオカを対象順位で平均する', () => {
    expect(computeHandPoints(room(), [35000, 35000, 20000, 10000])).toEqual({
      ranks: [1, 1, 3, 4],
      points: [30, 30, -20, -40],
    })
  })

  it('席順同点では保存された上位順を利用する', () => {
    expect(computeHandPoints(room({ tieRule: 'seat' }), [35000, 35000, 20000, 10000], [
      { score: 35000, playerIndexes: [1, 0] },
    ])).toEqual({
      ranks: [2, 1, 3, 4],
      points: [15, 45, -20, -40],
    })
  })
})

describe('aggregate calculations', () => {
  it('通算順位は同点を同着として扱う', () => {
    expect(computeAggregateRanks([10, 10, 0, -10])).toEqual([1, 1, 3, 4])
  })

  it('場代は順位に応じて配分し、同着時は平均する', () => {
    expect(computeFeeShares([100, 100, 0, -100], 6000)).toEqual([500, 500, 2000, 3000])
  })
})

describe('hasSelectedTieOrder', () => {
  it('同点の順位が明示的に確定されるまでfalseを返す', () => {
    const [group] = getTieGroups([35000, 35000, 20000, 10000])
    expect(hasSelectedTieOrder(group, [])).toBe(false)
    expect(hasSelectedTieOrder(group, [{ score: 35000, playerIndexes: [0, 1] }])).toBe(true)
  })
})
