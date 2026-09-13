import { useRef, type ChangeEvent } from 'react'

type RoomAddPanelProps = {
  message: string
  onCreate: () => void
  onJoin: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => Promise<void>
}

export const RoomAddPanel = ({ message, onCreate, onJoin, onImport }: RoomAddPanelProps) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <section className="card">
      <div className="card-title"><h2>ルームを追加</h2></div>
      <div className="actions">
        <button onClick={() => inputRef.current?.click()}>JSONを取り込む</button>
        <button className="ghost" onClick={onCreate}>新規にルーム作成</button>
        <button className="ghost" onClick={onJoin}>共有コードで参加</button>
        <input ref={inputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => void onImport(event)} />
      </div>
      {message && <p className="small">{message}</p>}
    </section>
  )
}
