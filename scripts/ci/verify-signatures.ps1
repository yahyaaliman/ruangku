# Pastikan ruangku.exe, installer .exe, dan .msi bertanda tangan Authenticode yang valid.
param([string]$Bundle = 'src-tauri/target/release/bundle')
$ErrorActionPreference = 'Stop'

$signtool = (Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1).FullName
$files = @(Get-Item src-tauri/target/release/ruangku.exe) + @(Get-ChildItem "$Bundle/nsis/*.exe", "$Bundle/msi/*.msi")
foreach ($f in $files) {
  & $signtool verify /pa /q $f.FullName
  if ($LASTEXITCODE -ne 0) { throw "Tanda tangan tidak valid: $($f.Name)" }
  Write-Host "Tanda tangan valid: $($f.Name)"
}
