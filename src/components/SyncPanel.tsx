import { useState } from 'react'

type SyncPanelProps = {
  revision: number
  shareCode?: string
  isSyncing: boolean
  message: string
  onSave: () => Promise<void>
  onLoad: () => Promise<void>
}

export const SyncPanel = ({ revision, shareCode, isSyncing, message, onSave, onLoad }: SyncPanelProps) => {
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
    <p className="small">
      同期リビジョン: {revision}。競合時は上書きせず停止します。
    </p>
    {shareCode && <div className="share-code"><span className="small">共有コード: <strong>{shareCode}</strong></span><button className="ghost" onClick={() => void copyShareCode()}>コピー</button></div>}
    {copyMessage && <p className="small">{copyMessage}</p>}
    {message && <p className="small">{message}</p>}
  </section>
}
