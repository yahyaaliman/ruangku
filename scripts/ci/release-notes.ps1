# Tulis SHA256SUMS.txt di folder bundle dan catatan rilis ke $env:RUNNER_TEMP/release-notes.md:
# bagian versi ini dari CHANGELOG.md, cara memasang, keamanan, dan hasil pemindaian (scan.md).
param([string]$Bundle = 'src-tauri/target/release/bundle', [string]$Out = (Join-Path $env:RUNNER_TEMP 'release-notes.md'))
$ErrorActionPreference = 'Stop'

$files = Get-ChildItem "$Bundle/nsis/*.exe", "$Bundle/msi/*.msi"
$sums = foreach ($f in $files) { '{0}  {1}' -f (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower(), $f.Name }
$sums | Set-Content -Path "$Bundle/SHA256SUMS.txt" -Encoding ascii
$setup = ($files | Where-Object Extension -eq '.exe' | Select-Object -First 1).Name

# Bagian versi ini dari CHANGELOG.md: antara "## [<versi>]" dan judul "## [" berikutnya.
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$changes = @()
$inside = $false
foreach ($l in Get-Content CHANGELOG.md -Encoding utf8) {
  if ($l -match '^## \[') { if ($inside) { break }; $inside = $l.StartsWith("## [$version]"); continue }
  if ($inside -and $l -notmatch '^\[.+\]: ') { $changes += ($l -replace '^### ', '## ') }
}
while ($changes.Count -and -not $changes[-1].Trim()) { $changes = @($changes | Select-Object -SkipLast 1) }
if (-not ($changes -join '').Trim()) { $changes = @('Lihat CHANGELOG.md untuk perubahan versi ini.') }

$signed = if ($env:SIGNED -eq 'true') {
  'Installer ditandatangani (Authenticode) dan tanda tangannya diverifikasi saat build.'
} else {
  'Installer belum bertanda tangan kode, sehingga Windows SmartScreen menampilkan peringatan. Pastikan file berasal dari halaman rilis ini dan checksum-nya cocok, lalu pilih **More info → Run anyway**.'
}
$scanFile = Join-Path $env:RUNNER_TEMP 'scan.md'
$scan = if (Test-Path $scanFile) { @(Get-Content $scanFile -Encoding utf8 | Where-Object { $_ }) } else { @() }

$changes + @(
  '',
  '## Cara memasang',
  '',
  "1. Unduh **$setup** (installer standar, tanpa hak admin, terpasang untuk pengguna ini).",
  '2. Jalankan, ikuti wizard, lalu buka Ruangku dari Start Menu atau desktop. Versi lama diperbarui otomatis; data tetap aman. Bila masih ada Ruangku lama yang dipasang lewat .msi, installer menawarkan untuk mencopotnya.',
  '3. File **.msi** ditujukan untuk penerapan oleh admin IT (dipasang untuk semua pengguna).',
  '',
  '## Keamanan',
  '',
  "- $signed",
  '- Dibuat otomatis oleh GitHub Actions dari kode di repo ini setelah uji frontend, uji backend, dan uji asap di Windows sungguhan (pasang, buka semua halaman, widget, sticky note, catat cepat, layar istirahat, tutup paksa, pasang ulang, copot) lulus.',
  "- Cocokkan checksum di PowerShell: ``Get-FileHash .\$setup -Algorithm SHA256`` dengan isi **SHA256SUMS.txt**:",
  '',
  '```',
  ($sums -join "`n"),
  '```',
  '',
  "- Bukti asal-usul build: ``gh attestation verify .\$setup -R $env:GITHUB_REPOSITORY``."
) + $scan | Set-Content -Path $Out -Encoding utf8

Get-Content "$Bundle/SHA256SUMS.txt"
