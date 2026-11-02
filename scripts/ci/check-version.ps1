# Tag rilis harus sama dengan versi aplikasi (package.json), mis. tag v1.0.0 untuk versi 1.0.0.
# Pada uji coba manual (bukan tag) pemeriksaan dilewati. Menulis VERSION ke GITHUB_ENV.
$ErrorActionPreference = 'Stop'
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
"VERSION=$version" | Out-File -FilePath $env:GITHUB_ENV -Append -Encoding utf8
if ($env:GITHUB_REF_TYPE -ne 'tag') {
  Write-Host "Uji coba dari $($env:GITHUB_REF_NAME): versi $version, tidak ada yang diterbitkan."
  exit 0
}
if ($env:GITHUB_REF_NAME -ne "v$version") {
  throw "Tag $($env:GITHUB_REF_NAME) tidak sama dengan versi aplikasi v$version. Samakan versi (lihat docs/instalasi-windows.md) lalu buat tag yang sesuai."
}
Write-Host "Tag $($env:GITHUB_REF_NAME) sesuai dengan versi aplikasi $version."
