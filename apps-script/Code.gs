/**
 * Mahjong Score の共有API。
 * Googleスプレッドシートに紐付けた Apps Script プロジェクトへ、このファイルを貼り付けて使う。
 * 1ルームを1行のJSONとして保存し、revision で上書き競合を検知する。
 */
const SHEET_NAME = 'rooms'
const HEADERS = ['roomId', 'revision', 'updatedAt', 'payload']

function getRoom(roomId) {
  try {
    if (!roomId) return { ok: false, error: 'roomId がありません。' }
    const row = findRoom(roomId)
    return row ? { ok: true, ...row } : { ok: true, roomId: roomId, revision: 0, payload: null }
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
      const revision = currentRevision + 1
      const updatedAt = Date.now()
      const sheet = roomsSheet()
      const values = [[request.roomId, revision, updatedAt, JSON.stringify(request.payload)]]
      if (existing) sheet.getRange(existing.rowNumber, 1, 1, HEADERS.length).setValues(values)
      else sheet.getRange(sheet.getLastRow() + 1, 1, 1, HEADERS.length).setValues(values)
      return { ok: true, roomId: request.roomId, revision: revision, updatedAt: updatedAt }
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
  return sheet
}

function findRoom(roomId) {
  const sheet = roomsSheet()
  if (sheet.getLastRow() < 2) return null
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, HEADERS.length).getValues()
  const index = rows.findIndex((row) => row[0] === roomId)
  if (index < 0) return null
  const row = rows[index]
  return { roomId: row[0], revision: Number(row[1]), updatedAt: Number(row[2]), payload: JSON.parse(row[3]), rowNumber: index + 2 }
}
