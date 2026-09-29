# Supabase運用手順

このアプリはSupabaseを唯一の共有バックエンドとして利用します。端末内のIndexedDBは、オフライン利用と表示を支えるローカルデータストアです。

## 構成

- Supabase Anonymous Authで端末ごとに内部認証する。Googleログインは不要。
- ルーム作成者は`room_members`のownerになる。
- 共有コードで参加した利用者だけが、そのルームをRLS経由で読み書きできる。
- 保存時は`revision`を照合し、別端末で更新された内容を黙って上書きしない。

## 新規プロジェクトの設定

1. Supabaseプロジェクトを作成する。
2. **Enable Data API** と **Enable automatic RLS** をオン、**Automatically expose new tables** をオフにする。
3. Authentication → ProvidersでAnonymous Sign-Insを有効にする。
4. SQL Editorで、次のファイルを順番に全内容実行する。
   - `migrations/0001_initial_schema.sql`
   - `migrations/0002_room_snapshot_rpc.sql`
5. `.env.example`を`.env.local`へ複製し、Project Settings → APIの値を設定する。

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

`service_role` keyはブラウザ・GitHub Secrets・リポジトリのいずれにも設定しません。

## GitHub Pages

Repository secretsとして以下を登録します。

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

`main`へのpush時、GitHub Actionsがこれらをビルド時の環境変数として利用します。Publishable keyはブラウザへ配布される前提のキーであり、アクセス制御はRLSポリシーが担います。

## 日常の運用

- 端末を変更した場合は、共有コードでルームに参加する。
- 保存競合が表示された場合は、先に「サーバーから取得」で内容を確認してから保存する。
- 共有コードを失うと新しい端末からの参加が難しくなるため、必要に応じてJSONバックアップも保管する。
