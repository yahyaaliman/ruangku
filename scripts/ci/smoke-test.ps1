# Uji asap di Windows sungguhan untuk installer yang baru dibuat (lihat scripts/smoke-windows.mjs).
# Dimulai dari salinan .msi lama yang sedang berjalan, lalu installer baru harus mencopotnya.
param([string]$Bundle = 'src-tauri/target/release/bundle', [string]$OutDir = (Join-Path $env:RUNNER_TEMP 'uji-asap'))
$ErrorActionPreference = 'Stop'

$setup = Get-ChildItem "$Bundle/nsis/*-setup.exe" | Select-Object -First 1
$msi = Get-ChildItem "$Bundle/msi/*.msi" | Select-Object -First 1
if (-not $setup) { throw "Installer NSIS tidak ditemukan di $Bundle/nsis" }

node scripts/smoke-windows.mjs $setup.FullName $OutDir $(if ($msi) { $msi.FullName })
if ($LASTEXITCODE -ne 0) { throw 'Uji asap Windows gagal' }
