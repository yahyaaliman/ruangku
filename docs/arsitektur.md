# Arsitektur Ruangku

Ruangku adalah aplikasi [Tauri 2](https://v2.tauri.app): antarmuka React + TypeScript yang berjalan di WebView2, dan backend Rust yang menyimpan data di SQLite, menjalankan tugas latar (reminder, notifikasi, sinkronisasi, backup), serta mengelola jendela tambahan (widget, sticky note, catat cepat, layar istirahat).

## Struktur folder

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
  guide/                 Panduan (panduan.md, salinannya docs/panduan.md), tur awal
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
  components/Stall.tsx   Banner "Ruangku tidak merespons" dan indikator memuat halaman
  lib/watchdog.ts        Pengawas respons perintah backend
  lib/selftest.ts        Uji mandiri untuk uji asap Windows (aktif hanya dengan RUANGKU_SELFTEST)
  components/ErrorBoundary.tsx  Penahan galat per halaman dan per jendela (pesan + Coba lagi, dicatat ke log)
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
  nsis/ (di src-tauri/)  Bahasa Indonesia, gambar, dan kait installer NSIS (copot salinan .msi lama)
server/                  Skema & hook PocketBase untuk kolaborasi tim
scripts/                 smoke-windows.mjs (uji asap di Windows), updater-manifest.mjs (latest.json)
docs/                    Dokumentasi, panduan, gambar README
.github/workflows/       Build installer Windows + uji asap, validasi perubahan
```

Semua data aplikasi disimpan di satu tabel `records (id, kind, data JSON, updated_at, deleted)`. Jenis data: `reminder`, `objective`, `keyresult`, `kpi`, `kpientry` (id = `<kpiId>:<YYYY-MM-DD>`), `note` (catatan harian punya field `date`), `timeblock` (`date`, `start`/`end` dalam menit, `notify`), `ibadahconfig`, `ibadahlog` (id = `ibadah:<tanggal>`), `review` (id = `day:`/`week:`/`month:` + kunci periode), `notifconfig`, `project`, `task`, `automation`, `timer`, `workconfig`, `projecttemplate`, `daytemplate`, `filemeta`, `member`, `workspace`, `outbox` (antrean penugasan bot), `breaklog`, `calsub` (kalender luar), `comment`, `ledger`, `reference` (pustaka), `meeting`, `meetingseries`, `course`, `account`, `budget`, `recurring`, `trash`. Setiap `data` menyimpan `_ft` (waktu ubah per kolom) untuk penggabungan per kolom. Proyek punya `parentId`, `start`/`end`, `milestones`, `folder`, `workspaceId`; tugas, blok, reminder, OKR, KPI, catatan, dan tag file punya `projectId`; tugas punya `assignees` dan `custom` (nilai kolom kustom); proyek punya `fields`. Catatan punya `parentId`, `icon`, `isTemplate`, `sticky`; blok waktu punya `taskId` dan `tracked`. Data demo bertanda `demo: true`. Menambah modul baru cukup dengan `kind` baru tanpa mengubah skema.

## Keandalan di Windows

- **Jendela dibuat di luar utas utama.** Di Windows, membuat jendela WebView2 dari perintah sinkron atau dari handler tray/pintasan global (yang berjalan di utas utama) membuat aplikasi macet: jendela baru tidak pernah selesai dibuat dan semua perintah berikutnya tertahan, sehingga halaman tampak kosong. Karena itu perintah yang bisa membuat jendela (`widget_set_visible`, `sticky_open`, `capture_open`, `break_action`, `open_main`) bersifat `async`, aksi tray/pintasan memakai `off_main`, dan setiap pembuat jendela memanggil `note_window_thread`, yang menulis baris `BUG:` ke log bila aturan ini dilanggar.
- **Perintah lambat tidak memblokir tampilan.** Perintah yang menyentuh disk, jaringan, registry, atau Credential Manager memakai `#[tauri::command(async)]`. Perintah baca/tulis database tetap sinkron agar urutan penyimpanan terjaga.
- **Galat tampilan tidak mengosongkan aplikasi.** Setiap halaman dan setiap jendela dibungkus `ErrorBoundary`; galat dicatat ke log dan pengguna mendapat tombol **Coba lagi**. Data yang datang tanpa kolom larik wajib (mis. catatan tanpa `tags`) dilengkapi oleh `itemOf` saat dimuat.
- **Pengawas respons.** `src/lib/watchdog.ts` memantau perintah yang biasanya instan. Bila salah satunya tertahan lebih dari 8 detik, antarmuka menampilkan banner berisi cara memulihkan alih-alih halaman kosong.
- **Uji asap di Windows sungguhan.** Setiap build menjalankan `scripts/smoke-windows.mjs` di runner Windows. Skrip itu memasang, menjalankan, menutup paksa, memasang ulang, dan mencopot Ruangku; pemeriksaan di dalam aplikasi dijalankan oleh uji mandiri `src/lib/selftest.ts`, yang hanya aktif bila variabel lingkungan `RUANGKU_SELFTEST` berisi path berkas laporan. Cakupannya: memasang `.msi` lama lalu installer baru (yang harus mencopotnya), membuka semua halaman serta widget, sticky note, catat cepat, dan layar istirahat sambil memastikan aplikasi tetap menjawab, menutup paksa lalu membuka lagi, membuka salinan kedua, memasang ulang saat aplikasi berjalan, dan mencopot. Build gagal (installer tidak diunggah atau dirilis) bila ada langkah yang macet, galat JavaScript, atau baris `BUG:`/`PANIC` di log.
