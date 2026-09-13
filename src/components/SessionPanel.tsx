import type { Session } from '../db'
import type { SessionSummary } from '../domain/analytics'

type SessionPanelProps = {
  roomName: string
  sessions: Session[]
  summaries: SessionSummary[]
  activeSessionId: string | null
  newDate: string
  feeEnabled: boolean
  feeAmount: string
  feeValue: number | null
  onDateChange: (value: string) => void
  onFeeEnabledChange: (value: boolean) => void
  onFeeAmountChange: (value: string) => void
  onAdd: () => void
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

export const SessionPanel = ({
  roomName, sessions, summaries, activeSessionId, newDate, feeEnabled, feeAmount, feeValue,
  onDateChange, onFeeEnabledChange, onFeeAmountChange, onAdd, onSelect, onDelete,
}: SessionPanelProps) => (
  <section className="card">
    <div className="card-title">
      <h2>{roomName} の対局日</h2>
    </div>
    <div className="actions">
      <label className="field inline-field">
        日付
        <input type="date" value={newDate} onChange={(event) => onDateChange(event.target.value)} />
      </label>
      <label className="field checkbox inline-field">
        場代計算
        <input type="checkbox" checked={feeEnabled} onChange={(event) => onFeeEnabledChange(event.target.checked)} />
      </label>
      {feeEnabled && (
        <label className="field inline-field">
          場代
          <input type="number" min="1" value={feeAmount} onChange={(event) => onFeeAmountChange(event.target.value)} />
          {feeValue === null && <span className="alert-inline">場代を入力してください</span>}
        </label>
      )}
      <button onClick={onAdd} disabled={feeEnabled && feeValue === null}>対局日を追加</button>
    </div>
    <div className="session-list">
      {sessions.map((session) => {
        const summary = summaries.find((item) => item.session.id === session.id)
        return (
          <div key={session.id} className={session.id === activeSessionId ? 'session-item active' : 'session-item'}>
            <button onClick={() => onSelect(session.id)}>
              <strong>{session.date}</strong>
              <span className="small">
                {' '}{summary?.hands.length ?? 0} 半荘 / {session.feeEnabled ? `場代 ${session.feeAmount}` : '場代なし'}
              </span>
            </button>
            <button className="danger" onClick={() => onDelete(session.id)} aria-label="対局日を削除">×</button>
          </div>
        )
      })}
    </div>
  </section>
)
