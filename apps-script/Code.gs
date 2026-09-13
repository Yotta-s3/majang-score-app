/**
 * Mahjong Score の共有API。
 * Googleスプレッドシートに紐付けた Apps Script プロジェクトへ、このファイルを貼り付けて使う。
 * 1ルームを1行のJSONとして保存し、revision で上書き競合を検知する。
 */
const SHEET_NAME = 'rooms'
const HEADERS = ['roomId', 'revision', 'updatedAt', 'payload', 'shareCode']

function getRoom(roomId) {
  try {
    if (!roomId) return { ok: false, error: 'roomId がありません。' }
    const row = findRoom(roomId)
    return row ? { ok: true, ...row } : { ok: true, roomId: roomId, revision: 0, payload: null }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
}

function getRoomByShareCode(shareCode) {
  try {
    const normalized = String(shareCode || '').trim().toUpperCase()
    if (!normalized) return { ok: false, error: '共有コードがありません。' }
    const row = findRoomByShareCode(normalized)
    return row ? { ok: true, ...row } : { ok: false, error: '共有コードに一致するルームが見つかりません。' }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
}

function saveRoom(request) {
  try {
    if (!request.roomId || !Number.isInteger(request.baseRevision) || !request.payload) return { ok: false, error: 'roomId、baseRevision、payload が必要です。' }
    if (!request.payload.room || request.payload.room.id !== request.roomId) return { ok: false, error: 'payload.room.id と roomId が一致しません。' }

    const lock = LockService.getScriptLock()
    lock.waitLock(30000)
    try {
      const existing = findRoom(request.roomId)
      const currentRevision = existing ? existing.revision : 0
      if (request.baseRevision !== currentRevision) {
        return { ok: false, code: 'conflict', error: 'ほかの端末で更新されています。', ...existing }
      }
      const shareCode = existing && existing.shareCode ? existing.shareCode : createShareCode()
      const revision = currentRevision + 1
      const updatedAt = Date.now()
      const sheet = roomsSheet()
      const values = [[request.roomId, revision, updatedAt, JSON.stringify(request.payload), shareCode]]
      if (existing) sheet.getRange(existing.rowNumber, 1, 1, HEADERS.length).setValues(values)
      else sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length).setValues(values)
      return { ok: true, roomId: request.roomId, shareCode: shareCode, revision: revision, updatedAt: updatedAt }
    } finally {
      lock.releaseLock()
    }
  } catch (error) {
    return { ok: false, error: error.message || String(error) }
  }
}

function roomsSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
  let sheet = spreadsheet.getSheetByName(SHEET_NAME)
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME)
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    sheet.setFrozenRows(1)
  }
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
  return sheet
}

function findRoom(roomId) {
  const sheet = roomsSheet()
  if (sheet.getLastRow() < 2) return null
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
  const index = rows.findIndex((row) => row[0] === roomId)
  if (index < 0) return null
  const row = rows[index]
  return { roomId: row[0], revision: Number(row[1]), updatedAt: Number(row[2]), payload: JSON.parse(row[3]), shareCode: row[4] || undefined, rowNumber: index + 2 }
}

function findRoomByShareCode(shareCode) {
  const sheet = roomsSheet()
  if (sheet.getLastRow() < 2) return null
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
  const index = rows.findIndex((row) => String(row[4] || '').toUpperCase() === shareCode)
  if (index < 0) return null
  const row = rows[index]
  return { roomId: row[0], revision: Number(row[1]), updatedAt: Number(row[2]), payload: JSON.parse(row[3]), shareCode: row[4], rowNumber: index + 2 }
}

function createShareCode() {
  // 8文字・32種類で約1.1兆通り。紛らわしい文字を除き、既存コードと重複した場合は再生成する。
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  do {
    code = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  } while (findRoomByShareCode(code))
  return code
}
