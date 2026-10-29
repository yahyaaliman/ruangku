# Ruangku

**Baru di versi 0.5: ikon ruang, tab kalender dasbor, dan akun Google**

- Klik ikon di sidebar atau tombol ikon pada formulir proyek untuk memilih, mencari, mengacak, atau menghapus emoji. Tombol ikon kini dapat digunakan lewat keyboard.
- **Hari ini → Kalender** membuka kalender dalam tab dasbor. Menu **Tampilan** mengatur tinggi kalender, tinggi baris minggu pada tampilan Bulan, dan tinggi per jam pada Hari/Minggu. Pilihan disimpan.
- **Pengaturan → Akun Google** menyediakan login dan sinkronisasi data serta pengaturan tampilan antarinstalasi Windows melalui Google Drive. Perlu konfigurasi OAuth Desktop dan Drive API sebelum bisa digunakan: lihat [panduan aktivasi akun Google](GOOGLE-ACCOUNT.md).

Aplikasi desktop Windows untuk mengatur hari kerja dalam satu tempat. Panduan lengkap ada di aplikasi (menu **Panduan**, F1) dan di [PANDUAN.md](PANDUAN.md).

**Baru di versi 0.4.1: semua tampilan bisa diatur**

- **Tampilan umum** (Pengaturan → Umum → Tampilan, atau ikon **Aa** di sidebar): tema, 8 warna aksen (terang & gelap), ukuran tampilan 80–150% (Ctrl+= / Ctrl+−, zoom native WebView2), kepadatan Ringkas/Nyaman/Lega, lebar halaman Normal/Lebar/Penuh, huruf, sudut, dan kurangi animasi.
- **Tombol Tampilan per halaman**: sembunyikan/tampilkan, urutkan, dan atur lebar bagian di Hari ini, Tugas (termasuk properti yang tampil), Kalender, Proyek, Rapat, Kuliah, Keuangan, OKR, KPI, Ibadah, dan Evaluasi. Tersimpan per perangkat di setelan `layout_<halaman>`.
- **Panel yang bisa ditarik** (seret garis tepi, klik dua kali untuk bawaan, panah kiri/kanan saat fokus) di Tugas, Catatan, Kalender, File, Rapat, Kuliah, Jadwal harian, dan timeline Proyek.

**Versi 0.4**

- **Sidebar Ruang ala Notion**: proyek → subproyek → halaman catatan sebagai daftar bersarang (bukan dropdown). Seret untuk memindah/menyusun, klik kanan untuk menu konteks (fokus, tambah halaman/subproyek, favorit, ganti nama F2, ikon emoji, warna, pindahkan, duplikat Ctrl+D, arsip, hapus), bagian Favorit, Modul yang bisa diatur, lebar bisa ditarik, Ctrl+\ untuk menyembunyikan, dan Sampah 30 hari.
- **Editor catatan ala Notion**: perintah `/` berkelompok (Dasar, Media, Sebut, Ruangku, Warna), **menu blok ⋮⋮** (hapus, duplikat, ubah menjadi, warna teks/latar, pindah, jadikan tugas, operasi tabel) dengan seret blok, **menu konteks**, bilah format saat memilih teks, toggle, callout, daftar isi, warna, tabel, gambar (tempel/seret, ubah lebar), dan sampul halaman. Isi tetap disimpan sebagai Markdown.
- **Rapat** di semua fitur: agenda, peserta & tamu, lokasi, tautan Zoom/Meet/Teams dengan tombol **Gabung**, rapat berulang, undangan & ringkasan lewat WA/Telegram/email, notulen dari template, action item menjadi tugas. Rapat otomatis menjadi blok di Kalender, Jadwal, widget, notifikasi, rangkuman pagi, Google Calendar, Ctrl+K, dasbor, bot (`rapat`), dan asisten AI.
- **Kuliah** di semua fitur: mata kuliah dengan jadwal mingguan satu semester (melewati libur nasional), presensi per pertemuan, ujian, tugas kuliah, komponen nilai, IPS/IPK skala ITB, catatan per pertemuan; tampil di Kalender, Jadwal, widget, dasbor, Ctrl+K, bot (`kuliah`), dan asisten (`jadwal_kuliah`, `catat_presensi`).
- **Keuangan pribadi & proyek** (buku kas yang diperluas): akun/dompet dengan saldo, transfer antarakun, kategori pribadi/proyek/dana titipan, **anggaran** bulanan dan total proyek, **tagihan & pemasukan rutin** (bisa dicatat otomatis), **arus kas** 6/12 bulan, proyeksi saldo 30 hari, catat cepat dari teks (`25rb makan siang`) di aplikasi, Ctrl+Shift+Space, dan bot (`keluar …`, `masuk …`, `kas`), plus laporan donatur.
- **Pengaturan bertab**: Umum (tema terang/gelap/ikuti Windows, sidebar & menu), **Widget** (semua opsi dengan pratinjau), **Connector** (Claude/ChatGPT, kalender, server tim, Telegram, WhatsApp, Gmail, folder cloud, GitHub), **Plugin & ekstensi** (nyalakan/matikan modul dan otomatisasi), Notifikasi, Data & keamanan.
- **Integrasi ChatGPT & Claude**: asisten bisa memakai **ChatGPT (OpenAI Responses API)** selain Claude dan Ollama; Ruangku juga menjadi **server MCP** (revisi 2026-07-28 + klien lama) untuk **Claude Desktop** (`ruangku.exe --mcp`), **Claude Code** (HTTP + token), dan **ChatGPT** (Secure MCP Tunnel), serta ekspor **konteks proyek** Markdown untuk Claude/ChatGPT Projects.
- **Dasbor** dengan panel Rapat berikutnya, Kuliah, dan Keuangan; tema gelap/terang manual.

**Versi 0.3**

