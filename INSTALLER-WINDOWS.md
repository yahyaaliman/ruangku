# Installer Windows Ruangku

## Untuk pengguna

Unduh installer dari halaman **[Releases](https://github.com/yahyaaliman/ruangku/releases/latest)**:

| File | Untuk siapa |
| --- | --- |
| `Ruangku_<versi>_x64-setup.exe` | Pengguna biasa. Wizard berbahasa Indonesia, tanpa hak admin. |
| `Ruangku_<versi>_x64_en-US.msi` | Admin IT yang memasang untuk semua pengguna (butuh hak admin). |
| `SHA256SUMS.txt` | Checksum untuk memastikan file tidak berubah. |

Yang dilakukan installer `.exe`:

- Memasang ke `%LOCALAPPDATA%\Ruangku` untuk pengguna yang sedang masuk. Tidak perlu hak admin, dan tidak mengubah sistem.
- Membuat pintasan di Start Menu (folder **Ruangku**) dan, bila dipilih, di desktop.
- Memasang WebView2 bila belum ada (umumnya sudah ada di Windows 10/11). Bootstrapper-nya sudah disertakan, jadi tidak ada unduhan dari situs pihak ketiga.
- Mendaftarkan diri di **Pengaturan Windows → Aplikasi → Aplikasi terinstal**, sehingga bisa dicopot seperti aplikasi lain. Saat dicopot, data Anda **tetap disimpan** kecuali Anda mencentang "Hapus juga data aplikasi".
- Menjalankan installer versi baru akan memperbarui versi lama tanpa menghapus data. Bila Ruangku sedang berjalan, installer meminta izin untuk menutupnya.

Data aplikasi tersimpan di `%APPDATA%\com.ruangku.app` (database `ruangku.db` beserta backup hariannya).

### Memastikan installer asli

1. Unduh hanya dari halaman Releases repo ini.
2. Cocokkan checksum di PowerShell:

   ```powershell
   Get-FileHash .\Ruangku_0.6.1_x64-setup.exe -Algorithm SHA256
   ```

   Hasilnya harus sama persis dengan baris file itu di `SHA256SUMS.txt`.
3. Opsional, periksa bukti asal-usul build (attestation) dengan [GitHub CLI](https://cli.github.com):

   ```powershell
   gh attestation verify .\Ruangku_0.6.1_x64-setup.exe -R yahyaaliman/ruangku
   ```

   Perintah ini membuktikan file dibuat oleh GitHub Actions dari kode di repo ini, bukan diunggah dari komputer orang lain.

### Peringatan "Windows protected your PC"

Selama installer belum bertanda tangan kode (Authenticode), SmartScreen menampilkan peringatan **Unknown publisher**. Bila checksum sudah cocok, klik **More info → Run anyway**. Peringatan ini hanya berarti penerbitnya belum terverifikasi, bukan berarti ada virus. Hasil pemindaian antivirus (bila aktif) tercantum di catatan rilis.

## Untuk pengelola rilis

### Membuat rilis

1. Naikkan versi di `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, dan `src-tauri/Cargo.lock`.
2. Push ke `main`, lalu tunggu **Build Windows** hijau.
3. Buat tag: `git tag v<versi> && git push origin v<versi>`. Workflow menerbitkan installer, `.msi`, `SHA256SUMS.txt`, dan catatan rilis. Bila kunci updater sudah diatur, `latest.json` juga ikut terbit untuk pembaruan di dalam aplikasi (lihat `INTEGRASI-DAN-KEAMANAN.md`).

### Pengamanan build yang sudah aktif

- Semua GitHub Action dikunci ke commit SHA, dan token workflow memakai hak minimum.
- Uji frontend dan backend wajib lulus sebelum installer dibuat.
- Installer dipindai Windows Defender bila layanan itu aktif di runner GitHub (biasanya dimatikan di sana), dan dipindai VirusTotal (70+ antivirus) bila secret `VIRUSTOTAL_API_KEY` diisi. Kunci API-nya gratis dari akun [VirusTotal](https://www.virustotal.com). Hasilnya tercantum di catatan rilis. Build gagal bila Defender menemukan ancaman.
- Checksum SHA-256 dan attestation build provenance (untuk repo publik) diterbitkan.
- Installer per pengguna, tanpa hak admin, dengan konten aplikasi yang dibatasi CSP.

### Mengaktifkan tanda tangan kode

Tanda tangan Authenticode memberi nama penerbit yang terverifikasi pada installer dan aplikasi. Reputasi SmartScreen tetap dibangun bertahap untuk semua jenis sertifikat; sejak 2024, sertifikat EV pun tidak lagi langsung dipercaya. Pilihan saat ini ([ringkasan Microsoft](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)):

| Pilihan | Untuk pengembang perorangan di Indonesia |
| --- | --- |
| **SignPath Foundation** | Gratis untuk proyek open source yang memenuhi syarat (lisensi OSI, repo publik, kebijakan penandatanganan). Repo ini perlu memilih lisensi open source terlebih dulu. |
| **Sertifikat OV** (DigiCert, Sectigo, GlobalSign, Certum, SSL.com, dll.) | Tersedia di seluruh dunia, sekitar US$150–300/tahun. Kunci wajib disimpan di token atau cloud HSM. Pilih penyedia yang punya alat penanda tangan cloud agar bisa dipakai di GitHub Actions. |
| **Azure Artifact Signing** | Sekitar US$10/bulan, tetapi saat ini hanya untuk organisasi di AS, Kanada, UE, dan Inggris, serta perorangan di AS dan Kanada. |

Setelah punya sertifikat, isi secret di **Settings → Secrets and variables → Actions**:

- **Alat cloud HSM / Artifact Signing**: `WINDOWS_SIGN_COMMAND` berisi perintah penanda tangan dengan `%1` sebagai path file, misalnya `artifact-signing-cli -e <endpoint> -a <akun> -c <profil> -d Ruangku %1`. Kredensial yang dibutuhkan alat itu disimpan sebagai `AZURE_CLIENT_ID`/`AZURE_CLIENT_SECRET`/`AZURE_TENANT_ID` atau `SIGN_USERNAME`/`SIGN_PASSWORD`/`SIGN_CREDENTIAL_ID`/`SIGN_TOTP_SECRET`. Bila alatnya perlu dipasang dulu, tambahkan langkah pemasangan sebelum "Build installer".
- **Sertifikat berbentuk file .pfx**: `WINDOWS_CERT_PFX` (isi file dalam base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("sertifikat.pfx")) | Set-Clipboard`) dan `WINDOWS_CERT_PASSWORD`.

Workflow memasangnya sebagai `signCommand` Tauri, sehingga `ruangku.exe`, uninstaller, installer `.exe`, dan `.msi` semuanya ditandatangani dengan SHA-256 beserta timestamp. Setelah itu tanda tangannya diverifikasi dengan `signtool verify /pa`; build gagal bila ada yang tidak valid.
