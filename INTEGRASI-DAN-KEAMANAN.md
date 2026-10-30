# Fitur Windows, sinkronisasi, dan akses proyek

Perubahan ini melanjutkan versi 0.5.0. Rilis installer baru dibuat setelah perubahan digabung dan versi rilis ditetapkan. Pengaturan OAuth dan kunci penandatanganan tidak disertakan dalam kode.

## Notifikasi Windows

Reminder Windows mempunyai tombol **Selesai** dan **Tunda 10 menit**. Selesai menutup reminder satu kali; pada reminder berulang, tindakan berlaku pada kemunculan yang ditampilkan. Tunda membuat pengingat ulang tanpa menggeser seri berulang. Tombol lama diabaikan jika jadwal sudah diubah atau tindakan sudah diproses.

Biarkan Ruangku berjalan di tray. Setelah aplikasi benar-benar keluar, callback tindakan belum bisa membangunkan aplikasi. Izin notifikasi Windows dan pengaturan Jangan Ganggu tetap berlaku. Jika toast dengan aksi gagal dibuat, aplikasi mencoba notifikasi biasa.

## Pembaruan di dalam aplikasi

**Pengaturan → Data & keamanan → Pasang pembaruan langsung** memeriksa versi, menampilkan catatan rilis, mengunduh installer, memverifikasi tanda tangan, lalu menjalankan pemasangan setelah pengguna menyetujui. Simpan pekerjaan sebelum memasang. Pemeriksaan berkala menggunakan updater yang sama; unduhan/pemasangan tidak dimulai diam-diam.

Untuk pengelola rilis:

1. Buat pasangan kunci sekali menggunakan `npx tauri signer generate -w <lokasi-aman>/ruangku.key`. Simpan kunci privat di luar repo dan buat cadangan yang aman.
2. Di pengaturan Actions repo, simpan isi kunci publik sebagai **variable** `RUANGKU_UPDATER_PUBLIC_KEY`.
3. Simpan isi kunci privat sebagai **secret** `TAURI_SIGNING_PRIVATE_KEY` dan kata sandinya sebagai `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (kosong jika kunci dibuat tanpa kata sandi).
4. Samakan versi `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, dan `src-tauri/tauri.conf.json`; gunakan tag `v<versi>` yang sama.
5. Workflow Windows menandatangani installer NSIS final setelah langkah Authenticode opsional, lalu menerbitkan installer, `.sig`, dan `latest.json`. Signature juga mengikat nomor versi (`requireSignedVersion`). Jangan mengubah installer setelah ditandatangani.
6. Distribusikan satu installer awal yang sudah memuat kunci publik. Build lama tanpa kunci publik tetap dapat menggunakan unduhan manual; build tersebut tidak otomatis memperoleh kepercayaan terhadap kunci baru.

Endpoint aplikasi: `https://github.com/yahyaaliman/ruangku/releases/latest/download/latest.json`. Tanda tangan updater berbeda dari sertifikat Windows Authenticode. Tag release sengaja gagal jika pasangan kunci belum dikonfigurasi. Alur rilis dengan kunci produksi perlu diuji sebelum dipakai umum.