- **Kalender** (Ctrl+4): tampilan Hari, Minggu, Bulan, Agenda, dan Tahun yang menyatukan blok jadwal, tugas, pengingat, milestone, periode proyek, waktu sholat, dan **hari libur nasional & cuti bersama** (SKB 3 Menteri 2026–2027, tanpa internet). Seret untuk memindah, tarik untuk mengubah durasi, buat blok/tugas/pengingat langsung di grid. Langganan **ICS**, **Google Calendar dua arah** (OAuth desktop), dan ekspor `.ics`.
- **Widget** yang lebih lengkap: agenda gabungan dengan kartu *Sekarang* dan hitung mundur, **mode mini**, bagian yang bisa dilipat dan diurutkan, warna aksen, dan penempatan cepat ke sudut atau tepi layar.
- **Palet perintah Ctrl+K**: cari tugas, catatan, proyek, OKR, KPI, blok, dan halaman; buat tugas dengan bahasa sehari-hari; lompat ke tanggal; jalankan aksi dengan `>`.
- **Keamanan & keandalan**: kunci API dan token disimpan di **Windows Credential Manager**; **backup otomatis harian** dengan rotasi dan pemulihan satu klik (selalu didahului backup *sebelum-pulihkan*); pemeriksaan **pembaruan** dari GitHub Releases; log berotasi dan halaman diagnostik; installer bisa **ditandatangani** di GitHub Actions.
- **Kolaborasi**: **komentar dengan @sebutan** dan kotak masuk, sinkron tim **realtime** (SSE PocketBase), **penggabungan per kolom** sehingga dua orang yang mengubah tugas yang sama tidak saling menimpa, dan antarmuka **hanya-baca** untuk peran pembaca.
- **Kolom kustom per proyek** (teks, angka, rupiah, pilihan, tanggal, centang, tautan) dan tampilan **Tabel** tugas dengan jumlah dan ekspor CSV.
- **Buku kas** per proyek untuk infaq/sedekah/zakat: saldo berjalan, rekap donatur, **laporan donatur** siap cetak/PDF, ekspor CSV.
- **Impor pustaka BibTeX/Zotero** menjadi halaman Pustaka (APA 7) dan catatan baca per referensi.
- **Rangkuman pagi** lewat Telegram/WhatsApp/email atau notifikasi desktop: agenda, tugas jatuh tempo/terlambat, waktu sholat, dan hari libur.
- **Jadwal sadar ibadah**: waktu sholat dilindungi (Jumat otomatis jadi sholat Jumat), blok yang bentrok bisa digeser ke setelah sholat, pengingat istirahat bisa diselaraskan dengan adzan, dan asisten AI menghindari waktu sholat saat merencanakan hari.

**Versi 0.2**

- **Proyek & subproyek di semua modul**: pemilih proyek di kiri atas (Ctrl+P) memfokuskan Tugas, Jadwal, OKR, KPI, Evaluasi, Catatan, File, dan dasbor ke satu proyek beserta subproyeknya. Proyek punya periode, milestone, folder, penanggung jawab, dan bisa dibagikan ke tim.
- **Timeline bertingkat**: Tahun → Triwulan → Bulan → Minggu → Hari, dengan batang proyek/subproyek/tugas yang bisa diseret, milestone, dan periode OKR.
- **Evaluasi per proyek** dengan pilihan diagram batang, garis, donat, heatmap, atau tabel.
- **Jadwal harian** 1/3/7 hari, **vertikal atau horizontal**, ukuran bisa diatur, baki tugas, template hari.
- **Widget** vertikal/horizontal dengan ukuran siap pakai, pemilih proyek sendiri, bagian Tugas, catatan cepat, dan **sticky note** di desktop.
- **Pengingat istirahat** 50/10 (bisa diubah) + istirahat mata 20-20-20, deteksi idle Windows, layar istirahat.
- **Asisten AI** (Claude atau Ollama/endpoint kompatibel OpenAI) untuk rekomendasi dan tambah/ubah data; penghapusan selalu minta persetujuan.
- **Kolaborasi tim** lewat server PocketBase sendiri, dengan peran per email (pemilik, admin, editor, kontributor, pembaca) yang ditegakkan server.
- **Bot WhatsApp (Cloud API resmi), Telegram, dan Gmail**: kirim penugasan, terima perintah (`tugas`, `selesai KODE`, `tunda KODE besok`, …), pesan bebas dijawab AI sesuai peran.
- **Database demo** (Internal, Jitu, Kuliah, Penitipan Infaq, Recruitment, Riset Thesis) terisi otomatis saat pertama kali dibuka, plus tur singkat dan halaman Panduan.

- **Hari ini**: tanggal, garis waktu jam, agenda tersisa, isian KPI cepat, ringkasan OKR, catatan terbaru.
- **Jadwal & reminder**: reminder sekali atau berulang (harian, hari kerja, mingguan, bulanan), pengingat lebih awal, prioritas, kategori, tunda 10 menit / 1 jam. Notifikasi Windows tetap muncul walau jendela ditutup, karena aplikasi tetap berjalan di system tray.
- **OKR**: objective per kuartal, key result dengan nilai awal/target/saat ini (target naik maupun turun), check-in dengan riwayat, status *sesuai jalur / perlu perhatian / tertinggal* dibanding waktu kuartal yang sudah berjalan.
- **KPI harian**: target harian (≥ atau ≤), isian per tanggal, grafik 14 hari, persentase tercapai 30 hari, streak, riwayat 30 hari. KPI bisa dihubungkan ke objective.
- **Catatan**: Markdown dengan pratinjau, tag, sematkan, pencarian, simpan otomatis.
- **File manager**: jelajah semua drive, folder baru, file baru, salin / potong / tempel, ganti nama, hapus ke Recycle Bin, cari nama file, hitung ukuran folder, favorit, tag file, buka dengan aplikasi default, tampilkan di Explorer. Pintasan seperti Explorer (F2, Delete, Ctrl+C/X/V, Ctrl+A, Backspace, Alt+←/→, F5).
- **Sinkronisasi cloud** lewat folder OneDrive / Google Drive for Desktop / Dropbox, plus backup dan pulihkan ke file JSON.
- **Tugas & proyek**: subtugas, checklist, status kustom per proyek, prioritas, tenggat & jam, estimasi, tag, dependensi, tugas berulang, tertaut ke key result. Tampilan List, Kanban, Kalender, Timeline/Gantt, dan Rencana hari.
- **Time tracking & timeboxing**: timer per tugas yang otomatis menjadi blok waktu tercatat, seret tugas ke grid jam, kapasitas & beban kerja harian, laporan waktu per proyek.
- **Catatan ala Notion**: editor blok dengan perintah `/`, halaman bersarang, tautan `[[`, backlink, tugas dari catatan, template.
- **Otomasi, template, dasbor kustom, catat cepat**: aturan jika-maka, template proyek & hari, panel dasbor yang bisa diatur, dan pintasan global Ctrl+Shift+Space.
- **Ibadah**: jadwal sholat offline (kriteria Kemenag RI) untuk 48 kota Indonesia atau koordinat sendiri, reminder sholat wajib dan sunnah, puasa sunnah otomatis dari kalender Hijriah, pencatatan kualitas sholat, skor harian, konsistensi 7 hari, muhasabah, mode udzur, dan mode Ramadan.
- **Evaluasi harian, mingguan, bulanan**: ringkasan otomatis (aktivitas, KPI, reminder, OKR, ibadah, energi) plus pertanyaan refleksi dan target periode berikutnya, dengan notifikasi pengingat.
- **Notifikasi tiap aktivitas**: pengingat sebelum blok waktu dimulai dan saat selesai, bisa diatur per blok, dengan jam tenang.
- **Widget desktop transparan**: jam, agenda (bisa dicentang), isian KPI, progres OKR, dan catatan disematkan langsung di desktop. Lihat bagian *Widget desktop* di bawah.
- **Jalan otomatis** saat Windows menyala (opsional).
- **Proyek, timeline, evaluasi per proyek, asisten AI, tim & bot, pengingat istirahat**: lihat *Baru di versi 0.2* di atas dan bagian di bawah.

