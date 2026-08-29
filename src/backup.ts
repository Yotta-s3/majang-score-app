import type { HandRecord, Room, Session } from './db'

export const BACKUP_FORMAT_VERSION = 1

export type BackupData = {
  format: 'mahjong-score-backup'
  version: typeof BACKUP_FORMAT_VERSION
  exportedAt: string
  rooms: Room[]
  sessions: Session[]
  hands: HandRecord[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const isString = (value: unknown): value is string => typeof value === 'string'
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const hasUniqueIds = (items: Array<{ id: string }>) => new Set(items.map((item) => item.id)).size === items.length

/** 外部から読み込むJSONを、DBを書き換える前にまとめて検証する。 */
export const parseBackup = (text: string): BackupData => {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSONファイルとして読み取れません。')
  }
  if (!isRecord(value) || value.format !== 'mahjong-score-backup' || value.version !== BACKUP_FORMAT_VERSION || !Array.isArray(value.rooms) || !Array.isArray(value.sessions) || !Array.isArray(value.hands)) {
    throw new Error('このアプリのバックアップ形式ではありません。')
  }
  const rooms = value.rooms as Room[]
  const sessions = value.sessions as Session[]
  const hands = value.hands as HandRecord[]
  const validRoom = (room: unknown): room is Room => isRecord(room) && isString(room.id) && isString(room.name) && Array.isArray(room.players) && room.players.length === 4 && room.players.every(isString) && isString(room.umaRule) && isString(room.okaRule) && isString(room.tieRule) && isNumber(room.createdAt) && isNumber(room.updatedAt)
  const validSession = (session: unknown): session is Session => isRecord(session) && isString(session.id) && isString(session.roomId) && isString(session.date) && typeof session.feeEnabled === 'boolean' && isNumber(session.feeAmount) && isNumber(session.createdAt) && isNumber(session.updatedAt)
  const validHand = (hand: unknown): hand is HandRecord => isRecord(hand) && isString(hand.id) && isString(hand.roomId) && isString(hand.sessionId) && Array.isArray(hand.scores) && hand.scores.length === 4 && hand.scores.every(isNumber) && isNumber(hand.createdAt) && isNumber(hand.updatedAt)
  if (!rooms.every(validRoom) || !sessions.every(validSession) || !hands.every(validHand) || !hasUniqueIds(rooms) || !hasUniqueIds(sessions) || !hasUniqueIds(hands)) {
    throw new Error('バックアップ内容が不完全か、IDが重複しています。')
  }
  const roomIds = new Set(rooms.map((room) => room.id))
  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  if (sessions.some((session) => !roomIds.has(session.roomId)) || hands.some((hand) => !roomIds.has(hand.roomId) || sessionById.get(hand.sessionId)?.roomId !== hand.roomId)) {
    throw new Error('ルーム・対局日・半荘の関連付けが不正です。')
  }
  return { format: 'mahjong-score-backup', version: BACKUP_FORMAT_VERSION, exportedAt: isString(value.exportedAt) ? value.exportedAt : new Date().toISOString(), rooms, sessions, hands }
}
