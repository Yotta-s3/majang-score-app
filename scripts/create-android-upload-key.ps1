param(
  [string]$KeystorePath = (Join-Path $PSScriptRoot '..\android-upload.keystore')
)

$resolvedPath = [System.IO.Path]::GetFullPath($KeystorePath)

if (Test-Path $resolvedPath) {
  throw "A keystore already exists: $resolvedPath"
}

& keytool -genkeypair `
  -v `
  -keystore $resolvedPath `
  -storetype PKCS12 `
  -alias upload `
  -keyalg RSA `
  -keysize 4096 `
  -validity 10000

if ($LASTEXITCODE -ne 0) {
  throw 'Failed to create the upload keystore.'
}

Write-Host "Upload keystore created: $resolvedPath"
Write-Host 'Back up this file and its passwords securely. Do not add it to Git.'