Semua data disimpan lokal di `%APPDATA%\com.ruangku.app\ruangku.db` (SQLite).

---

## Cara tercepat: installer dari GitHub (tanpa memasang Rust)

1. Buat repository baru di GitHub, lalu unggah isi folder ini (atau `git push`).
2. Buka tab **Actions** → **Build Windows**. Workflow berjalan otomatis setiap push ke `main` (atau klik **Run workflow**). Uji frontend dan backend dijalankan dulu sebelum build.
3. Setelah selesai (sekitar 10–15 menit), buka run tersebut dan unduh **Ruangku-Windows-installer** di bagian *Artifacts*.
4. Jalankan `Ruangku_0.5.0_x64-setup.exe`. Installer dipasang untuk user saat ini, tanpa hak admin.

### Rilis dan pembaruan otomatis

Push tag versi untuk menerbitkan installer sebagai **GitHub Release**:

```powershell
git tag v0.5.0
git push --tags
```

Isi nama repo (`pemilik/ruangku`) di Ruangku → **Pengaturan → Pembaruan aplikasi**. Ruangku memeriksa rilis terbaru sekali sehari dan menampilkan catatan rilis serta tombol unduh installer. Naikkan versi di `package.json`, `src-tauri/tauri.conf.json`, dan `src-tauri/Cargo.toml` sebelum membuat tag.

### Tanda tangan kode (opsional)

Tanpa tanda tangan, Windows SmartScreen memperingatkan saat installer dijalankan (klik **More info → Run anyway**). Bila Anda punya sertifikat code signing (.pfx):

1. Ubah ke base64: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("sertifikat.pfx")) | Set-Clipboard`
2. Di GitHub: **Settings → Secrets and variables → Actions**, tambahkan `WINDOWS_CERT_PFX` (isi base64 tadi) dan `WINDOWS_CERT_PASSWORD`.
3. Workflow otomatis menandatangani installer `.exe` dan `.msi` dengan `signtool` (SHA-256, timestamp DigiCert). Tanpa secret, langkah ini dilewati.

Sertifikat OV biasa tetap perlu membangun reputasi SmartScreen dari jumlah unduhan; sertifikat EV langsung dipercaya.

## Build sendiri di Windows

Pasang sekali:

1. **Node.js 20 atau lebih baru**: https://nodejs.org
2. **Rust**: https://rustup.rs (pilih opsi default)
3. **Microsoft C++ Build Tools**: https://visualstudio.microsoft.com/visual-cpp-build-tools/ → centang *Desktop development with C++*
4. WebView2 sudah ada di Windows 10/11.

Lalu di folder proyek:

```powershell
npm install
npm run app:dev      # jalankan dalam mode pengembangan (hot reload)
npm run app:build    # buat installer di src-tauri\target\release\bundle\
```

Uji otomatis:

```powershell
npm test             # logika tugas, kalender & ICS, libur, OKR, KPI, buku kas, BibTeX, komentar, rangkuman pagi, dll.
npm run test:rust    # database & penggabungan per kolom, backup/pulihkan, sinkronisasi, reminder, istirahat, file
```

Pratinjau tampilan saja di browser (data contoh, file manager tiruan): `npm run dev` lalu buka http://localhost:1420.

---

## Tugas & proyek

Halaman **Tugas** punya ruang lingkup Inbox, Hari ini, 7 hari ke depan, Semua tugas, dan proyek. Setiap proyek punya alur status sendiri (misalnya Antrean → Dikerjakan → Review klien → Selesai).

- **Tambah cepat** dari kolom atas atau jendela catat cepat. Teks dibaca otomatis: `besok`, `lusa`, `jumat`, `5 nov`, `10/3`, `jam 14`, `jam 5 sore`, `#tag`, `!tinggi` atau `!1`–`!4`, `@NamaProyek`, `~30m`/`~2j`, `setiap hari`/`hari kerja`/`setiap minggu`/`setiap bulan`.
- **Panel detail**: status, proyek, prioritas, mulai, tenggat & jam, estimasi, pengulangan, tag, tautan ke key result (nilai KR naik otomatis saat tugas selesai), checklist, subtugas, dependensi (dengan pencegahan siklus), deskripsi, dan waktu tercatat.
- **Tabel**: kolom bawaan plus **kolom kustom** proyek (teks, angka, rupiah, pilihan, tanggal, centang, tautan; diatur di formulir proyek dan diwarisi subproyek). Urutkan per kolom, ubah status/tenggat/kolom kustom langsung di sel, baris jumlah untuk angka dan rupiah, ekspor CSV (pemisah `;` untuk Excel Indonesia).
- **Komentar** di setiap tugas, dengan `@sebutan` anggota yang masuk ke kotak masuk dan kanal bot mereka.
- **List** dikelompokkan per status (proyek) atau per tenggat (lintas proyek). **Kanban**: seret kartu antar kolom; di luar proyek, kolom berupa prioritas. **Kalender**: seret tugas ke tanggal lain, klik ganda untuk menambah, garis beban per hari. **Timeline/Gantt**: seret batang untuk menggeser, tarik ujung untuk mengubah mulai/tenggat, panah dependensi (merah putus-putus bila jadwal bertabrakan), baris beban harian.
- **Rencana hari**: seret tugas dari baki ke grid jam untuk membuat blok waktu sesuai estimasinya. Kapasitas harian (default 6 jam) bisa diubah; ada peringatan bila rencana melebihinya. Baki yang sama ada di detail hari pada widget.
- **Timer**: tombol ▶ di setiap tugas. Saat dihentikan, sesi otomatis menjadi blok waktu tercatat (bergaris) di grid jam, dipecah per tanggal bila melewati tengah malam. Timer aktif tampil di sidebar dan widget. Waktu tercatat masuk ke Evaluasi (total dan per proyek) dan dasbor.
- **Otomasi** (Tugas → Otomasi): pemicu "tugas dibuat", "status berubah menjadi …", "tugas selesai", "tenggat tiba", "semua subtugas selesai"; aksi ubah prioritas, tambah tag, ubah status, pindah proyek, atur tenggat, tambah checklist, kirim notifikasi, selesaikan induk. Ada tiga aturan siap pakai.
- **Template** (Tugas → Template): template proyek (Proyek klien, Peluncuran produk, Belajar skill baru, Acara) dengan tanggal relatif dan dependensi, atau simpan proyek Anda sendiri sebagai template. Template hari (Hari kerja fokus, Hari kuliah, Akhir pekan) menyusun blok waktu, atau simpan susunan hari sendiri.
- **Catat cepat**: tekan **Ctrl+Shift+Space** dari aplikasi mana pun, ketik, Enter. Juga ada di menu tray. Bila pintasan sudah dipakai aplikasi lain, menu tray tetap bisa dipakai.

