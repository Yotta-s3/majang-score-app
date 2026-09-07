# 10分勉強会: GASを使った麻雀スコア共有DB

## ゴール

このアプリで、端末ごとのIndexedDBに保存している点数データを、Google Apps Script（GAS）とGoogleスプレッドシートで共有する仕組みを説明する。

## 0:00-1:00 背景と課題

- もともとのアプリはReact PWAで、データは各端末のIndexedDBにだけ保存していた。
- オフラインでは便利だが、別のスマホ・PCや複数メンバー間でデータを共有できない。
- 本格的なバックエンドを新規に用意せず、Googleアカウントを使える少人数の用途に合わせてGASを採用した。

## 1:00-2:30 全体構成

```text
React PWA
  ├─ IndexedDB: 端末内キャッシュ、オフライン利用
  ├─ JSON: 初回のルームID引き継ぎ、手動バックアップ
  └─ Google Identity Services: Googleログイン・OAuthトークン取得
       └─ Apps Script Execution API
            └─ GAS
                 └─ Googleスプレッドシート: 共有データ
```

- IndexedDBを捨てず、共有DBと端末キャッシュを併用している。
- 同期は自動ではなく、利用者が「サーバーへ保存」「サーバーから取得」を押す手動方式。

## 2:30-4:00 データの単位

- 階層は `Room -> Session -> HandRecord`。
- 共有の単位は **Room単位**。
- Room、配下のSession、HandRecordを1つのJSON payloadにまとめて保存する。
- スプレッドシートでは1ルームを1行として持つ。

| 列 | 内容 |
| --- | --- |
| `roomId` | ルームを一意に識別するID |
| `revision` | 保存ごとに増える世代番号 |
| `updatedAt` | サーバー更新時刻 |
| `payload` | Room / Session / HandRecord を含むJSON |

ルーム名やプレイヤー名ではなく、作成時に発行するUUID系の `roomId` で同一ルームを判定する。

## 4:00-5:30 GAS側の役割

GASには2つの関数を置いている。

- `getRoom(roomId)`
  - 指定されたルームのpayloadとrevisionを返す。
  - 未保存なら `revision: 0`、`payload: null` を返す。

- `saveRoom({ roomId, baseRevision, payload })`
  - 現在のrevisionと、端末が認識している `baseRevision` を比較する。
  - 一致すれば保存してrevisionを1増やす。
  - 不一致なら競合として保存を拒否する。

同時保存を避けるため、GASの `LockService` で保存処理をロックしている。

## 5:30-7:00 競合検知

例:

1. 端末Aと端末Bがrevision 3を取得する。
2. 端末Aが保存し、サーバーはrevision 4になる。
3. 端末Bがrevision 3のまま保存しようとする。
4. GASは競合を返し、端末Bの保存を止める。

この初期版では、競合時に自動マージや強制上書きはしない。先に「サーバーから取得」で内容を確認する方針としている。

## 7:00-8:30 CORSと認証

最初はGAS Webアプリの `/exec` URLへブラウザから直接 `fetch` した。

- 結果: `Access-Control-Allow-Origin` がなく、CORSでブラウザにブロックされた。
- GitHub Pagesへ公開しても、CORSの問題は解決しない。

そこで、GAS Webアプリへの直接アクセスはやめ、**Apps Script Execution API**へ変更した。

1. Google Identity Servicesで利用者がGoogleログインする。
2. OAuthアクセストークンを取得する。
3. `scripts.run` でGASの関数を実行する。

この方式では、Apps ScriptとOAuthクライアントを同じ標準Google Cloudプロジェクトへ紐付け、Apps Script APIを有効化する必要がある。

## 8:30-9:30 運用上の注意

- OAuth Client IDとApps ScriptのスクリプトIDは公開識別子であり、GitHub Pagesのフロントコードに含められる。
- OAuth Client Secret、Googleアカウントのパスワード、スプレッドシートの共有リンクはフロントコードやGitへ置かない。
- テスト中のOAuth同意画面では、利用者をテストユーザーに追加する必要がある。
- 新しい端末で共有ルームを使う初回だけ、JSONインポートで同じ `roomId` を引き継ぐ。

## 9:30-10:00 まとめ

- GASとスプレッドシートで、軽量な共有DBを作れる。
- IndexedDBをキャッシュとして残すことで、PWAのオフライン性も維持できる。
- 単純なHTTP通信ではなく、OAuth付きExecution APIを使うことでCORSと認証を扱う。
- revisionによって、別端末の更新を黙って上書きしない。

## 想定質問

### なぜFirebaseなどを使わないのか？

少人数・低コスト・Googleアカウントをすでに使う前提では、GASとスプレッドシートの運用コストが低いため。高頻度同期、大量データ、複雑な権限管理が必要ならFirebaseや専用バックエンドを検討する。

### スプレッドシートを直接フロントから操作しないのはなぜか？

Drive / Sheets APIの権限をブラウザへ直接渡す設計は、権限管理とデータ構造の制御が複雑になる。GASをAPIの窓口にして、受け取るデータと保存処理を限定している。

### 自動同期はできるか？

できるが、オフライン時の扱い、競合解決、API呼び出し回数を設計する必要がある。現在は利用者が判断できる手動同期から始めている。
