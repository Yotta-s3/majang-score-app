import type { Room } from '../db'
import { getOkaRule, getUmaRule } from '../domain/scoring'

type RoomListProps = {
  rooms: Room[]
  isLoading: boolean
  error: string | null
  activeRoomId: string | null
  latestDate: (roomId: string) => string | undefined
  onSelect: (roomId: string) => void
  onDelete: (roomId: string) => void
}

export const RoomList = ({ rooms, isLoading, error, activeRoomId, latestDate, onSelect, onDelete }: RoomListProps) => (
  <section className="card">
    <div className="card-title">
      <h2>ルーム一覧</h2>
    </div>
    {isLoading && <p className="muted" role="status">ルームを読み込んでいます…</p>}
    {error && <p className="error-message" role="alert">ルームを読み込めませんでした。再読み込みしてください。</p>}
    {!isLoading && !error && !rooms.length && <p className="muted">まだルームがありません。</p>}
    <div className="room-list">
      {rooms.map((room) => (
        <div key={room.id} className="room-item">
          <button
            className={room.id === activeRoomId ? 'room-button active' : 'room-button'}
            onClick={() => onSelect(room.id)}
          >
            <div>{room.name}</div>
            <div className="small">{room.players.join(' / ')}</div>
            <div className="small">最新対局日: {latestDate(room.id) ?? 'なし'}</div>
            <div className="small">
              {getUmaRule(room.umaRule).label} / {getOkaRule(room.okaRule).label}
            </div>
          </button>
          <button className="danger room-delete" onClick={() => onDelete(room.id)} aria-label="ルーム削除">
            ×
          </button>
        </div>
      ))}
    </div>
  </section>
)