## Kalender

Halaman **Kalender** (Ctrl+4) menggabungkan semua sumber waktu dalam satu tampilan, mengikuti pemilih proyek.

- **Tampilan**: Hari, Minggu (mulai Senin), Bulan (dengan tanggal Hijriah), Agenda 30 hari, dan Tahun (heatmap). Pintasan D/W/M/A/Y, T (hari ini), ←/→, N (buat).
- **Lapisan**: blok jadwal, waktu tercatat, tugas (pada tenggatnya), pengingat (termasuk yang berulang), milestone, periode proyek, waktu sholat, dan kalender luar. Hari libur ditandai merah.
- **Interaksi**: seret blok/tugas/pengingat/milestone ke jam atau tanggal lain, tarik tepi blok untuk durasi, klik ruang kosong untuk membuat blok/tugas/pengingat, klik acara untuk mengubah judul dan jam, menandai selesai, membuka sumbernya, atau menghapus (dengan *Batalkan*).
- **Hari libur**: libur nasional dan cuti bersama 2026–2027 tertanam di aplikasi (sumber: SKB 3 Menteri), jadi tetap tampil tanpa internet.
- **Langganan ICS**: URL `https://` atau `webcal://` (kalender kampus, alamat rahasia iCal Google/Outlook). Pengulangan RRULE (harian/mingguan/bulanan/tahunan, INTERVAL, COUNT, UNTIL, BYDAY, EXDATE) dan zona waktu diterjemahkan.
- **Google Calendar dua arah**: buat OAuth client jenis *Desktop app* di Google Cloud Console, tempel Client ID & secret, lalu **Hubungkan**. Login memakai alur loopback + PKCE di browser. Kalender Google pilihan tampil di Ruangku; blok jadwal Ruangku dikirim ke satu kalender tujuan dan perubahan jam atau penghapusan di Google ikut kembali. Sinkron tiap 10 menit dan 20 detik setelah blok berubah.
- **Ekspor .ics** blok, tugas bertenggat, dan milestone untuk diimpor ke aplikasi kalender lain.
- **Jadwal sadar ibadah**: rentang sholat (Subuh 20, Dzuhur 15, Ashar 15, Maghrib 20, Isya 15 menit dari adzan; Jumat 60 menit mulai 15 menit sebelum adzan) diarsir; blok yang menimpanya memunculkan peringatan dengan tombol **Geser ke …**.

## Rapat & kuliah

- **Rapat** (`meeting`, seri `meetingseries`): setiap rapat punya blok jadwal `blk-<id>` berjenis `rapat` yang diselaraskan dua arah (perubahan terbaru menang; rapat batal menghapus bloknya). Rapat berulang dibuat sampai 8 minggu ke depan dengan id `mt-<seri>-<tanggal>`. Menghapus blok rapat = membatalkan rapat.
- **Kuliah** (`course`): pertemuan dibuat sebagai blok `kls-<matkul>-<sesi>-<tanggal>` dan ujian `ujian-<matkul>-<ujian>`; presensi disimpan di blok. Menghapus blok kelas = kelas batal (tidak dihitung presensi). IPS/IPK dari nilai akhir manual atau proyeksi komponen nilai.

## Keuangan

Halaman **Keuangan** (dulu Buku kas) untuk pribadi dan proyek: akun (`account`) dengan saldo awal, transaksi (`ledger`) masuk/keluar/transfer dengan `accountId`/`toAccountId`, anggaran (`budget`, bulanan atau total proyek), dan transaksi berulang (`recurring`, id transaksi tetap `rtx-<id>-<tanggal>` sehingga tidak tercatat ganda antarperangkat). Ringkasan arus kas, kategori, anggaran, proyeksi 30 hari, catat cepat dari teks (`parseMoneyText`), CSV, serta rekap & **laporan donatur** untuk dana titipan (infaq/sedekah/zakat). Asisten & MCP: `catat_kas`, `saldo_kas`, `daftar_transaksi`.

## Integrasi AI (Claude, ChatGPT, MCP)

- **Asisten di aplikasi**: Claude Messages API, **OpenAI Responses API** (`/v1/responses`, function calling, `store: false`, item reasoning terenkripsi dibawa antarlangkah), atau `chat/completions` kompatibel (Ollama).
- **Server MCP**: `src-tauri/src/mcp.rs` (transport) + `src/ai/mcp.ts` (protokol). HTTP di `127.0.0.1:<port>/mcp` dengan token (`Authorization: Bearer` atau `/mcp/<token>`), validasi Origin, `202` untuk notifikasi, `405` untuk GET. Dual-era: revisi **2026-07-28** (tanpa handshake, `_meta` per permintaan, `server/discover`, validasi header `MCP-Protocol-Version`/`Mcp-Method`/`Mcp-Name`, `resultType`, `ttlMs`/`cacheScope`) dan klien lama lewat `initialize` (2025-11-25 s/d 2024-11-05). Jembatan stdio: `ruangku.exe --mcp` membaca port & token dari `mcp.json` di folder data. Alat hapus tidak pernah dibuka; mode baca saja tersedia.
- **Konteks proyek**: `src/ai/contextExport.ts` membuat Markdown untuk Claude/ChatGPT Projects (tanpa keuangan pribadi).

## Catatan

Editor blok (TipTap) dengan isi tetap disimpan sebagai Markdown, jadi catatan lama tetap terbaca dan tersinkron.

