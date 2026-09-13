import type { OkaRuleId, Room, TieRuleId, UmaRuleId } from '../db'
import { OKA_RULES, TIE_RULES, UMA_RULES } from '../domain/scoring'

type RoomFormProps = {
  name: string
  players: Room['players']
  uma: UmaRuleId
  oka: OkaRuleId
  tie: TieRuleId
  canSave: boolean
  onNameChange: (name: string) => void
  onPlayersChange: (players: Room['players']) => void
  onUmaChange: (uma: UmaRuleId) => void
  onOkaChange: (oka: OkaRuleId) => void
  onTieChange: (tie: TieRuleId) => void
  onSave: () => void
  onClear: () => void
}

export const RoomForm = ({
  name, players, uma, oka, tie, canSave,
  onNameChange, onPlayersChange, onUmaChange, onOkaChange, onTieChange, onSave, onClear,
}: RoomFormProps) => (
  <section className="card">
    <div className="card-title">
      <h2>ルーム作成</h2>
    </div>
    <div className="grid">
      <label className="field">
        ルーム名
        <input value={name} onChange={(event) => onNameChange(event.target.value)} placeholder="例: 金曜麻雀" />
      </label>
      <div className="grid">
        {players.map((player, index) => (
          <label key={index} className="field">
            プレイヤー{index + 1}
            <input
              className="name"
              value={player}
              onChange={(event) => {
                const next = [...players] as Room['players']
                next[index] = event.target.value
                onPlayersChange(next)
              }}
            />
          </label>
        ))}
      </div>
      <label className="field">
        ウマ
        <select value={uma} onChange={(event) => onUmaChange(event.target.value as UmaRuleId)}>
          {UMA_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
        </select>
      </label>
      <label className="field">
        オカ
        <select value={oka} onChange={(event) => onOkaChange(event.target.value as OkaRuleId)}>
          {OKA_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
        </select>
      </label>
      <label className="field">
        同点処理
        <select value={tie} onChange={(event) => onTieChange(event.target.value as TieRuleId)}>
          {TIE_RULES.map((rule) => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
        </select>
      </label>
    </div>
    <div className="actions">
      <button onClick={onSave} disabled={!canSave}>ルームを作成</button>
      <button className="ghost" onClick={onClear}>クリア</button>
    </div>
  </section>
)
