import type { HandRecord, Room, Session } from '../db'
import { computeAggregateRanks, computeFeeShares, computeHandPoints } from './scoring'

export type SessionSummary = {
  session: Session
  hands: HandRecord[]
  totals: number[]
  ranks: number[]
  feeShares: number[]
}

export const createSessionSummary = (room: Room, session: Session, hands: HandRecord[]): SessionSummary => {
  const totals = [0, 0, 0, 0]
  hands.forEach((hand) =>
    computeHandPoints(room, hand.scores, hand.tieBreakOrders).points.forEach((point, index) => {
      totals[index] += point
    }),
  )
  return {
    session,
    hands,
    totals,
    ranks: computeAggregateRanks(totals),
    feeShares: session.feeEnabled ? computeFeeShares(totals, session.feeAmount) : [0, 0, 0, 0],
  }
}
