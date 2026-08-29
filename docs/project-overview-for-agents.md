# Mahjong Score App: Agent Onboarding

この文書は、複数のAIエージェントがこのプロジェクトへ短時間で参加できるようにするための概要メモです。

## プロジェクト概要

このプロジェクトは、4人麻雀の半荘結果を記録し、ウマ・オカ・同点処理・場代を反映したポイントと順位を集計するPWAです。

主な特徴:

- React + TypeScript + Vite のシングルページアプリ
- IndexedDB によるブラウザローカル保存
- Dexie / dexie-react-hooks によるDB操作とリアクティブ表示
- vite-plugin-pwa によるPWA化
- GitHub Pages 配信を想定した `base: '/majang-score-app/'` 設定

現状ではバックエンドや認証はありません。データはユーザーのブラウザ内 IndexedDB に保存されます。
別デバイス共有は未実装です。共有機能の検討内容・次の実装方針は、`docs/renovation-plan.md` の「2026-08-29 更新」以降を参照してください。

## ディレクトリ構成

```text
majang-score-app/
  docs/
    renovation-plan.md
    project-overview-for-agents.md
  public/
    pwa-192.png
    pwa-512.png
    store-icon-512.png
    feature-graphic-1024x500.png
    privacy.html
  src/
    App.tsx
    App.css
    db.ts
    index.css
    main.tsx
  eslint.config.js
  index.html
  package.json
  tsconfig*.json
  vite.config.ts
```

重要ファイル:

- `src/App.tsx`: 画面、フォーム状態、スコア計算、Dexie操作の大半が集約されている
- `src/db.ts`: IndexedDBのスキーマ、Dexieテーブル、永続化型定義
- `src/App.css`: 主要UIスタイル
- `vite.config.ts`: React/PWA/GitHub Pages向けVite設定
- `docs/renovation-plan.md`: 今後のデータモデル改修方針メモ

## 技術スタック

実行時依存:

- React 19
- React DOM 19
- Dexie 4
- dexie-react-hooks

開発依存:

- Vite 7
- TypeScript 5.9
- ESLint 9
- vite-plugin-pwa
- @vitejs/plugin-react

## セットアップと実行

作業ディレクトリはリポジトリ直下ではなく、通常は以下です。

```powershell
cd C:\Projects\majang_score_app\majang-score-app
```

主要コマンド:

