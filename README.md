# Mahjong Score App

4人麻雀のスコアを記録・集計し、共有コードで複数端末から同じルームを利用できるPWAです。

## 主な機能

- Room / 対局日 / 半荘の記録と成績集計
- ウマ・オカ・同点時の席順ルール
- JSONバックアップと復元
- 共有コードによるルーム参加
- IndexedDBによる端末内保存とSupabaseへの手動同期
- オフライン時の閲覧・入力と、PWAとしてのホーム画面追加

## 技術構成

- React / TypeScript / Vite
- Dexie（IndexedDB）
- Supabase（PostgreSQL、Anonymous Auth、RLS）
- GitHub Pages / GitHub Actions

Google OAuth、Google Apps Script、Google Sheetsには依存しません。

## 開発を始める

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

`.env.local`にはSupabase DashboardのProject URLとPublishable keyを設定します。`service_role` keyは使用しません。

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

DB初期設定とGitHub Pagesへの公開設定は[Supabase運用手順](supabase/README.md)を参照してください。

## 品質確認

```powershell
npm run lint
npm run test:run
npm run build
```
