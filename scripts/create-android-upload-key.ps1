param(
  [string]$KeystorePath = (Join-Path $PSScriptRoot '..\android-upload.keystore')
)

$resolvedPath = [System.IO.Path]::GetFullPath($KeystorePath)

if (Test-Path $resolvedPath) {
  throw "署名鍵が既にあります: $resolvedPath"
}

& keytool -genkeypair `
  -v `
  -keystore $resolvedPath `
  -alias upload `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000

if ($LASTEXITCODE -ne 0) {
  throw '署名鍵の作成に失敗しました。'
}

Write-Host "署名鍵を作成しました: $resolvedPath"
Write-Host 'このファイルと入力したパスワードは安全な場所に保管してください。Gitへ追加してはいけません。'
