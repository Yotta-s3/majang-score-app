type SyncPanelProps = {
  revision: number
  isSyncing: boolean
  message: string
  onSave: () => Promise<void>
  onLoad: () => Promise<void>
}

export const SyncPanel = ({ revision, isSyncing, message, onSave, onLoad }: SyncPanelProps) => (
  <section className="card">
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
    {message && <p className="small">{message}</p>}
  </section>
)
