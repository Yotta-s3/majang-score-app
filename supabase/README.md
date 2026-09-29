# Supabase移行準備

このフォルダは、GAS同期からSupabaseへ移行する際に使うDB定義です。まだアプリはSupabaseへ接続しません。

## 方針

- 利用者はGoogleログインを行わず、Supabase Anonymous Authで内部的に認証する。
- Roomを新規作成した匿名ユーザーは、自動的にownerとして`room_members`へ追加される。
- 共有コード入力は`join_room_by_share_code` RPCで処理し、参加後だけRoomのデータを読める。
- RLSにより、Roomのメンバー以外はRoom・Session・Handを読み書きできない。

## 適用するタイミング

Supabaseプロジェクトを作成した後、CLIで初期化して`migrations`配下のSQLをファイル名順に適用する。DashboardのSQL Editorで直接実行する場合も、各ファイル全体を順番に実行する。

アプリ接続を始める前に、Supabase DashboardでAnonymous Sign-Insを有効にする。

## プロジェクト作成後の設定

1. Supabase Dashboardで新しいプロジェクトを作成する。
2. AuthenticationのProvidersからAnonymous Sign-Insを有効にする。
3. SQL Editorで`migrations/0001_initial_schema.sql`、続けて`migrations/0002_room_snapshot_rpc.sql`の全内容を順番に実行する。
4. `.env.example`を複製して`.env.local`を作成し、Project Settings > APIの値を設定する。

```text
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

`VITE_`で始まる値はブラウザへ配布されるため、service_role keyは絶対に設定しない。`.env.local`はGitの管理対象外。
