# 改修・引き継ぎメモ

## 現行のデータモデル

- Dexie schema: version 4
- 階層: `room -> session -> hand`
- `Room`: room 名、4人のプレイヤー、ウマ、オカ、同点処理
- `Session`: 対局日、場代設定
- `HandRecord`: `roomId`、`sessionId`、4人の素点、必要時の `tieBreakOrders`

既存データを消さないことが最優先。schema 変更時は version を追加し、migration を書く。

- v2 -> v3: 既存 room ごとに session を1件生成し、既存 hand を紐付ける
- v3 -> v4: 旧 room 単位の場代を session 単位へ移行する

## 実装済み仕様

- room 作成後も room 名・プレイヤー名を編集できる
- 1つの room に複数の session（対局日）を追加できる
- 点数入力は末尾の `00` を省略する。例: `250` は `25000点`
- 保存済み hand に `ポイント / 順位` を表示する
- `seat` 同点時は、hand ごとに同点者の上位順を指定して `tieBreakOrders` に保存する
- 点数記録表には session の日計（合計ポイント・順位）を表示する
- 場代は session ごとに設定する。通算成績の総場代列は表示切替式

## 通算成績の定義

- 総得点 / 総収支: 全 session のポイント合計。場代は差し引かない
- 平均得点: session ごとの合計ポイントの平均
- 平均順位・順位分布: hand ごとの順位を母数にする
- 飛び率: 入力素点が `0点未満` の hand の割合
- 日別総合ポイントの推移: session 内の hand ポイント合計を、非累積の折れ線グラフで表示する
- グラフは1人を選択して強調でき、他プレイヤーの線を薄くする

以下は不要。再実装しないこと。

- 日別小計の独立パネル
- 総半荘数、トップ率、ラス率
- room 単位の場代
- 累積収支または日別順位の推移グラフ

## 未対応: 別デバイス共有

現状は GitHub Pages の静的 PWA と、端末・ブラウザごとの IndexedDB だけで動作する。別デバイス共有、バックエンド、認証、クラウド同期は未実装。

低コストの第一候補:

```text
GitHub Pages（React フロント）
  -> Google Apps Script（認証・検証・同期 API）
  -> Google スプレッドシート（共有データ）
```

Google Drive の共有フォルダ内の JSON をフロントエンドから直接読み書きする方式は採用しない。安全な書き込みには Google OAuth / Drive API の権限管理が必要になるため。

実装前に決めること:

1. 認証方法（Google アカウントによる利用者制限を推奨）
2. 同期タイミング（初期は手動の取得・保存を推奨）
3. 競合時の扱い（`updatedAt` と room 単位の `revision` を使う案）
4. IndexedDB をオフライン用キャッシュとして残すこと

段階案:

1. JSON エクスポート / インポートでバックアップ経路を作る（実装済み）
2. Apps Script の `getRoom` と手動 `saveRoom` を実装する
3. 認証、競合確認、同期状態表示を追加する
4. 必要なら自動同期を追加する

## バックアップ仕様

- JSON は `format: "mahjong-score-backup"`、`version: 1` と全 Room / Session / Hand を含む。
- 復元前に形式・ID重複・親子関係を検証し、不正なファイルでは IndexedDB を変更しない。
- 復元は全置換のみ。画面で明示確認を行うため、端末変更前・外部同期前にまず JSON を書き出す。
- 次段階の Apps Script API はこの形式を入出力の土台とし、手動の取得・保存、room 単位の `revision` を追加する。
