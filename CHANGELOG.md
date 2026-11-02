# Catatan perubahan

Semua perubahan penting pada Ruangku dicatat di sini. Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/), dan nomor versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Distribusi

- Workflow GitHub Actions dirapikan menjadi **CI** (pull request dan push ke `main`: uji dan uji asap Windows berjalan bersamaan, run lama dibatalkan otomatis, perubahan dokumentasi saja tidak memicu build) dan **Rilis** (tag `v<versi>`: memeriksa tag sama dengan versi aplikasi sebelum menerbitkan).

## [1.0.0] - 2026-11-02

Rilis stabil pertama Ruangku untuk Windows 10 dan 11.

### Fitur

- **Hari ini**: dasbor yang bisa diatur, dengan garis waktu, agenda, tugas, rapat, kuliah, keuangan, ibadah, KPI, dan OKR, serta tab kalender.
- **Tugas & proyek**: proyek dan subproyek bersarang, status kustom per proyek, tampilan List, Kanban, Tabel, Kalender, Timeline/Gantt, dan Rencana hari, dependensi, tugas berulang, kolom kustom, timer, otomasi jika-maka, dan template.
- **Kalender**: tampilan Hari, Minggu, Bulan, Agenda, dan Tahun yang menyatukan blok jadwal, tugas, pengingat, milestone, waktu sholat, serta libur nasional dan cuti bersama; langganan ICS, Google Calendar dua arah, Outlook Calendar, dan ekspor `.ics`.
- **Rapat & kuliah**: agenda, peserta, tautan Zoom/Meet/Teams, rapat berulang, notulen, dan action item; mata kuliah dengan jadwal semester, presensi, ujian, nilai, dan IPK.
- **Catatan**: editor blok ala Notion yang tetap menyimpan Markdown, halaman bersarang, tautan `[[`, backlink, template, komentar, dan impor pustaka BibTeX.
- **Keuangan**: akun dan dompet, transfer, anggaran, tagihan rutin, arus kas, proyeksi 30 hari, catat cepat dari teks, serta laporan donatur untuk dana titipan.
- **OKR, KPI harian, dan Evaluasi** harian, mingguan, dan bulanan dengan ringkasan otomatis.
- **Ibadah**: jadwal sholat offline (kriteria Kemenag RI), pengingat sholat dan puasa sunnah, kalender Hijriah, skor dan konsistensi, mode udzur, dan mode Ramadan.
- **Desktop Windows**: widget transparan, sticky note, catat cepat dengan Ctrl+Shift+Space, notifikasi dengan tombol Selesai/Tunda, ikon tray, pengingat istirahat, dan jalan otomatis saat Windows menyala.
- **Sinkronisasi & kolaborasi**: sinkron lewat folder cloud atau akun Google Drive dengan penggabungan per kolom, server tim PocketBase dengan peran dan izin per proyek, komentar dengan @sebutan, serta bot WhatsApp, Telegram, dan Gmail.
- **AI**: asisten di aplikasi (Claude, ChatGPT, atau model kompatibel OpenAI seperti Ollama) dan server MCP untuk Claude Desktop, Claude Code, dan ChatGPT.
- **Data & keamanan**: database lokal SQLite, backup otomatis harian dengan pemulihan satu klik, rahasia di Windows Credential Manager, enkripsi snapshot sinkronisasi, log dan halaman diagnostik, serta pembaruan di dalam aplikasi yang diverifikasi tanda tangan.

### Keandalan

- Membuka widget, sticky note, catat cepat, atau layar istirahat tidak lagi bisa membuat aplikasi macet di Windows dengan semua halaman kosong. Jendela tambahan kini selalu dibuat di luar utas utama.
- Perintah yang menyentuh disk, jaringan, registry, atau Credential Manager berjalan di latar sehingga tampilan tidak membeku.
- Bila Ruangku tidak merespons, tampil banner berisi cara memulihkan alih-alih halaman kosong.
- Ikon tray yang gagal dibuat tidak lagi menghentikan aplikasi.
- Halaman yang gagal digambar menampilkan pesan dengan tombol **Coba lagi**, bukan membuat seluruh aplikasi kosong.
- Catatan, tugas, rapat, dan kuliah yang datang tanpa sebagian kolom (dari sinkron, bot, asisten AI, atau versi lama) tidak lagi membuat halamannya gagal tampil.
- Installer menawarkan untuk mencopot salinan Ruangku lama yang dipasang lewat `.msi`, karena dua salinan bisa membuat aplikasi tidak mau terbuka.
- Rapat berulang dari data demo tidak lagi tertinggal setelah data demo dihapus; sisa dari versi sebelumnya dibersihkan otomatis.

### Distribusi

- Installer NSIS berbahasa Indonesia untuk pengguna saat ini (tanpa hak admin) dan `.msi` untuk penerapan IT.
- Setiap build lulus uji frontend, uji backend, dan uji asap di Windows sungguhan (pasang, buka semua halaman dan jendela, tutup paksa, pasang ulang, copot) sebelum diterbitkan, beserta checksum SHA-256 dan attestation asal-usul build.

[Belum dirilis]: https://github.com/yahyaaliman/ruangku/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yahyaaliman/ruangku/releases/tag/v1.0.0
