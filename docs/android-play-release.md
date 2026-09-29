# Android / Google Play 公開手順

このアプリは、GitHub Pages で公開している PWA を Trusted Web Activity (TWA) として Android 配布する。
初回公開は広告を入れず、Google Play の内部テストで実機確認する。

## リポジトリで管理するもの

- `public/.well-known/assetlinks.json`: Web サイトと Android アプリの関連付け
- `public/privacy.html`: Google Play のプライバシーポリシーURL
- `public/store-icon-512.png`: ストアアイコン
- `public/feature-graphic-1024x500.png`: フィーチャーグラフィック

署名鍵、Android の生成物、APK / AAB は `.gitignore` の対象であり、リポジトリへ追加しない。`android.keystore` は安全なバックアップを別途保持する。紛失すると、同じアプリIDで更新版を配布できない。

## 公開前の確認

1. `main` のGitHub Pagesデプロイが完了していることを確認する。
2. `https://yotta-s3.github.io/majang-score-app/.well-known/assetlinks.json` をブラウザで開き、JSONが表示されることを確認する。
3. `npm run lint`、`npm run test:run`、`npm run build` を実行する。
4. 実機で、起動・ルーム作成・サーバー保存・共有コード参加・更新後の再起動を確認する。
5. `privacy.html` の内容と、Google Play Console のデータセーフティ回答を一致させる。広告や分析ツールを追加した場合は、先にポリシーと回答を更新する。

## GitHub ActionsでのAAB作成

Android Studioは不要。GitHub ActionsがAndroid SDKをセットアップして署名済みAABを生成する。

### 初回: アップロード鍵を作成する

PowerShellで次を実行する。コマンド中で表示されるパスワード入力は、他人やチャットへ共有しない。

```powershell
.\scripts\create-android-upload-key.ps1
```

生成される `android-upload.keystore` とパスワードは安全な場所へバックアップする。ファイルは `.gitignore` の対象であり、Gitに追加しない。

次のGitHub Actions Secretsをリポジトリに登録する。

| Secret | 値 |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | `android-upload.keystore` をBase64化した文字列 |
| `ANDROID_UPLOAD_KEYSTORE_PASSWORD` | 鍵ストア作成時のパスワード |
| `ANDROID_UPLOAD_KEY_ALIAS` | `upload` |
| `ANDROID_UPLOAD_KEY_PASSWORD` | 鍵作成時の鍵パスワード |

Base64文字列はPowerShellで生成できる。

```powershell
[Convert]::ToBase64String([System.IO.File]::ReadAllBytes("android-upload.keystore")) | Set-Clipboard
```

GitHubで **Actions → Build Android bundle → Run workflow** を実行する。成功後、Artifactsの `mahjong-score-android-aab` をダウンロードし、含まれる `app-release.aab` をPlay Consoleへ手動アップロードする。

## ローカルでのAAB作成

Androidプロジェクトは Bubblewrap が生成したTWAプロジェクトである。ローカルビルドにはAndroid SDKと、上記4つの `ANDROID_KEY...` 環境変数が必要。バージョンを更新する場合は、`app/build.gradle` の `versionCode` を必ず前回より大きい値にし、`versionName` も更新する。

```powershell
./gradlew.bat bundleRelease
```

出力先は通常 `app/build/outputs/bundle/release/app-release.aab`。Google Play へは APK ではなく AAB をアップロードする。

署名設定はローカルにのみ保持する。既存の `android.keystore` と同じ鍵で署名すること。

## Google Play Console

1. 個人の Google Play デベロッパーアカウントを作成し、本人確認を完了する。
2. アプリを作成する。アプリIDは `io.github.yottas3.mahjongscoreapp` を使用する。
3. ストア掲載情報、アプリアイコン、フィーチャーグラフィック、プライバシーポリシーURLを入力する。
4. データセーフティでは、Supabase同期で扱う記録データと匿名認証IDを正確に申告する。広告・分析SDKを未導入なら、それらの収集は申告しない。
5. まず内部テストトラックへAABを配布し、テスター端末でTWAがブラウザ表示へフォールバックせず起動することを確認する。
6. 必要なテスト要件を満たした後、クローズドテストまたは一般公開へ進む。

## 更新時の注意

- `assetlinks.json` の証明書フィンガープリントは、配布中アプリの署名鍵を変えない限り変更しない。
- 署名鍵を変更した場合は、既存アプリの更新として公開できない可能性があるため、変更前にGoogle Play App Signingの設定を確認する。
- サーバーURL、パッケージID、署名鍵を変える変更は、内部テストで関連付けと起動を必ず確認する。
