import { useState } from 'react'

type SyncPanelProps = {
  shareCode?: string
  lastSyncedAt?: number
  isSyncing: boolean
  message: string
  onSave: () => Promise<void>
  onLoad: () => Promise<void>
}

const formatSyncedAt = (timestamp: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(timestamp)

export const SyncPanel = ({ shareCode, lastSyncedAt, isSyncing, message, onSave, onLoad }: SyncPanelProps) => {
  const [copyMessage, setCopyMessage] = useState('')
  const copyShareCode = async () => {
    if (!shareCode) return
    try {
      await navigator.clipboard.writeText(shareCode)
      setCopyMessage('コピーしました。')
    } catch {
      setCopyMessage('コピーできませんでした。コードを長押ししてコピーしてください。')
    }
  }

  return <section className="card">
    <div className="card-title">
      <h2>データ共有</h2>
    </div>
    <div className="actions">
      <button onClick={() => void onSave()} disabled={isSyncing}>
        サーバーへ保存
      </button>
      <button className="ghost" onClick={() => void onLoad()} disabled={isSyncing}>
        サーバーから取得
      </button>
    </div>
    {shareCode && <div className="share-code"><span className="small">共有コード: <strong>{shareCode}</strong></span><button className="ghost" onClick={() => void copyShareCode()}>コピー</button></div>}
    {lastSyncedAt && <p className="small">最終同期: {formatSyncedAt(lastSyncedAt)}</p>}
    {copyMessage && <p className="small">{copyMessage}</p>}
    {isSyncing && <p className="small" role="status">同期しています…</p>}
    {message && <p className="small" role={message.includes('できません') ? 'alert' : undefined}>{message}</p>}
  </section>
}