- Ketik **/** untuk memilih blok: judul, daftar, daftar centang, kutipan, callout, kode, garis, tanggal, subhalaman, tautkan halaman, jadikan tugas, sisipkan template.
- Ketik **[[** untuk menautkan halaman lain (atau membuat halaman baru dari judul yang diketik). Bagian **Disebut di** menampilkan halaman yang menautkan ke halaman ini.
- Halaman bisa bersarang: seret di pohon samping untuk memindah. Menghapus halaman menaikkan subhalamannya satu tingkat.
- Pintasan Markdown bekerja saat mengetik: `# `, `- `, `1. `, `[ ] `, `> `, ```` ``` ````.
- Template bawaan: Notulen rapat, Jurnal harian, Rencana proyek, Catatan belajar, Review mingguan. Halaman apa pun bisa dijadikan template.
- Klik tautan halaman untuk berpindah; klik tautan tugas untuk membukanya di halaman Tugas.
- **Komentar** dengan `@sebutan` di bawah setiap halaman.
- **Impor daftar pustaka** (`.bib` dari Zotero, Mendeley, Google Scholar): halaman *Pustaka* berisi daftar APA 7 dan, opsional, satu halaman catatan baca per referensi (ringkasan, metode & data, temuan, relevansi untuk thesis). Impor ulang hanya menambah referensi yang kunci sitasinya belum ada.

## Dasbor

Klik **Atur dasbor** untuk menyembunyikan, mengurutkan, dan mengatur lebar panel: Agenda, Tugas hari ini, Ibadah, KPI, OKR, Waktu minggu ini, Proyek, Catatan terbaru.

## Ibadah

Buka halaman **Ibadah**, pilih kota (atau isi koordinat sendiri) dan target sholat wajib. Setelah itu:

- **Jadwal sholat** dihitung offline: Subuh −20°, Isya −18°, Ashar mazhab Syafi'i, imsak 10 menit sebelum Subuh, ihtiyat 2 menit, Dhuha saat matahari 4,5°. Hasilnya diuji dengan jadwal Jakarta Oktober 2026 (selisih maksimal 2 menit). Bila berbeda dengan jadwal masjid setempat, atur **Koreksi waktu sholat** per waktu.
- **Target default sempurna**: sholat wajib berjamaah di masjid (bisa diganti "awal waktu"), rawatib muakkadah 12 rakaat, dhuha 8 rakaat, tahajud 8 + witir 3 rakaat, dzikir pagi & petang, istighfar dan sholawat 100 kali, tilawah 20 halaman (1 juz), puasa Senin-Kamis, Ayyamul Bidh, Arafah, Tasu'a/Asyura, sedekah, kajian. Saat Ramadan: puasa Ramadan dan tarawih. Semua bisa dimatikan atau diubah targetnya.
- **Status sholat**: berjamaah di masjid, berjamaah, sendiri di awal waktu, sendiri, qadha, terlewat. Skor harian = 60% sholat wajib + 40% sunnah yang berlaku hari itu.
- **Reminder ibadah**: sebelum dan saat waktu sholat, dhuha, sepertiga malam terakhir, dzikir pagi/petang, tilawah setelah Isya, serta puasa (niat malam sebelumnya, sahur, imsak, berbuka). Puasa tidak diingatkan pada hari yang dilarang (1 Syawal, 10–13 Dzulhijjah).
- **Mode udzur** (haid/nifas): sholat dan puasa tidak dihitung dan reminder-nya dibisukan, tanpa merusak catatan konsistensi.
- **Kalender Hijriah** tampil di dasbor, widget, dan halaman Ibadah. Kalender dihitung secara aritmatika, jadi bisa selisih 1 hari dengan hasil sidang isbat; sesuaikan di **Koreksi tanggal Hijriah**.
- Di widget: bagian **Ibadah** menampilkan sholat berikutnya, lima tombol sholat (klik untuk memilih status), tilawah, dan puasa hari ini. Di detail hari ada jadwal sholat pada grid jam dan daftar sunnah.

## Evaluasi

Halaman **Evaluasi** punya tab Harian, Mingguan, dan Bulanan. Angka diisi otomatis: persentase aktivitas selesai, KPI tercapai, reminder, kualitas ibadah, check-in dan kemajuan OKR, energi rata-rata. Tampilan mingguan dan bulanan menambahkan peta konsistensi (aktivitas/KPI/ibadah), waktu per jenis aktivitas, konsistensi tiap sholat, dan kumpulan hambatan dari evaluasi harian. Bulanan membandingkan dengan bulan lalu.

Refleksi harian (energi, suasana hati, apa yang baik, apa yang menghambat, prioritas besok) juga bisa diisi dari detail hari di widget. Prioritas besok bisa langsung dijadwalkan sebagai blok 08:00–09:30.

## Notifikasi

Semua notifikasi dikirim oleh proses latar Rust, jadi tetap berbunyi walau jendela ditutup ke tray.

| Jenis | Default | Atur di |
| --- | --- | --- |
| Blok aktivitas | 5 menit sebelum mulai dan saat selesai | Pengaturan → Notifikasi; per blok di editor blok |
| Reminder biasa | sesuai reminder | Jadwal |
| Sholat | 10 menit sebelum dan saat masuk waktu | Ibadah → Pengaturan ibadah |
| Sunnah & puasa | dhuha, tahajud, dzikir, tilawah, sahur, imsak, berbuka | Ibadah → Pengaturan ibadah |
| Evaluasi | harian 21:00, mingguan Minggu 20:00, bulanan hari terakhir 20:30 | Pengaturan → Notifikasi |

**Jam tenang** (default 22:00–05:00) membisukan notifikasi aktivitas dan evaluasi. Reminder ibadah dan reminder biasa tetap berbunyi. Notifikasi yang terlewat lebih dari 15 menit (misalnya komputer baru dinyalakan) tidak dikirim lagi.

## Widget desktop

Aktifkan dari **Pengaturan → Widget desktop**, atau klik kanan ikon Ruangku di tray → **Tampilkan / sembunyikan widget**.

- **Geser**: tarik dari area mana saja di widget (kecuali tombol dan kotak isian).
- **Ubah ukuran**: tarik tepi kiri, kanan, bawah, atau sudut kanan bawah.
- **Atur tampilan**: arahkan kursor ke widget, lalu klik ikon pengatur di kanan atas. Semua perubahan langsung terlihat:
  - Gaya cepat: *Kaca gelap, Kaca terang, Bening, Blur Windows, Solid*
  - Warna gelap/terang, kepekatan latar 0–100%, ukuran teks 70–150%, sudut membulat
  - Efek latar Windows: tanpa, Blur, Acrylic, atau Mica (Mica hanya Windows 11)
  - Warna aksen dan **Letakkan di**: sudut kiri/kanan atas/bawah, kanan setinggi layar, atau bawah selebar layar (mengikuti area kerja, tidak menutupi taskbar)
  - Isi: jam (dengan/tanpa detik), ibadah, agenda, tugas, KPI, OKR, catatan disematkan, beserta urutannya dan jumlah agenda
  - Letak lapisan: **Di desktop** (di bawah semua jendela), **Biasa**, atau **Selalu di atas**
  - **Kunci posisi** supaya tidak tergeser, atau **Klik tembus** supaya klik diteruskan ke desktop
- **Agenda hari ini** menggabungkan blok, pengingat, tugas berjam, dan acara kalender luar; kartu *Sekarang* menampilkan sisa waktu, acara berikutnya diberi hitung mundur, hari libur tampil sebagai label.
- **Mode mini**: kartu kecil berisi jam, acara berikutnya, sholat berikutnya, dan timer. Ukuran sebelumnya dipulihkan saat kembali ke tampilan penuh.
- **Lipat bagian**: klik judul bagian untuk menciutkan atau membukanya.
- Posisi, ukuran, dan pengaturan disimpan per komputer dan dipulihkan saat Ruangku dibuka lagi. Jika monitor tempat widget berada dicabut, widget otomatis pindah ke kanan atas monitor utama.
- Jika widget hilang atau tidak bisa diklik: klik kanan ikon tray → **Buka kunci widget** atau **Kembalikan posisi widget**.

### Kalender dan detail hari

Di widget, buka tab **Kalender** untuk melihat bulan berjalan. Titik di bawah tanggal menandai blok waktu (nila), reminder (kunyit), catatan harian (abu), dan KPI yang terisi (hijau). Klik tanggal untuk membuka **detail hari**:

- **Aktivitas per jam**: klik area kosong untuk membuat blok 1 jam, atau seret untuk menentukan rentangnya. Seret blok untuk menggeser, tarik tepi atas/bawah untuk mengubah durasi (dibulatkan ke 15 menit). Klik blok untuk membuka editor: nama, jam mulai/selesai (format 24 jam), warna, tandai selesai, catatan singkat, hapus. Pintasan untuk blok terpilih: ↑/↓ geser 15 menit, Shift+↑/↓ ubah durasi, Delete hapus, Enter ganti nama.
- **Reminder** hari itu tampil sebagai penanda di grid jam (termasuk reminder berulang); klik untuk menandai selesai.
- **KPI**: isi atau ubah angka untuk tanggal tersebut (tanggal mendatang tidak bisa diisi).
- **OKR**: check-in key result yang terjadi hari itu, plus progres objective kuartalnya.
- **Catatan harian**: tulis catatan untuk tanggal itu (Ctrl+Enter untuk menyimpan), klik untuk mengedit, kosongkan isinya untuk menghapus. Catatan ini juga muncul di halaman Catatan dengan tag `#harian`.

Klik tanggal di bawah jam pada tab **Hari ini** untuk langsung membuka jadwal per jam hari ini. Blok waktu ikut tersinkron ke komputer lain.

Catatan: tombol Win+D ("tampilkan desktop") bisa ikut menyembunyikan widget di lapisan *Di desktop*. Klik ikon tray atau pilih *Tampilkan / sembunyikan widget* dua kali untuk memunculkannya lagi, atau pakai lapisan *Biasa*.

Pratinjau di browser: `npm run dev`, lalu buka http://localhost:1420/#widget.

## Kolaborasi tim (server PocketBase)

Folder `server/` berisi skema dan hook untuk [PocketBase](https://pocketbase.io) v0.23 ke atas:

```
server/pb_migrations/1761400000_ruangku_tim.js   koleksi workspaces, members, records, inbox + API rules per peran
server/pb_hooks/ruangku.pb.js                    hitung ulang daftar peran, tautkan undangan per email, webhook & kirim WhatsApp
```

1. Unduh PocketBase, ekstrak, salin kedua folder di atas ke sebelah berkas `pocketbase`.
2. Jalankan `pocketbase serve --http=0.0.0.0:8090` dan buat superuser lewat tautan yang tercetak.
3. Di Ruangku: **Tim & bot → Server tim** → daftar/masuk → buat ruang kerja → tambah anggota (email + peran).
4. Bagikan proyek dari formulir proyek → **Dibagikan ke tim**. Hanya data proyek itu (dan subproyeknya) yang dikirim; ibadah, pengaturan, dan proyek pribadi tidak.

Peran ditegakkan di server lewat API rules: pembaca hanya bisa membaca; kontributor bisa menambah, mengubah buatannya atau tugas yang ditugaskan kepadanya, dan menghapus buatannya; editor ke atas penuh; admin mengelola anggota kecuali pemilik. Perubahan yang ditolak server dikembalikan ke versi tim di aplikasi. Di aplikasi, proyek tempat Anda pembaca juga tampil hanya-baca dan setiap upaya mengubahnya ditolak sebelum dikirim.

- **Realtime**: selama aplikasi terbuka, backend Rust berlangganan SSE PocketBase (`/api/realtime`, topik `records`, `members`, `workspaces`). Perubahan anggota lain memicu sinkron dalam ±1,5 detik; bila koneksi putus, polling 30 detik tetap berjalan dan langganan disambung ulang dengan jeda bertahap.
- **Penggabungan per kolom**: setiap record menyimpan waktu ubah per kolom (`_ft`). Saat dua versi bertemu (sinkron tim maupun folder cloud), kolom yang berbeda digabung dan hanya kolom yang sama memakai perubahan terakhir.
- **Komentar & kotak masuk**: komentar ikut proyek tugas/catatannya; `@sebutan` dan penugasan muncul di kotak masuk penerima dan dikirim lewat kanal bot mereka.

Variabel lingkungan opsional untuk WhatsApp: `RUANGKU_WA_VERIFY_TOKEN`, `RUANGKU_WA_APP_SECRET`, `RUANGKU_WA_TOKEN`, `RUANGKU_WA_PHONE_ID`, `RUANGKU_WA_GRAPH` (default `v23.0`). Webhook: `https://server-anda/api/ruangku/wa/webhook`.

## Bot & asisten AI

- **Bot host**: aktifkan "Perangkat ini menjalankan bot" di satu komputer. Bot mengirim antrean penugasan (`outbox`) dan memproses pesan masuk dari Telegram (long polling), Gmail (IMAP, subjek `[Ruangku #KODE]`), dan WhatsApp (inbox di server tim).
- **Perintah**: `tugas`, `hari ini` (juga `ringkasan`, `agenda`), `tambah …`, `selesai KODE`, `tunda KODE besok`, `catat …`, `rapat`, `kuliah`, `kas`, `keluar 25rb makan`, `masuk 1,5jt honor`, `bantuan`. Pengirim dikenali dari nomor WA, akun Telegram tertaut, atau email anggota; setiap perintah dicek terhadap perannya.
- **Asisten AI**: Claude Messages API (`anthropic-version: 2026-10-21`, model bawaan `claude-sonnet-5-5`), OpenAI Responses API (GPT-6.1 Sol/Terra, GPT-6 Astra), atau endpoint `chat/completions` kompatibel OpenAI (mis. Ollama). Permintaan dikirim dari backend Rust; API key disimpan di Windows Credential Manager dan tidak tersinkron. Alat yang tersedia: ringkasan hari, daftar proyek/tugas, cari, jadwal, statistik, anggota, buat/ubah/hapus tugas, buat proyek, buat/ubah/hapus blok, rapat (daftar/buat/ubah), jadwal kuliah & presensi, keuangan (catat, saldo & anggaran, daftar transaksi), catatan, reminder, isi KPI, check-in KR. Rentang waktu sholat hari itu disertakan di instruksi sistem agar rencana hari tidak menabraknya.
- **Rangkuman pagi**: jam kirim (bawaan 06:30) dan penerima diatur di Tim & bot. Isinya tanggal Masehi/Hijriah, waktu sholat, libur, agenda (blok, pengingat, tugas berjam, kalender luar), tugas hari ini dan terlambat dengan kode, rapat dan kelas, tagihan rutin jatuh tempo (pemilik), serta tugas 3 hari ke depan. Anggota hanya menerima tugas dan rapatnya sendiri. Dikirim sekali sehari, termasuk bila komputer baru menyala setelah jam kirim (sebelum pukul 12.00).

## Keandalan & keamanan

- **Rahasia**: kunci API AI, token bot Telegram/WhatsApp, sandi aplikasi Gmail, token server tim, serta client secret & refresh token Google disimpan di Windows Credential Manager (target `Ruangku:<kunci>`). Pengaturan lama yang masih teks biasa dipindahkan otomatis; file pengaturan hanya menyimpan penanda `•tersimpan-aman•`.
- **Backup otomatis**: salinan database harian di `%APPDATA%\com.ruangku.app\backups` (`otomatis-*`, disimpan 14 terakhir secara bawaan), backup manual (`manual-*`), dan backup otomatis sebelum pemulihan (`sebelum-pulihkan-*`). Pemulihan menulis ulang waktu ubah semua kolom sehingga hasil pulihan tidak tertimpa sinkron berikutnya.
- **Pembaruan**: pemeriksaan harian ke GitHub Releases (lihat *Rilis dan pembaruan otomatis*).
- **Log & diagnostik**: `%APPDATA%\com.ruangku.app\logs\ruangku.log` (rotasi 512 KB) mencatat backup, sinkron, galat bot/Google, dan panic; halaman diagnostik menampilkan versi, ukuran & integritas database, jumlah data, dan status backup.

## Cara kerja sinkronisasi

Database SQLite **tidak** ditaruh langsung di folder cloud, karena file database bisa rusak saat diunggah setengah jalan oleh OneDrive/Google Drive. Sebagai gantinya:

1. Di **Pengaturan → Sinkronisasi cloud**, pilih folder yang sudah disinkronkan oleh layanan cloud Anda (misalnya `C:\Users\Anda\OneDrive`).
2. Ruangku membuat `Ruangku-Sync\device-<id>.json`, berisi snapshot data perangkat ini. Setiap perangkat hanya menulis file miliknya sendiri.
3. Setiap 3 menit, dan 15 detik setelah ada perubahan, Ruangku membaca snapshot perangkat lain dan menggabungkannya per kolom: untuk setiap kolom, versi yang diubah paling akhir yang dipakai. Penghapusan ikut tersinkron.
4. Di komputer kedua, pasang Ruangku dan pilih folder cloud yang sama.

Catatan:
- Yang disinkronkan adalah reminder, OKR, KPI, catatan, serta tag & favorit file. **Isi file di File Manager tidak disalin**; itu tetap urusan Explorer / OneDrive.
- Jika kolom yang sama pada item yang sama diubah di dua komputer sebelum sempat tersinkron, perubahan terakhir menang; kolom yang berbeda tetap tergabung. Pastikan jam kedua komputer benar.
- Jika snapshot sedang diunggah dan terbaca setengah, Ruangku melewatinya dan mencoba lagi pada putaran berikutnya.

## Struktur proyek

```
src/                     Frontend React + TypeScript
  App.tsx                Kerangka, navigasi, palet Ctrl+K, pemilih proyek, sinkron tim & realtime, bot host, tur
  pages/                 Hari ini, Proyek, Tugas, Kalender, Jadwal, Rapat, Kuliah, Keuangan, OKR, KPI, Evaluasi, Catatan, File, Ibadah, Tim & bot, Asisten AI, Panduan, Pengaturan
  sidebar/               Sidebar Ruang ala Notion (pohon proyek/halaman, seret-lepas, menu konteks, Sampah)
  meetings/, courses/    Gaya halaman Rapat & Kuliah
  finance/               Formulir & diagram keuangan (arus kas, kategori)
  notes/                 Editor blok: ekstensi (toggle, callout, warna, daftar isi, gambar), menu blok, slash
  calendar/              Tampilan kalender, popover, buat cepat, sumber ICS/libur, Google Calendar (OAuth + sinkron dua arah)
  collab/                Komentar dengan @sebutan, kotak masuk
  components/            Palet perintah, komponen UI bersama
  settings/              Tab Umum, Widget, Connector (MCP, AI, layanan), Plugin & ekstensi, Notifikasi, Data & keamanan
  projects/              Pemilih proyek, formulir proyek, timeline bertingkat
  schedule/              Jadwal harian 1/3/7 hari, vertikal/horizontal
  charts/                Diagram evaluasi per proyek (batang, garis, donat, heatmap, tabel)
  breaks/                Layar & pengaturan pengingat istirahat
  ai/                    Asisten AI: klien model (Claude, OpenAI Responses, kompatibel), alat (tools), putaran agen, server MCP, ekspor konteks
  team/                  Klien PocketBase, sinkron tim, bot WA/Telegram/Gmail, perintah bot
  guide/                 Panduan (panduan.md = PANDUAN.md), tur awal
  lib/calendar.ts        Acara kalender dari semua sumber, rentang tampilan, geser/ubah durasi
  lib/ics.ts             Parser & penulis iCalendar (RRULE, EXDATE, zona waktu)
  lib/holidays.ts        Libur nasional & cuti bersama (SKB 3 Menteri)
  lib/prayerGuard.ts     Rentang sholat dilindungi, deteksi bentrok, geser blok
  lib/ledger.ts          Buku kas, saldo, rekap & laporan donatur
  lib/finance.ts         Akun, transfer, anggaran, transaksi berulang, arus kas, proyeksi, catat cepat
  lib/meetings.ts        Rapat, seri berulang, sinkron blok, notulen & action item, pesan undangan
  lib/courses.ts         Mata kuliah, pertemuan semester, presensi, nilai & IPK
  lib/agendaSync.ts      Penyelaras rapat/kuliah/tagihan otomatis, hapus blok "pintar"
  lib/theme.ts           Tema terang/gelap/ikuti Windows
  lib/appearance.ts      Warna aksen, ukuran tampilan (zoom), kepadatan, lebar halaman, huruf, sudut
  lib/pageLayout.ts      Tata letak per halaman: bagian tampil/sembunyi, urutan, lebar, opsi
  components/Pane.tsx    Panel samping yang lebarnya bisa ditarik
  components/LayoutMenu.tsx  Tombol & menu "Tampilan" di kepala halaman
  lib/modules.ts         Modul yang bisa dinyalakan/dimatikan
  lib/customFields.ts    Kolom kustom proyek, format/parse, urut, CSV
  lib/bibtex.ts          Parser BibTeX, sitasi APA 7
  lib/comments.ts        @sebutan dan kotak masuk
  lib/access.ts          Hak akses UI (pembaca hanya-baca), penjaga tulis
  lib/secrets.ts         Simpan/baca rahasia lewat Credential Manager + migrasi
  lib/update.ts          Pemeriksaan rilis GitHub, perbandingan versi
  lib/fuzzy.ts           Pencocokan teks palet perintah
  lib/deeplink.ts        Buka item antarhalaman dan dari widget
  team/digest.ts         Rangkuman pagi
  lib/projects.ts        Hierarki proyek, ruang lingkup, rentang proyek
  lib/scope.tsx          Konteks pemilih proyek global
  lib/roadmap.ts         Skala timeline tahun → hari
  lib/projectStats.ts    Statistik & warna diagram per proyek
  lib/team.ts            Peran & hak akses CRUD, nomor WA, pencocokan pengirim
  lib/taskOps.ts         Operasi data tanpa React (dipakai AI & bot)
  lib/demo.ts            Database demo
  widget/                Widget desktop, kalender, detail hari, grid jam, panel pengaturan
  lib/timeblocks.ts      Logika blok waktu, tata letak tumpang tindih, kalender
  lib/prayer.ts          Port TypeScript jadwal sholat (diuji identik dengan Rust)
  lib/ibadah.ts          Amalan, target, skor, konsistensi
  lib/review.ts          Ringkasan evaluasi harian/mingguan/bulanan
  lib/tasks.ts           Model tugas & proyek, dependensi, pengulangan, beban kerja
  lib/automation.ts      Mesin otomasi jika-maka (murni, teruji)
  lib/quickParse.ts      Penguraian teks tambah-cepat berbahasa Indonesia
  lib/timer.ts           Timer tugas -> blok waktu tercatat
  lib/projectTemplates.ts Template proyek & hari
  lib/notesTree.ts       Halaman bersarang, backlink, template catatan
  tasks/                 Tampilan List/Kanban/Kalender/Timeline, detail, timer, otomasi, template
  notes/BlockEditor.tsx  Editor blok dengan perintah / dan [[
  lib/api.ts             Pemanggil perintah Rust (dan mode pratinjau browser)
  lib/mock.ts            Backend tiruan untuk pratinjau browser
  lib/metrics.ts         Perhitungan progres OKR dan capaian KPI
  lib/repeat.ts          Jadwal berulang
  styles.css             Seluruh tampilan (tema terang & gelap: ikuti Windows atau pilihan manual)
src-tauri/src/           Backend Rust
  lib.rs                 Perintah, system tray, tutup-ke-tray, tugas latar
  db.rs                  SQLite: tabel records generik + settings, penggabungan per kolom, backup & pulihkan
  system.rs              Credential Manager, backup otomatis, log berotasi, OAuth loopback, diagnostik
  realtime.rs            Langganan SSE PocketBase untuk sinkron tim realtime
  sync.rs                Sinkronisasi via folder cloud
  reminders.rs           Penjadwal reminder (cek tiap 15 detik)
  widget.rs              Jendela widget: transparan, lapisan, klik tembus, efek, posisi
  prayer.rs              Jadwal sholat (Kemenag) dan kalender Hijriah
  notify.rs              Notifikasi blok aktivitas, ibadah, puasa, evaluasi; jam tenang
  capture.rs             Jendela catat cepat + pintasan global
  sticky.rs              Sticky note di desktop (jendela per catatan)
  breaks.rs              Pengingat istirahat, deteksi idle Windows, layar istirahat
  net.rs                 HTTP untuk AI/bot/server tim, SMTP & IMAP untuk Gmail
  files.rs               Operasi file manager
  mcp.rs                 Server MCP lokal (HTTP) dan jembatan stdio `--mcp`
server/                  Skema & hook PocketBase untuk kolaborasi tim
.github/workflows/       Build installer Windows otomatis
```

Semua data aplikasi disimpan di satu tabel `records (id, kind, data JSON, updated_at, deleted)`. Jenis data: `reminder`, `objective`, `keyresult`, `kpi`, `kpientry` (id = `<kpiId>:<YYYY-MM-DD>`), `note` (catatan harian punya field `date`), `timeblock` (`date`, `start`/`end` dalam menit, `notify`), `ibadahconfig`, `ibadahlog` (id = `ibadah:<tanggal>`), `review` (id = `day:`/`week:`/`month:` + kunci periode), `notifconfig`, `project`, `task`, `automation`, `timer`, `workconfig`, `projecttemplate`, `daytemplate`, `filemeta`, `member`, `workspace`, `outbox` (antrean penugasan bot), `breaklog`, `calsub` (kalender luar), `comment`, `ledger`, `reference` (pustaka), `meeting`, `meetingseries`, `course`, `account`, `budget`, `recurring`, `trash`. Setiap `data` menyimpan `_ft` (waktu ubah per kolom) untuk penggabungan per kolom. Proyek punya `parentId`, `start`/`end`, `milestones`, `folder`, `workspaceId`; tugas, blok, reminder, OKR, KPI, catatan, dan tag file punya `projectId`; tugas punya `assignees` dan `custom` (nilai kolom kustom); proyek punya `fields`. Catatan punya `parentId`, `icon`, `isTemplate`, `sticky`; blok waktu punya `taskId` dan `tracked`. Data demo bertanda `demo: true`. Menambah modul baru cukup dengan `kind` baru tanpa mengubah skema.

## Pintasan

| Tombol | Aksi |
| --- | --- |
| Ctrl+K | Cari & perintah cepat |
| Ctrl+= / Ctrl+− | Perbesar / perkecil tampilan |
| Ctrl+1 … Ctrl+9 | Hari ini, Proyek, Tugas, Kalender, OKR, KPI, Evaluasi, Catatan, File |
| Ctrl+0 | Jadwal harian |
| D / W / M / A / Y, T, ←/→, N | Ganti tampilan, hari ini, mundur/maju, buat acara (Kalender) |
| Ctrl+P | Pilih proyek |
| Ctrl+\ | Sembunyikan/tampilkan sidebar |
| F2, Ctrl+D (sidebar) | Ganti nama, duplikat proyek/halaman |
| / , ⋮⋮ (Catatan) | Perintah blok, menu blok |
| Ctrl+J | Asisten AI |
| F1 | Panduan |
| [ / ] | Hari sebelumnya / berikutnya (Jadwal harian) |
| Ctrl+Shift+Space | Catat cepat (global, dari aplikasi mana pun) |
| Ctrl+N | Reminder / catatan baru (di halaman tersebut) |
| Ctrl+Shift+N | Folder baru (File) |
| F2, Delete, F5 | Ganti nama, hapus ke Recycle Bin, muat ulang (File) |
| Ctrl+C / X / V / A | Salin, potong, tempel, pilih semua (File) |

## Ide pengembangan berikutnya

- Notifikasi dengan tombol aksi (Selesai / Tunda) langsung dari toast Windows
- Pembaruan otomatis di dalam aplikasi (Tauri updater dengan tanda tangan) selain pemberitahuan
- Sinkron Google Calendar untuk tugas (Google Tasks) dan Outlook (Microsoft Graph)
- Batasan proyek per anggota di dalam satu ruang kerja
- Ekspor laporan OKR & KPI mingguan ke PDF/Excel
- Pratinjau isi file (gambar, PDF, teks) di panel detail File
- Enkripsi snapshot sinkronisasi dengan kata sandi
