import { describe, expect, it } from 'vitest'
import { parseBackup } from './backup'

const validBackup = () => ({
  format: 'mahjong-score-backup',
  version: 1,
  exportedAt: '2026-09-13T00:00:00.000Z',
  rooms: [{
    id: 'room-1', name: 'テストルーム', players: ['A', 'B', 'C', 'D'],
    umaRule: '10-20', okaRule: 'oka20', tieRule: 'split', createdAt: 1, updatedAt: 1,
  }],
  sessions: [{
    id: 'session-1', roomId: 'room-1', date: '2026-09-13', feeEnabled: false, feeAmount: 0, createdAt: 1, updatedAt: 1,
  }],
  hands: [{
    id: 'hand-1', roomId: 'room-1', sessionId: 'session-1', scores: [25000, 25000, 25000, 25000], createdAt: 1, updatedAt: 1,
  }],
})

describe('parseBackup', () => {
  it('親子関係が正しいバックアップを読み込む', () => {
    const backup = validBackup()
    expect(parseBackup(JSON.stringify(backup))).toMatchObject(backup)
  })

  it('JSONではない入力を拒否する', () => {
    expect(() => parseBackup('not json')).toThrow('JSONファイルとして読み取れません。')
  })

  it('ID重複を拒否する', () => {
    const backup = validBackup()
    backup.rooms.push({ ...backup.rooms[0] })
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('バックアップ内容が不完全か、IDが重複しています。')
  })

  it('存在しないSessionを参照するHandを拒否する', () => {
    const backup = validBackup()
    backup.hands[0].sessionId = 'missing-session'
    expect(() => parseBackup(JSON.stringify(backup))).toThrow('ルーム・対局日・半荘の関連付けが不正です。')
  })
})