```powershell
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

`package.json` の scripts:

- `dev`: Vite開発サーバー
- `build`: `tsc -b` 後に `vite build`
- `lint`: ESLint
- `preview`: Vite preview

## 現在のデータモデル

DB名は `mahjong-score-db` です。

`src/db.ts` の型:

```ts
export type UmaRuleId = '5-10' | '10-20' | '10-30'
export type OkaRuleId = 'oka20' | 'oka0'
export type TieRuleId = 'split' | 'seat'
```

`Room`:

- `id`
- `date`
- `players`: 4人固定
- `umaRule`
- `okaRule`
- `tieRule`
- `feeEnabled`
- `feeAmount`
- `createdAt`
- `updatedAt`

`HandRecord`:

- `id`
- `roomId`
- `scores`: 4人分の素点
- `createdAt`
- `updatedAt`

Dexie schema:

- version 1: `records`
- version 2: `rooms`, `hands`, `records`

`records` は過去互換のために残っているように見えます。現在の画面実装では `rooms` と `hands` が中心です。

## 現在の画面・操作フロー

`App.tsx` は現在、次の流れで動きます。

1. Room作成フォームで、日付、4人のプレイヤー名、ウマ、オカ、同点処理、場代を入力する
2. 作成済みRoom一覧から対象Roomを選択する
3. 選択中Roomに対して半荘の4人分スコアを入力する
4. 合計が `100000` 点のときだけ保存できる
5. 保存済みHandを一覧表示し、Room内の通算ポイント、最終順位、場代配分を表示する
6. Handは編集・削除できる
7. Room削除時は、そのRoom配下のHandも削除する

Roomは現在「1日分の対局」と「メンバー・ルール」を兼ねています。将来改修では、Roomを継続的な対局グループに変え、日付単位をSessionとして分離する案があります。

## スコア計算仕様

主要な計算関数は `src/App.tsx` にあります。

### ウマ

`UMA_RULES`:

- `5-10`: `[10, 5, -5, -10]`
- `10-20`: `[20, 10, -10, -20]`
- `10-30`: `[30, 10, -10, -30]`

配列は順位順です。1位から4位へ対応します。

### オカ

`OKA_RULES`:

- `oka20`: `base = 30000`, `oka = 20`
- `oka0`: `base = 25000`, `oka = 0`

### 同点処理

`TieRuleId`:

- `split`: 同点者で順位ボーナスを平均配分する
- `seat`: 現状は入力順を席順として扱い、同点でも席順で順位を決める

注意:

現状の `seat` は、半荘ごとの実際の席順を保存していません。
`players` 配列の固定順を使って同点を解決しています。

将来方針では、`tieRule` が `seat` で、かつ同点者がいる半荘だけ、保存時に同点者の上位順を入力させ、その結果を `HandRecord.tieBreakOrders` に保存します。
これにより、半荘ごとに席順が変わる実運用へ対応します。

### 半荘ポイント

`computeHandPoints(room, scores)` は以下を返します。

- `points`: 各プレイヤーのポイント
- `ranks`: 各プレイヤーの順位

計算式:

```ts
point = (score - okaBase) / 1000 + umaOrUmaOkaBonus
```

1位にはオカが加算されます。同点処理が `split` の場合は、該当順位範囲のウマ・オカを同点者で平均します。

### Room通算順位

`computeFinalRanks(totals, tieRule)` がRoom内の通算ポイントから最終順位を計算します。

### 場代配分

`computeFeeShares(totals, tieRule, feeAmount)` が通算順位に応じて場代を配分します。

配分比率:

- 1位: `0`
- 2位: `1/6`
- 3位: `2/6`
- 4位: `3/6`

同点処理が `split` の場合は、該当順位範囲の場代配分も平均されます。

## PWA設定

`vite.config.ts` で `vite-plugin-pwa` を利用しています。

主な設定:

- `registerType: 'autoUpdate'`
- `injectRegister: 'auto'`
- `manifest.name: 'Mahjong Score'`
- `display: 'standalone'`
- `background_color: '#f4f2e9'`
- `theme_color: '#0f5132'`
- icons: `pwa-192.png`, `pwa-512.png`

GitHub Pages前提のため、Viteの `base` は `/majang-score-app/` です。

## 既知の注意点

### UI文言の文字化け

`src/App.tsx` と `study-session-notes.md` には、日本語が文字化けした文字列が多数あります。機能調査や改修時は、表示文言をそのまま仕様として信用しすぎないでください。

一方で `docs/renovation-plan.md` は日本語として読める状態で、今後の仕様方針を理解する上で有用です。

### 実装が `App.tsx` に集中している

画面状態、DB操作、計算ロジック、表示ロジックが `App.tsx` にまとまっています。大きな改修では、まず計算ロジックやDB操作を分離するか、既存構造のまま小さく変更するかを判断してください。

### テストがない

現時点で自動テストは見当たりません。スコア計算、Dexie migration、既存データ互換に触る変更では、テスト追加を検討してください。

### 既存データ保護が重要

IndexedDB schema migration を変更する場合、既存ユーザーデータを消さないことが重要です。Dexieの version を上げる変更では、旧データから新データへの移行処理を慎重に実装してください。

## 今後の改修方針

`docs/renovation-plan.md` に、以下の大きな方針が整理されています。

- 保存済み半荘の各点数に順位も表示する
- Roomを「継続的な対局グループ」として扱う
- 日付単位の `Session` を新設する
- HandはSessionに紐づける
- Room単位で複数日の通算成績を表示する
- Room配下の全Sessionを合算し、プレイヤー別の成績分析を表示する
- 既存 version 2 データを壊さず version 3 へ migration する

想定されている将来モデル:

```ts
type Room = {
  id: string
  name: string
  players: [string, string, string, string]
  umaRule: UmaRuleId
  okaRule: OkaRuleId
  tieRule: TieRuleId
  feeEnabled: boolean
  feeAmount: number
  createdAt: number
  updatedAt: number
}

type Session = {
  id: string
  roomId: string
  date: string
  createdAt: number
  updatedAt: number
}

type HandRecord = {
  id: string
  roomId: string
  sessionId: string
  scores: [number, number, number, number]
  tieBreakOrders?: TieBreakOrder[]
  createdAt: number
  updatedAt: number
}

type TieBreakOrder = {
  score: number
  playerIndexes: number[]
}
```

この改修はUIとデータモデルの両方に影響するため、先に migration 方針を固めるのが安全です。

`tieBreakOrders` は、`seat` 同点処理における半荘ごとの上位順を保存するための optional フィールドです。
既存データには存在しないため、未設定の場合は従来互換として `players` 配列順で同点解決します。

複数日のSessionをRoomに紐づけた後は、Room全体のプレイヤー別分析機能も追加予定です。
初期指標は、総半荘数、総得点、平均得点、平均順位、順位分布、トップ率、ラス率を想定しています。
分析計算はUIから分離し、純粋関数として扱える形にするのが望ましいです。

## エージェント向け作業指針

新しく作業に入るエージェントは、最初に以下を確認してください。

1. `git status --short` で未コミット変更を確認する
2. `src/App.tsx` で現在の画面状態、計算ロジック、保存処理を確認する
3. `src/db.ts` でDB schema version と型を確認する
4. `docs/renovation-plan.md` で将来方針を確認する
5. 変更後は少なくとも `npm run build` と `npm run lint` を実行する

作業時の注意:

- ユーザーの未コミット変更を巻き戻さない
- IndexedDB schema を変える場合は migration を必ず考える
- スコア計算を変える場合は、ウマ・オカ・同点処理・場代配分・`tieBreakOrders` 未設定時の互換動作を確認する
- GitHub Pages向け `base` 設定を不用意に変えない
- PWAのアイコンやmanifest設定を変える場合は、公開先とインストール挙動も確認する

## 推奨される次の改善

- 文字化けしたUI文言の復元
- スコア計算関数の `src/scoring.ts` などへの分離
- スコア計算のユニットテスト追加
- プレイヤー別分析計算の純粋関数化
- Dexie migration テスト方針の整理
- `README.md` をViteテンプレート内容からプロジェクト固有の内容へ更新
- `Session` 導入前に既存IndexedDBデータの移行仕様を明文化
