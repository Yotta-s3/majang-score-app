# Mahjong Score App ロードマップ

## 現在地

Web/PWA版は公開済みです。共有バックエンドはSupabase（PostgreSQL）へ移行し、Google OAuth、Google Apps Script、Google Sheetsへの依存は廃止しました。

```text
React / PWA
  ├─ IndexedDB: 端末内データ・オフライン利用
  └─ Supabase: 共有、Anonymous Auth、RLS、競合検知
```

実装済みの主な機能：

- ルーム、対局日、半荘の記録と成績集計
- ウマ・オカ・同点時の席順ルール
- JSONバックアップ / 復元
- 共有コードによる参加
- `revision`による保存競合の検知
- PWA、GitHub Pages、品質チェック付きデプロイ

## 次の優先順位

### 1. 品質・運用の強化

- Supabase同期の自動テストを追加する。
- 共有コード参加、競合、既存ローカルルームの初回保存を受入テストとして文書化する。
- Supabaseのバックアップ、利用量、エラーログを定期確認する。

### 2. Web版の完成度向上

- 実対局での利用からUI・入力速度・誤操作防止を改善する。
- オフライン中の変更と復帰後の同期方針を検証・改善する。
- JSONバックアップと場代計算は、モバイルアプリ化の段階で必要性を再評価する。

### 3. Androidアプリ化

SupabaseのAPIとデータモデルを維持しながら、React Native + Expoを候補にAndroidアプリを作る。Web版とAndroid版が同じルームを共有できる構成を保つ。

### 4. Google Play公開

- Play Console登録と署名設定
- プライバシーポリシー、利用規約、ライセンス表記
- ストア掲載情報と実機テスト

## 方針

- 共有データの認可はSupabaseのAnonymous AuthとRLSで行う。
- 共有コードは参加のための能力情報として扱い、第三者へ公開しない。
- IndexedDBはサーバーの代替ではなく、オフライン利用のためのローカル層として扱う。
- 競合時は自動上書きせず、取得後に利用者が内容を確認する。
