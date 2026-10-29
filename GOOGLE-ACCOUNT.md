# Akun Google dan sinkronisasi Ruangku

## Mengaktifkan

1. Di Google Cloud, buat/pilih satu project untuk Ruangku dan aktifkan **Google Drive API**.
2. Konfigurasikan OAuth consent screen. Minta scope `openid`, `email`, dan `https://www.googleapis.com/auth/drive.appdata`. Selama berstatus Testing, tambahkan akun yang akan dipakai sebagai test user. Izin offline pada aplikasi Testing dapat kedaluwarsa; masuk ulang bila diminta.
3. Buat OAuth client bertipe **Desktop app**, bukan Web application. Alur login menggunakan browser sistem, loopback `127.0.0.1` dengan port dinamis, state, dan PKCE S256.
4. Buka **Pengaturan → Akun Google → Konfigurasi Google** di Ruangku. Isi Client ID dan client secret desktop, lalu **Masuk dengan Google**. Ruangku akan menggabungkan data lokal dengan data akun tersebut.
5. Pada komputer Windows lain, pasang build yang sama, gunakan konfigurasi OAuth dari project yang sama dan masuk dengan akun Google yang sama. Google Drive for Desktop tidak diperlukan.

Distribusi aplikasi dapat memasukkan `VITE_GOOGLE_CLIENT_ID` dan `VITE_GOOGLE_CLIENT_SECRET` saat build. Nilai OAuth desktop adalah konfigurasi public client yang dapat dibaca dari aplikasi, bukan rahasia server. Jangan masukkan kredensial OAuth web atau refresh token ke variabel build. Refresh token pengguna disimpan terpisah melalui penyimpanan rahasia aplikasi (Windows Credential Manager, mengikuti fallback lokal yang sudah ada).

## Perilaku

- Sinkron otomatis setiap tiga menit selama jendela utama berjalan, sepuluh detik setelah perubahan, saat koneksi kembali, atau melalui tombol **Sinkronkan sekarang**.
- Snapshot perangkat hanya diunggah ulang bila isinya berubah, jadi sinkron berkala tanpa perubahan hanya mengunduh.
- Setiap perangkat menulis snapshot miliknya sendiri di folder data aplikasi tersembunyi Google Drive. Semua snapshot dibaca dan divalidasi dahulu, lalu digabung oleh mesin database yang sudah mendukung penggabungan per kolom serta penghapusan.
- Pengaturan yang ikut: tema, tampilan (kecuali **ukuran tampilan/zoom**, yang tetap per perangkat karena tiap layar berbeda), sidebar/favorit, lebar panel, susunan/tab dasbor, ukuran dan pilihan kalender, modul yang disembunyikan, serta tata letak halaman. Perubahan pada pengaturan yang sama menggunakan nilai terbaru; bukan penggabungan tiap properti JSON pengaturan.
- Pengaturan lama tanpa waktu perubahan diberi waktu awal sehingga pilihan tersimpan di cloud tidak ditimpa oleh bawaan perangkat baru.
- Konfigurasi login/konektor, token, kunci API, folder sinkron, identitas perangkat, dan lokasi jendela tidak disinkronkan. Subscription kalender eksternal dan workspace tim juga dikecualikan. Berkas fisik di File Manager dan lampiran gambar lokal tidak diunggah; referensi file mungkin hanya berfungsi di perangkat asal.
- Ini berbeda dari konektor Google Calendar. Konektor tersebut tetap dipakai untuk pertukaran acara kalender.
- Saat offline, data lokal tetap dapat diedit. Kegagalan tampil di tab Akun Google; percobaan diulang otomatis.
- Keluar menghentikan sinkron dan menghapus token lokal; data lokal dan cloud tetap ada. Untuk mencegah data antar-akun tercampur, database ini tetap terikat ke identitas Google pertama. Pergantian ke akun lain memerlukan profil/database terpisah (pemilih banyak akun belum tersedia).
- Aplikasi saat ini adalah aplikasi desktop Windows. Perubahan ini belum membuat versi web, Android, atau iOS.

## Pengujian sebelum rilis

Jalankan `npm test`, `npm run build`, dan `cargo test --manifest-path src-tauri/Cargo.toml`.
Dengan OAuth yang sudah dikonfigurasi, gunakan dua instalasi Windows: ubah ikon ruang dan ukuran kalender di A, sinkron di B, lalu ubah catatan dan hapus tugas di B. Pastikan A menerima keduanya. Uji juga mode offline, izin ditolak/dicabut, keluar/masuk ulang, serta akun Google berbeda yang harus ditolak tanpa mengunggah data.

Dokumentasi resmi: [OAuth desktop](https://developers.google.com/identity/protocols/oauth2/native-app), [Google Drive app data](https://developers.google.com/workspace/drive/api/guides/appdata).
