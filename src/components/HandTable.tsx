import type { HandRecord, Room } from '../db'
import type { SessionSummary } from '../domain/analytics'
import { computeHandPoints } from '../domain/scoring'

type HandTableProps = {
  room: Room
  summary?: SessionSummary
  feeEnabled: boolean
  hands: HandRecord[]
  editingHandId: string | null
  scoreInputs: [string, string, string, string]
  scoreOk: boolean
  handPreview?: { points: number[]; ranks: number[] }
  onScoreInputsChange: (scores: [string, string, string, string]) => void
  onSave: () => void
  onEdit: (hand: HandRecord) => void
  onDelete: (handId: string) => void
  formatAmount: (value: number) => string
}

export const HandTable = ({
  room, summary, feeEnabled, hands, editingHandId, scoreInputs, scoreOk, handPreview,
  onScoreInputsChange, onSave, onEdit, onDelete, formatAmount,
}: HandTableProps) => (
  <div className="table-wrap">
    <table className="hand-table">
      <thead>
        <tr><th className="col-head">#</th>{room.players.map((player) => <th key={player}>{player}</th>)}<th className="col-actions">操作</th></tr>
        {summary && <tr className="summary-row"><th className="row-label">日計</th>{room.players.map((player, index) => <th key={player}><div className="summary-cell"><span>{summary.totals[index].toFixed(1)}pt</span><span className="small">順位 {summary.ranks[index]}</span></div></th>)}<th /></tr>}
        {summary && feeEnabled && <tr className="summary-row"><th className="row-label">場代</th>{room.players.map((player, index) => <th key={player}>{formatAmount(summary.feeShares[index])}</th>)}<th /></tr>}
      </thead>
      <tbody>
        <tr className="input-row">
          <td className="row-label">{editingHandId ? '編集' : '追加'}</td>
          {room.players.map((player, index) => <td key={player}><div className="score-input-with-suffix"><input type="text" className="score compact-input" inputMode="numeric" placeholder="250" aria-label={`${player}の点数（末尾00省略）`} value={scoreInputs[index]} onChange={(event) => { const next = [...scoreInputs] as typeof scoreInputs; next[index] = event.target.value; onScoreInputsChange(next) }} /><span aria-hidden="true">00</span></div>{handPreview && <div className="small score-result"><span>{handPreview.points[index].toFixed(1)}pt</span><span>{handPreview.ranks[index]}位</span></div>}</td>)}
          <td className="row-actions"><button onClick={onSave} disabled={!scoreOk} aria-label="保存">💾</button></td>
        </tr>
        {!hands.length && <tr><td colSpan={6} className="muted">まだ半荘がありません。</td></tr>}
        {hands.map((hand, index) => {
          const result = computeHandPoints(room, hand.scores, hand.tieBreakOrders)
          return <tr key={hand.id}><td className="row-label">{index + 1}</td>{room.players.map((player, playerIndex) => <td key={player}><div>{hand.scores[playerIndex]}</div><div className="small score-result"><span>{result.points[playerIndex].toFixed(1)}pt</span><span>{result.ranks[playerIndex]}位</span></div></td>)}<td className="row-actions"><button onClick={() => onEdit(hand)} aria-label="編集">✎</button><button className="danger" onClick={() => onDelete(hand.id)} aria-label="削除">×</button></td></tr>
        })}
      </tbody>
    </table>
  </div>
)
