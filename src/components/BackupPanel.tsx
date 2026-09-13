import { useRef, type ChangeEvent } from 'react'

type BackupPanelProps = {
  message: string
  onExport: () => Promise<void>
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

export const BackupPanel = ({ message, onExport, onImport }: BackupPanelProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="card">
      <div className="card-title">
        <h2>バックアップ</h2>
      </div>
      <div className="actions">
        <button className="ghost" onClick={() => void onExport()}>
          選択中のルームをJSONに書き出す
        </button>
        <button className="ghost" onClick={() => inputRef.current?.click()}>
          JSONを取り込む
        </button>
        <input
          ref={inputRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => void onImport(event)}
        />
      </div>
      {message && <p className="small">{message}</p>}
    </section>
  )
}
