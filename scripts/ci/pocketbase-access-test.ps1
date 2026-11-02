# Uji izin proyek terhadap server PocketBase sungguhan (versi dan checksum dikunci).
$ErrorActionPreference = 'Stop'
$version = '0.40.6'
$sha256 = '33A2A1D255CADDED77346FC7F5DE37DCA21BA4BAD0D9CAE0235A50B3B703D6D9'

$archive = Join-Path $env:RUNNER_TEMP 'pocketbase.zip'
$dir = Join-Path $env:RUNNER_TEMP 'pocketbase-test'
Invoke-WebRequest "https://github.com/pocketbase/pocketbase/releases/download/v$version/pocketbase_${version}_windows_amd64.zip" -OutFile $archive
if ((Get-FileHash $archive -Algorithm SHA256).Hash -ne $sha256) { throw "Checksum PocketBase $version tidak cocok" }
Expand-Archive $archive -DestinationPath $dir -Force

$env:PB_TEST_BIN = Join-Path $dir 'pocketbase.exe'
node server/run-access-test.mjs
if ($LASTEXITCODE -ne 0) { throw 'Uji izin proyek gagal' }
