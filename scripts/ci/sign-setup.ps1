# Siapkan tanda tangan kode Authenticode bila secret-nya diatur. Menulis ke GITHUB_ENV:
#   TAURI_SIGN_ARGS = argumen tambahan untuk `tauri build` (kosong bila tanpa tanda tangan)
#   SIGNED          = "true" bila build akan ditandatangani
# Sumber (dari env): SIGN_COMMAND (alat cloud HSM, %1 = path file) atau CERT (.pfx base64) + CERT_PASSWORD.
$ErrorActionPreference = 'Stop'

function Set-Env([string]$name, [string]$value) { "$name=$value" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8 }

if ($env:SIGN_COMMAND) {
  $sign = $env:SIGN_COMMAND
} elseif ($env:CERT) {
  $pfx = Join-Path $env:RUNNER_TEMP 'ruangku.pfx'
  [IO.File]::WriteAllBytes($pfx, [Convert]::FromBase64String($env:CERT))
  $signtool = (Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1).FullName
  $sign = @{ cmd = $signtool; args = @('sign', '/f', $pfx, '/p', $env:CERT_PASSWORD, '/fd', 'sha256', '/tr', 'http://timestamp.digicert.com', '/td', 'sha256', '/d', 'Ruangku', '%1') }
} else {
  Write-Host '::warning title=Installer belum bertanda tangan::Windows akan menampilkan peringatan SmartScreen (Unknown publisher). Lihat docs/instalasi-windows.md untuk mengaktifkan tanda tangan kode.'
  Set-Env 'TAURI_SIGN_ARGS' ''
  exit 0
}

$cfg = Join-Path $env:RUNNER_TEMP 'ruangku-sign.json'
@{ bundle = @{ windows = @{ signCommand = $sign } } } | ConvertTo-Json -Depth 6 | Set-Content -Path $cfg -Encoding utf8
Set-Env 'TAURI_SIGN_ARGS' "--config $cfg"
Set-Env 'SIGNED' 'true'
