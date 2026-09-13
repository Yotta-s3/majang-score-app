import type { OkaRuleId, Room, TieBreakOrder, TieRuleId, UmaRuleId } from '../db'

export const UMA_RULES: Array<{
  id: UmaRuleId
  label: string
  bonuses: [number, number, number, number]
}> = [
  { id: '5-10', label: 'ゴットー (5-10)', bonuses: [10, 5, -5, -10] },
  { id: '10-20', label: 'ワンツー (10-20)', bonuses: [20, 10, -10, -20] },
  { id: '10-30', label: 'ワンスリー (10-30)', bonuses: [30, 10, -10, -30] },
]

export const OKA_RULES: Array<{
  id: OkaRuleId
  label: string
  base: number
  oka: number
}> = [
  { id: 'oka20', label: 'オカあり (25000持ち/30000返し +20)', base: 30000, oka: 20 },
  { id: 'oka0', label: 'オカなし (25000持ち/25000返し)', base: 25000, oka: 0 },
]

export const TIE_RULES: Array<{ id: TieRuleId; label: string }> = [
  { id: 'split', label: '同点は同着' },
  { id: 'seat', label: '同点は席順' },
]

export type TieGroup = { score: number; playerIndexes: number[] }

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
export const getUmaRule = (id: UmaRuleId) => UMA_RULES.find((rule) => rule.id === id) ?? UMA_RULES[0]
export const getOkaRule = (id: OkaRuleId) => OKA_RULES.find((rule) => rule.id === id) ?? OKA_RULES[0]

export const getTieGroups = (scores: number[]): TieGroup[] => {
  const groups = new Map<number, number[]>()
  scores.forEach((score, index) => groups.set(score, [...(groups.get(score) ?? []), index]))
  return [...groups.entries()]
    .filter(([, playerIndexes]) => playerIndexes.length > 1)
    .map(([score, playerIndexes]) => ({ score, playerIndexes }))
}

export const resolveTieOrder = (group: TieGroup, orders?: TieBreakOrder[]) => {
  const saved = orders?.find((order) => order.score === group.score)?.playerIndexes
  return saved && saved.length === group.playerIndexes.length && saved.every((index) => group.playerIndexes.includes(index))
    ? saved
    : group.playerIndexes
}

export const hasSelectedTieOrder = (group: TieGroup, orders?: TieBreakOrder[]) => {
  const saved = orders?.find((order) => order.score === group.score)?.playerIndexes
  return Boolean(saved && saved.length === group.playerIndexes.length && saved.every((index) => group.playerIndexes.includes(index)))
}

export const computeHandPoints = (room: Room, scores: number[], tieBreakOrders?: TieBreakOrder[]) => {
  const uma = getUmaRule(room.umaRule)
  const oka = getOkaRule(room.okaRule)
  const tieOrderByPlayer = new Map<number, number>()
  getTieGroups(scores).forEach((group) =>
    resolveTieOrder(group, tieBreakOrders).forEach((player, position) => tieOrderByPlayer.set(player, position)),
  )
  const items = scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score !== a.score ? b.score - a.score : (tieOrderByPlayer.get(a.index) ?? a.index) - (tieOrderByPlayer.get(b.index) ?? b.index))
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
      group.forEach((item) => {
        ranks[item.index] = start + 1
        bonuses[item.index] = bonus
      })
      position += group.length
    }
  }

  return {
    ranks,
    points: scores.map((score, index) => (score - oka.base) / 1000 + bonuses[index]),
  }
}

/** 通算・日別成績は席順を使わず、同点を同着として扱う。 */
export const computeAggregateRanks = (totals: number[]) => {
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

export const computeFeeShares = (totals: number[], amount: number) => {
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
