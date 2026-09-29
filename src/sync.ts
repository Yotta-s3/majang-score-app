import type { SyncResult, SyncService } from './services/syncService'

const OAUTH_CLIENT_ID = '337512582300-q42rkonc42elpbgjjnloll2a37sf95cv.apps.googleusercontent.com'
const SCRIPT_ID = '1Xfh4GZH3cIZX3PaUkUOU5Pgq--vCMKNOl8fa7uq2cY5tWnOOEl6OshyI'
const SCOPES = 'https://www.googleapis.com/auth/spreadsheets.currentonly'

type TokenResponse = { access_token?: string; error?: string; error_description?: string }
type TokenClient = { requestAccessToken: (options?: { prompt?: '' | 'consent' }) => void }
declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (config: { client_id: string; scope: string; callback: (response: TokenResponse) => void }) => TokenClient } } } } }

const token = () => new Promise<string>((resolve, reject) => {
  if (!window.google?.accounts.oauth2) { reject(new Error('Googleログインの準備中です。数秒待ってから再試行してください。')); return }
  const client = window.google.accounts.oauth2.initTokenClient({ client_id: OAUTH_CLIENT_ID, scope: SCOPES, callback: (response) => response.access_token ? resolve(response.access_token) : reject(new Error(response.error_description ?? response.error ?? 'Googleログインを完了できませんでした。')) })
  client.requestAccessToken({ prompt: 'consent' })
})

const run = async (functionName: 'getRoom' | 'getRoomByShareCode' | 'saveRoom', parameters: unknown[]): Promise<SyncResult> => {
  const response = await fetch(`https://script.googleapis.com/v1/scripts/${SCRIPT_ID}:run`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ function: functionName, parameters }) })
  const body = await response.json() as { response?: { result?: SyncResult }; error?: { message?: string } }
  if (!response.ok || body.error) throw new Error(body.error?.message ?? `通信に失敗しました (${response.status})。`)
  if (!body.response?.result) throw new Error('Apps Scriptから有効な応答が返りませんでした。')
  return body.response.result
}

export const gasSyncService: SyncService = {
  getRoom: (roomId) => run('getRoom', [roomId]),
  getRoomByShareCode: (shareCode) => run('getRoomByShareCode', [shareCode]),
  saveRoom: (roomId, baseRevision, payload) =>
    run('saveRoom', [{ roomId, baseRevision, payload }]),
}