Referensi: [Tauri updater](https://v2.tauri.app/plugin/updater/) dan [Tauri signer CLI](https://tauri.app/reference/cli/).

## Google Tasks

Koneksi ini terpisah dari akun Google Drive dan sinkron acara Google Calendar yang sudah ada.

1. Aktifkan **Google Tasks API** pada proyek Google Cloud.
2. Atur layar persetujuan OAuth dan pengguna uji jika aplikasi masih berstatus pengujian.
3. Buat OAuth client bertipe **Desktop app**. Masukkan Client ID dan client secret desktop di **Pengaturan → Connector → Google Tasks**.
4. Masuk melalui browser, muat daftar tugas, lalu pilih satu daftar dan satu proyek Ruangku yang boleh Anda ubah.
5. Tekan **Sinkronkan sekarang**. Setelah tujuan disimpan, sinkron berlangsung setiap 10 menit selama aplikasi terbuka. Target dan identitas akun terikat agar data tidak tercampur secara tidak sengaja.

Bidang yang tersinkron dua arah: judul, catatan, tanggal tenggat, status selesai, dan penghapusan item yang sudah tertaut. Jam tenggat, pengulangan, subtugas, prioritas, dan checklist Ruangku tidak dipetakan. Google Tasks API hanya menyediakan tanggal tenggat; jam Ruangku dipertahankan lokal. Tugas yang ditugaskan melalui layanan Google lain dilewati karena tidak dapat diperlakukan seperti tugas biasa. Penanda `[Ruangku:...]` di akhir catatan membantu mencegah duplikat setelah koneksi terputus; jangan dihapus.

Referensi: [Google Tasks resource](https://developers.google.com/tasks/reference/rest/v1/tasks).

## Outlook Calendar / Microsoft Graph

1. Daftarkan aplikasi di Microsoft Entra. Pilih jenis akun yang sesuai (akun organisasi dan/atau akun Microsoft pribadi).
2. Pada platform **Mobile and desktop applications**, tambahkan redirect **`http://localhost`** dan izinkan alur aplikasi publik. Aplikasi memakai port loopback sementara, PKCE, dan pemeriksaan OAuth state; tidak memerlukan client secret Microsoft.
3. Berikan delegated permissions `User.Read` dan `Calendars.ReadWrite`; aplikasi meminta `openid` dan `offline_access` untuk login serta perpanjangan sesi. Kebijakan organisasi mungkin memerlukan persetujuan administrator.
4. Masukkan Application (client) ID di **Pengaturan → Connector → Outlook Calendar**, masuk, lalu pilih satu kalender yang dapat ditulis dan satu proyek.

Judul dan waktu blok jadwal disinkron dua arah. Impor awal mencakup 90 hari ke belakang sampai 180 hari ke depan; item yang sudah tertaut tetap diperiksa di luar rentang tersebut. Acara sepanjang hari dan lintas hari tidak diimpor. Setiap kemunculan acara berulang ditangani sebagai item kalender tersendiri. Zona waktu perangkat dipakai saat memetakan blok Ruangku; Google Tasks tetap menggunakan tanggal tanpa jam.

Kedua konektor menyimpan titik pembanding setiap item. Jika kedua sisi berubah, pengguna memilih versi Ruangku atau layanan; versi lain tidak otomatis ditimpa. ETag mencegah perubahan jarak jauh yang bersamaan tertimpa. Gunakan proyek/daftar/kalender khusus: sinkron pertama menggabungkan kedua sisi dan penghapusan berikutnya juga tersinkron. Koneksi langsung dengan akun nyata masih perlu diuji menggunakan aplikasi OAuth milik pengelola.

Referensi: [redirect localhost Microsoft](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url), [calendarView](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0).

## Izin proyek per anggota

Sebelum menggunakan fitur ini, cadangkan database server, lalu pasang seluruh folder `server/pb_hooks` dan `server/pb_migrations` yang baru. Restart PocketBase agar migrasi dan hook aktif. Pengujian integrasi menggunakan PocketBase **0.40.6**. Jangan hanya memperbarui aplikasi klien; pembatasan wajib diterapkan di server.

Di **Tim & bot → Anggota & peran → Ubah anggota**, pilih **Semua proyek** atau **Hanya proyek yang dipilih**. Pemilik dan admin mengakses seluruh proyek dalam ruang kerjanya. Untuk anggota lain, pilih proyek dan subproyek satu per satu; daftar kosong berarti tidak ada proyek yang diizinkan. Proyek harus sudah tersinkron ke server sebelum dapat diberikan aksesnya.

Undangan email hanya ditautkan ke akun yang emailnya sudah diverifikasi di PocketBase. Siapkan pengiriman email/verifikasi server; pada instalasi internal, administrator juga dapat memverifikasi pengguna melalui dashboard PocketBase setelah memeriksa identitasnya. Email anggota tidak dapat diganti untuk memindahkan identitas akun; buat undangan baru.

Server menolak daftar/baca/tulis/hapus di luar izin, termasuk pemalsuan `project`, relasi induk, dan perubahan izin oleh anggota sendiri. Record tim tidak boleh dipindah antarproyek karena data turunannya bisa memiliki izin berbeda; buat salinan di proyek tujuan. Bot memeriksa ulang izin melalui server sebelum menangani data tim, membatasi tugas/rangkuman/notifikasi, dan tidak menjalankan asisten AI bebas untuk kontak ruang kerja. Perintah bot terstruktur tetap tersedia.

Saat izin dicabut, permintaan server langsung ditolak. Perangkat membersihkan salinan proyek pada sinkron berikutnya dan dapat menarik ulang data saat akses diberikan kembali. Data tim dikecualikan dari snapshot pribadi Google Drive/folder agar snapshot lama tidak mengembalikan data yang sudah dicabut. Akses offline, backup yang sudah dibuat, dan file yang sudah diekspor tidak dapat ditarik kembali dari perangkat; pencabutan memerlukan perangkat tersambung untuk membersihkan cache.

## Laporan mingguan

Buka **OKR** atau **KPI → Laporan mingguan**, pilih tanggal dalam minggu yang diinginkan, lalu simpan **PDF** atau **Excel**. Laporan mengikuti lingkup proyek yang sedang dipilih, dari Senin hingga Minggu menurut zona waktu perangkat.

Laporan berisi nilai awal/akhir dan perubahan OKR, check-in, KPI harian, rata-rata data terisi, hari tercapai, dan catatan KPI. Data yang belum tersedia tetap kosong; nilai nol tetap nol. Nama/target mengikuti definisi saat ekspor, dan data arsip ikut disertakan. Excel mempertahankan teks Unicode; PDF memakai font standar Latin dan menyederhanakan simbol yang tidak didukung.

## Pratinjau file

Pilih file di **File** untuk melihat panel detail. Gambar raster dan PDF sampai 10 MB ditampilkan; PDF mempunyai navigasi halaman. Teks UTF-8 sampai 256 KB ditampilkan sebagai teks biasa, dengan penanda jika terpotong. HTML tidak dijalankan dan SVG aktif tidak ditampilkan. File yang terlalu besar atau tidak didukung tetap dapat dibuka lewat aplikasi Windows.

## Enkripsi snapshot

1. Di **Pengaturan → Data & keamanan → Enkripsi snapshot sinkronisasi**, masukkan kata sandi minimal 12 karakter dua kali.
2. Untuk data lama, tutup Ruangku pada perangkat lain dan tunggu cloud selesai menyinkronkan file.
3. Pilih konfirmasi bahwa perangkat lain dijeda, lalu **Enkripsi snapshot lama**. Proses mencakup folder sinkronisasi dan akun Google yang sedang terhubung. Kegagalan dapat dicoba ulang; snapshot yang sudah terenkripsi diperiksa tanpa ditulis ulang.
4. Perbarui semua perangkat, masukkan kata sandi yang sama pada setiap perangkat, lalu lanjutkan sinkronisasi. Jangan menggunakan klien lama untuk menulis snapshot plaintext.

Format menggunakan AES-256-GCM dengan salt dan nonce acak, serta PBKDF2-SHA-256 600.000 iterasi. Semua snapshot diperiksa sebelum data digabung atau diunggah. Kata sandi salah atau isi yang berubah menghentikan sinkronisasi tanpa menimpa snapshot. Kata sandi hanya disimpan melalui Windows Credential Manager; fitur menolak penyimpanan plaintext jika fasilitas itu tidak tersedia.

Enkripsi berlaku pada isi snapshot sinkronisasi. Database lokal, backup, ekspor, nama file/perangkat, dan riwayat versi lama milik penyedia cloud tidak otomatis dienkripsi/dihapus. Tidak tersedia pemulihan kata sandi atau rotasi kata sandi. Tombol membuka ulang digunakan untuk memasukkan kata sandi yang sama, bukan mengganti kunci data.

## Pemeriksaan sebelum rilis

- `npm ci`, `npm test -- --maxWorkers=4`, `npm run build`.
- `cargo test --locked --manifest-path src-tauri/Cargo.toml` pada Windows dengan MSVC.
- `PB_TEST_BIN=<path-pocketbase> node server/run-access-test.mjs` (database sementara, hanya loopback). Workflow PR menjalankannya otomatis.
- Pada installer Windows: coba Selesai/Tunda, termasuk seri berulang; pratinjau gambar/PDF/teks; login dan putus koneksi Google/Microsoft; konflik/hapus/offline; migrasi snapshot dua perangkat; dan instal pembaruan bertanda tangan, termasuk penolakan installer/signature/versi yang diubah.

Pemeriksaan akun OAuth nyata, instalasi updater produksi, dan tampilan native tetap membutuhkan konfigurasi serta uji manual tersebut sebelum rilis umum.
