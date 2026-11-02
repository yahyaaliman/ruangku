# Pindai installer dengan Windows Defender (bila layanannya aktif di runner) dan VirusTotal
# (bila VT_KEY diisi). Build gagal hanya bila Defender menemukan ancaman; hasil VirusTotal
# berupa peringatan. Hasil ditulis ke $env:RUNNER_TEMP/scan.md untuk catatan rilis.
param([string]$Bundle = 'src-tauri/target/release/bundle')
$ErrorActionPreference = 'Stop'
$files = Get-ChildItem "$Bundle/nsis/*.exe", "$Bundle/msi/*.msi"
$lines = @()

# --- Windows Defender. Di runner GitHub layanannya biasanya mati (hr 0x800106ba). MpCmdRun memakai
# kode keluar 2 untuk ancaman MAUPUN galat, jadi hasil dibaca dari teks keluarannya.
$mp = Join-Path $env:ProgramFiles 'Windows Defender\MpCmdRun.exe'
$status = $null
try { $status = Get-MpComputerStatus -ErrorAction Stop } catch { }
if ((Test-Path $mp) -and $status -and $status.AntivirusEnabled) {
  $clean = $true
  foreach ($f in $files) {
    $out = (& $mp -Scan -ScanType 3 -File $f.FullName -DisableRemediation 2>&1 | Out-String)
    Write-Host $out
    if ($out -match 'found no threats') { Write-Host "Bersih: $($f.Name)" }
    elseif ($out -match 'found \d+ threats') { throw "Windows Defender menemukan ancaman di $($f.Name)" }
    else { $clean = $false; Write-Host "::warning::Pemindaian Defender $($f.Name) tidak selesai." }
  }
  if ($clean) { $lines += '- Dipindai Windows Defender saat build: tidak ada ancaman.' }
} else {
  Write-Host '::notice::Windows Defender tidak aktif di runner; pemindaian Defender dilewati.'
}

# --- VirusTotal (opsional, kunci API gratis). Batas API gratis: 4 permintaan per menit.
if ($env:VT_KEY) {
  try {
    $h = @{ 'x-apikey' = $env:VT_KEY }
    foreach ($f in $files) {
      $sha = (Get-FileHash $f.FullName -Algorithm SHA256).Hash.ToLower()
      $up = Invoke-RestMethod -Method Post -Uri 'https://www.virustotal.com/api/v3/files' -Headers $h -Form @{ file = Get-Item $f.FullName }
      $stats = $null
      for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 20
        $an = Invoke-RestMethod -Uri "https://www.virustotal.com/api/v3/analyses/$($up.data.id)" -Headers $h
        if ($an.data.attributes.status -eq 'completed') { $stats = $an.data.attributes.stats; break }
      }
      if (-not $stats) { Write-Host "::warning::Analisis VirusTotal $($f.Name) belum selesai."; continue }
      $bad = [int]$stats.malicious + [int]$stats.suspicious
      $total = $bad + [int]$stats.undetected + [int]$stats.harmless
      if ($bad -gt 0) { Write-Host "::warning title=VirusTotal::$($f.Name): $bad dari $total mesin menandai file (periksa apakah positif palsu)." }
      $lines += "- VirusTotal $($f.Name): $bad dari $total mesin antivirus menandai file. [Lihat laporan](https://www.virustotal.com/gui/file/$sha)"
    }
  } catch {
    Write-Host "::warning title=VirusTotal::Pemindaian VirusTotal gagal: $($_.Exception.Message)"
  }
} else {
  Write-Host 'VIRUSTOTAL_API_KEY tidak diatur; pemindaian VirusTotal dilewati.'
}

$lines | Set-Content -Path (Join-Path $env:RUNNER_TEMP 'scan.md') -Encoding utf8
