# Panduan Ruangku

Ruangku adalah ruang kerja pribadi di Windows untuk proyek, tugas, kalender, jadwal harian, rapat, kuliah, keuangan, OKR, KPI, evaluasi, catatan, file, dan ibadah. Dilengkapi sidebar Ruang ala Notion, widget desktop, asisten AI (Claude, ChatGPT, atau Ollama), server MCP untuk Claude Desktop/Claude Code/ChatGPT, kolaborasi tim, serta bot WhatsApp/Telegram/Gmail.

## Mulai cepat

Saat pertama kali dibuka, Ruangku sudah berisi **data demo**: enam proyek (Internal, Jitu, Kuliah, Penitipan Infaq, Recruitment, Riset Thesis) beserta subproyek, tugas, jadwal, rapat, mata kuliah, akun & anggaran keuangan, OKR, KPI, catatan, evaluasi, ibadah, dan anggota tim contoh. Pakai data ini untuk mencoba semua fitur.

1. Tekan **Ctrl+K** lalu ketik apa saja, misalnya "bab 3" atau "kalender". Dari sini Anda bisa membuka tugas, catatan, proyek, dan halaman, atau membuat tugas baru.
2. Lihat bagian **Ruang** di sidebar: proyek, subproyek, dan halaman catatannya tersusun ke bawah seperti Notion. Klik "Riset Thesis" untuk memfokuskan semua halaman ke proyek itu (atau tekan **Ctrl+P**). Klik **Semua proyek** untuk kembali.
3. Buka [Kalender](page:calendar) (Ctrl+4) untuk melihat jadwal, tugas, milestone, waktu sholat, dan hari libur dalam satu tempat.
4. Tekan **Ctrl+Shift+Space** dari aplikasi mana pun untuk mencatat tugas cepat, misalnya `Kirim proposal besok jam 10 @Jitu !tinggi`.
5. Tampilkan widget desktop dari [Pengaturan](page:settings) → **Widget**. Di tab **Connector** Anda bisa menghubungkan Claude atau ChatGPT ke data Ruangku.
6. Bila sudah siap memakai data sendiri, klik **Hapus data demo** di banner kuning atau di Pengaturan → Data demo. Data buatan Anda sendiri tidak ikut terhapus.

## Pencarian & perintah cepat (Ctrl+K)

Palet perintah terbuka dengan **Ctrl+K** dari halaman mana pun.

- **Cari** tugas, catatan, proyek, OKR, KPI, blok jadwal, dan halaman. Huruf besar/kecil diabaikan, urutan kata bebas, dan inisial juga cocok ("rt" menemukan "Riset Thesis", "bab thesis" menemukan "Thesis bab 2").
- **Buat langsung**: ketik kalimat tugas lengkap (`slide seminar jumat jam 9 @Thesis !tinggi`) lalu pilih **Tugas baru**. Pilih **Catatan baru** untuk membuat halaman catatan dengan judul itu.
- **Lompat ke tanggal**: ketik `besok`, `jumat`, `5 nov`, atau `2026-11-05` lalu pilih **Buka kalender**.
- **Aksi**: awali dengan `>` untuk menampilkan perintah, misalnya `> widget`, `> backup`, `> istirahat`, `> sinkron`, `> proyek baru`, atau `> panduan`.
- Tanpa kata kunci, palet menampilkan item yang terakhir dibuka dan tugas yang jatuh tempo hari ini atau terlewat.
- Panah atas/bawah untuk memilih, **Enter** untuk membuka. Pada proyek, **Ctrl+Enter** membuka timeline-nya.

## Sidebar Ruang (ala Notion)

Sidebar kiri berisi menu utama, **Favorit**, bagian **Ruang**, dan **Modul**. Lebarnya bisa ditarik dari tepi kanan; `Ctrl+\` menyembunyikan atau menampilkannya.

- **Ruang** menampilkan proyek → subproyek → halaman catatan sebagai daftar bersarang. Klik panah untuk membuka/menutup, klik nama proyek untuk memfokuskan Ruangku ke proyek itu, klik halaman untuk membukanya. **Halaman pribadi** berisi catatan tanpa proyek.
- **Tambah**: arahkan kursor ke baris lalu klik **+** untuk membuat halaman di dalamnya; tombol **+** di judul Ruang membuat proyek baru.
- **Seret & lepas**: pindahkan halaman ke proyek atau halaman lain, ubah urutan proyek, atau jadikan proyek sebagai subproyek proyek lain. Garis biru menunjukkan posisi jatuhnya.
- **Menu konteks** (klik kanan atau ikon ⋯): fokus, buka timeline/tugas, tambah halaman atau subproyek, favoritkan, ganti nama (**F2**), ikon emoji, warna, pindahkan ke…, duplikat (**Ctrl+D**), salin tautan, ubah detail, arsipkan, dan hapus.
- **Sampah**: halaman yang dihapus masuk Sampah (pojok kiri bawah) selama 30 hari dan bisa dipulihkan beserta subhalamannya.
- **Modul** (Rapat, Kuliah, Catatan, Keuangan, …) bisa disembunyikan atau diurutkan lewat **Atur menu** atau Pengaturan → Umum → Sidebar & menu, dan dimatikan sepenuhnya di Pengaturan → Plugin & ekstensi.

## Mengatur tampilan

Hampir semua tampilan Ruangku bisa disesuaikan, dan setiap pilihan tersimpan di perangkat ini.

**Tampilan umum** (Pengaturan → Umum → Tampilan, atau ikon **Aa** di kaki sidebar untuk versi cepat):

- **Tema**: ikuti Windows, terang, atau gelap.
- **Warna aksen**: nila, laut, daun, ungu, jambu, bata, kunyit, atau grafit. Tombol, tautan, dan sorotan ikut berubah, di tema terang maupun gelap.
- **Ukuran tampilan** 80–150%. Pintasan: **Ctrl+=** memperbesar, **Ctrl+−** memperkecil, atau lewat Ctrl+K → "Ukuran tampilan 100%". Ukuran ini tersimpan per komputer dan tidak ikut sinkron akun Google.
- **Kepadatan**: Ringkas (lebih banyak baris di layar), Nyaman, atau Lega.
- **Lebar halaman**: Normal, Lebar, atau Penuh untuk layar lebar.
- **Huruf** (Plus Jakarta Sans, huruf sistem Windows, atau serif), **sudut** (tegas, sedang, membulat), dan **kurangi animasi**.

**Tata letak per halaman**: klik tombol **Tampilan** di kepala halaman. Bagian bisa disembunyikan atau ditampilkan dengan kotak centang, diurutkan dengan panah naik/turun, dan kartu tertentu bisa dibuat setengah atau lebar penuh. Tombol **Bawaan** mengembalikan susunan awal.

- **Hari ini**: judul, ringkasan, garis waktu, jumlah kolom panel (1–3), panel yang tampil, serta urutan & lebar panel.
- **Tugas**: panel proyek di kiri, kolom tambah cepat, baris saringan, dan properti yang tampil di setiap tugas (status, prioritas, proyek, tenggat, orang, subtugas, checklist, estimasi, berulang, key result, tag).
- **Kalender**: panel kiri, sembunyikan tugas selesai, dan lapisan yang tampil.
- **Proyek**: isi kartu di tampilan Daftar (deskripsi, progres, statistik, folder).
- **Rapat**: bagian detail rapat (info, agenda, notulen, keputusan, action item) dan urutannya.
- **Kuliah**: kartu ringkasan, kelas hari ini, tab yang tampil, tinggi jam jadwal mingguan, hari Minggu, dan bilah kehadiran.
- **Keuangan**: kartu ringkasan, peringatan, arus kas, akun, kategori, anggaran, jadwal 14 hari (urutan & lebar), 2 atau 3 kolom, catat cepat, dan tab yang tampil.
- **OKR**: 1 atau 2 kolom objective, bilah kuartal, deskripsi, dan grafik kecil key result.
- **KPI**: kolom target, grafik tren (rentang 7/14/30 hari), dan tercapai 30 hari.
- **Ibadah**: setiap kelompok (skor & jadwal, wajib, rawatib, sunnah, dzikir, Al-Qur'an, puasa, amal, Ramadan, muhasabah, konsistensi) bisa disembunyikan dan diurutkan.
- **Evaluasi**: angka ringkas, grafik proyek, setiap kartu, dan refleksi di samping atau di bawah (kartu bisa dua kolom).

**Panel yang bisa ditarik**: garis tepi panel samping bisa diseret untuk mengubah lebar, di Tugas (daftar proyek dan detail tugas), Catatan, Kalender, File (pohon folder dan detail), Rapat, Kuliah (laci mata kuliah), Jadwal harian (baki tugas), dan timeline Proyek (kolom nama). Klik dua kali garisnya untuk kembali ke lebar bawaan, atau fokuskan dengan Tab lalu pakai panah kiri/kanan.

## Proyek & subproyek

Proyek adalah tulang punggung Ruangku. Tugas, blok jadwal, reminder, OKR, KPI, catatan, file, dan transaksi buku kas bisa dihubungkan ke proyek atau subproyek.

- **Membuat proyek**: pemilih proyek → **Proyek baru**, atau halaman Proyek → **Proyek baru**.
- **Subproyek**: saat membuat proyek, isi "Di bawah proyek". Di halaman Proyek → Daftar, tombol **+** pada kartu juga membuat subproyek. Subproyek mewarisi warna, alur status, dan kolom kustom induknya.
- **Periode & milestone**: isi tanggal mulai/selesai dan milestone (mis. Seminar proposal). Jika tanggal dikosongkan, rentang proyek dihitung dari tugas-tugasnya (batang putus-putus di timeline).
- **Kolom kustom**: di formulir proyek → **Kolom kustom**, tambahkan kolom sendiri untuk tugas proyek itu. Jenisnya Teks, Angka, Rupiah, Pilihan, Tanggal, Centang, atau Tautan. Contoh di proyek Recruitment: Sumber kandidat, Ekspektasi gaji, Skor tes, Tautan CV.
- **Folder proyek**: hubungkan folder di komputer; muncul sebagai pintasan di halaman [File](page:files).
- **Fokus**: tombol **Fokus** pada kartu proyek mengatur pemilih proyek ke proyek itu.
- **Arsip & hapus**: proyek yang diarsipkan disembunyikan. Menghapus proyek memindahkan tugasnya ke proyek induk (atau Inbox) dan menaikkan subproyeknya satu tingkat.

### Timeline bertingkat

Halaman Proyek → **Timeline** menampilkan proyek, subproyek, milestone (wajik), periode OKR (batang bergaris), dan tugas.

- **Tahun → Triwulan → Bulan → Minggu**: seret batang untuk menggeser, tarik ujungnya untuk mengubah tanggal. Klik batang proyek untuk membuka detailnya; klik batang tugas untuk membuka tugas.
- **Hari**: menampilkan blok jadwal per jam dan tugas yang jatuh tempo pada hari itu untuk setiap proyek.
- Angka di sebelah nama proyek adalah persentase tugas selesai; tanda **!** menunjukkan jumlah tugas terlambat.

## Tugas

Halaman [Tugas](page:tasks) punya tampilan **List**, **Kanban**, **Tabel**, **Kalender**, **Timeline**, dan **Rencana hari**.

- **Tambah cepat** membaca kata kunci: `besok`, `lusa`, `jumat`, `5 nov`, `10/3`, `jam 14`, `jam 5 sore`, `#tag`, `!tinggi` atau `!1`–`!4`, `@NamaProyek`, `~30m`/`~2j`, `setiap hari`, `hari kerja`, `setiap minggu`, `setiap bulan`.
- **Detail tugas**: status, proyek, **ditugaskan ke** (anggota tim), prioritas, mulai, tenggat & jam, estimasi, pengulangan, tag, tautan ke key result, kolom kustom proyek, checklist, subtugas, dependensi, waktu tercatat, dan **komentar**.
- **Tabel**: seperti spreadsheet. Klik judul kolom untuk mengurutkan (termasuk kolom kustom). Status, tenggat, dan kolom kustom bisa diubah langsung di sel; klik judul tugas untuk membuka detailnya. Baris paling bawah menjumlahkan kolom angka dan rupiah, dan **Ekspor CSV** menyimpan tabel untuk Excel. Kolom kustom tampil untuk proyek yang dipilih di pemilih proyek.
- **Penugasan**: saat anggota ditugaskan, Ruangku mengirim pesan lewat kanal mereka (WhatsApp, Telegram, atau email) bila bot aktif.
- **Hanya tugas saya**: filter tugas yang ditugaskan kepada Anda.
- **Timer**: tombol ▶ pada tugas mencatat waktu sebagai blok "tercatat" di jadwal.
- **Otomasi & template**: di panel kiri Tugas → Alat. Contoh: saat status menjadi "Review", beri tag dan notifikasi.

## Kalender

Halaman [Kalender](page:calendar) (Ctrl+4) menyatukan semua yang punya tanggal dan jam.

### Tampilan

- **Hari**, **Minggu**, **Bulan**, **Agenda** (daftar 30 hari ke depan), dan **Tahun** (12 bulan; makin pekat warnanya, makin banyak acaranya; klik tanggal untuk membuka hari itu).
- Minggu dimulai hari Senin. Tanggal Hijriah tampil di judul dan di sel bulan. **Hari libur nasional dan cuti bersama** ditandai merah.
- Pintasan (saat tidak sedang mengetik): **D** hari, **W** minggu, **M** bulan, **A** agenda, **Y** tahun, **T** hari ini, **←/→** (atau J/K) mundur/maju, **N** buat acara baru.

### Lapisan

Panel kiri berisi kalender mini dan pilihan lapisan yang ditampilkan:

- **Blok jadwal** dan **Waktu tercatat** dari Jadwal harian.
- **Tugas** pada tanggal tenggatnya (pada jamnya bila tugas punya jam tenggat).
- **Pengingat**, **Milestone**, dan **Periode proyek**.
- **Waktu sholat** (perlu lokasi di halaman Ibadah).
- **Kalender luar**: hari libur Indonesia, langganan ICS, dan Google Calendar.
- **Lindungi waktu sholat** mengarsir rentang sholat di tampilan Hari/Minggu (lihat **Jadwal sadar ibadah** di bagian Ibadah). **Sembunyikan tugas selesai** merapikan tampilan.

Lingkup proyek di pemilih proyek juga berlaku di Kalender.

### Membuat dan mengubah

- **Buat**: klik atau seret area kosong di tampilan Hari/Minggu, klik ruang kosong pada sel tanggal di tampilan Bulan (klik angkanya untuk membuka hari itu), atau tekan tombol **Buat**. Pilih jenisnya: **Blok jadwal**, **Tugas**, atau **Pengingat**.
- **Geser**: seret acara ke jam atau tanggal lain (blok, tugas, pengingat, milestone). Di tampilan Bulan, seret ke tanggal lain untuk memindahkan harinya dengan jam tetap.
- **Ubah durasi**: tarik tepi bawah blok.
- **Klik acara** untuk ringkasan: ubah judul, tanggal, dan jam; tandai tugas selesai atau milestone tercapai; buka detail di halaman asalnya; atau hapus blok (bisa dibatalkan lewat tombol **Batalkan**).
- Acara dari kalender luar hanya bisa dilihat, tetapi tombol **Jadikan blok** menyalinnya menjadi blok jadwal Ruangku.

### Hari libur & kalender luar

Ikon roda gigi di samping **Kalender luar** membuka pengelolaan kalender.

- **Libur nasional Indonesia** sudah terpasang tanpa perlu internet: libur nasional dan cuti bersama 2026–2027 sesuai SKB 3 Menteri. Untuk tahun-tahun berikutnya, klik **Isi contoh: libur Indonesia dari Google** di formulir langganan, atau perbarui aplikasi.
- **Langganan ICS**: tempel alamat iCalendar (`https://…ics` atau `webcal://…`), misalnya kalender kampus atau alamat rahasia iCal dari Google Calendar/Outlook. Diperbarui berkala; warnanya bisa diubah dan bisa disembunyikan sementara.
- **Ekspor .ics**: simpan blok jadwal, tugas bertenggat, dan milestone dari lingkup proyek yang dipilih untuk diimpor ke Google Calendar, Outlook, atau ponsel.

### Google Calendar (dua arah)

1. Buka Google Cloud Console, buat proyek, lalu aktifkan **Google Calendar API**.
2. Di *APIs & Services → OAuth consent screen*, isi nama aplikasi dan tambahkan email Anda sebagai *Test user*.
3. Di *Credentials → Create credentials → OAuth client ID*, pilih **Desktop app**. Salin Client ID dan Client secret ke Kalender → kelola kalender → **Google Calendar**, lalu klik **Hubungkan**. Browser terbuka untuk login Google.
4. Pilih kalender Google yang ingin ditampilkan dan, bila mau, satu kalender tujuan untuk **mengirim blok jadwal Ruangku**.

Sinkronisasi berjalan tiap 10 menit dan sesaat setelah blok diubah. Blok yang Anda geser atau hapus di Google ikut berubah di Ruangku. Client secret dan token login disimpan di Windows Credential Manager.

## Jadwal harian

Halaman [Jadwal harian](page:schedule) (Ctrl+0) adalah grid jam untuk 1 hari, 3 hari, atau seminggu.

- **Vertikal / Horizontal**: jam ke bawah atau jam ke kanan. Horizontal cocok untuk layar lebar.
- **Ukuran**: geser slider 60–180% untuk memperbesar atau memperkecil grid.
- **Membuat blok**: klik atau seret area kosong. Seret blok untuk menggeser, tarik tepinya untuk mengubah durasi, klik untuk mengedit judul, jam, warna, proyek, notifikasi, dan catatan. Tombol panah menggeser 15 menit; Shift+panah mengubah durasi.
- **Baki tugas**: seret tugas ke jam yang diinginkan; durasi mengikuti estimasi.
- **Template hari**: isi jadwal sekaligus (Hari kerja fokus, Hari kuliah, Akhir pekan, atau buatan sendiri).
- Bila blok menimpa waktu sholat, muncul peringatan dengan tombol **Geser ke …** untuk memindahkannya ke setelah sholat.
- Saat proyek difokuskan, blok proyek lain dipudarkan, tidak disembunyikan, supaya Anda tetap tahu jam yang sudah terisi.
- Tab **Reminder** berisi pengingat dengan notifikasi Windows, pengulangan, dan tunda.

## Rapat

Halaman [Rapat](page:meetings) mengelola rapat dari jadwal sampai tindak lanjut. Setiap rapat otomatis menjadi blok jadwal, sehingga tampil di Kalender, Jadwal harian, widget, notifikasi, rangkuman pagi, dan Google Calendar.

- **Rapat baru**: judul, tanggal & jam, lokasi, tautan Zoom/Meet/Teams, peserta (anggota tim) dan tamu, proyek, agenda, serta pengulangan (harian, hari kerja, mingguan, dua mingguan, bulanan). Rapat berulang dibuat sampai 8 minggu ke depan dan melewati libur nasional bila dipilih.
- **Gabung**: tombol Gabung muncul di halaman Rapat, Kalender, dan widget menjelang rapat daring dimulai.
- **Undangan & ringkasan**: menu ⋯ → Salin/kirim undangan, Kirim ringkasan, atau Batalkan rapat. Pesan dikirim lewat WhatsApp/Telegram/email peserta bila bot aktif.
- **Notulen**: tombol **Buat notulen** membuat halaman catatan dari template (peserta, agenda, keputusan, action item). Action item dengan nama penanggung jawab dibaca otomatis dan bisa langsung **dijadikan tugas**.
- Menghapus blok rapat di Kalender/Jadwal berarti membatalkan rapatnya (bisa diurungkan).

## Kuliah

Halaman [Kuliah](page:courses) untuk mahasiswa: mata kuliah, jadwal semester, presensi, tugas, ujian, dan nilai.

- **Mata kuliah**: kode, nama, SKS, dosen, semester, periode kuliah, jadwal mingguan (bisa beberapa sesi: kuliah, praktikum, responsi), ruang, tautan LMS/kelas daring, dan proyek (subproyek Kuliah dibuat otomatis bila diinginkan).
- Ruangku membuat **semua pertemuan semester** sebagai blok jadwal (melewati libur nasional), lengkap dengan nomor pertemuan.
- **Presensi**: pilih Hadir/Izin/Sakit/Alpa/Batal pada setiap pertemuan. Persentase kehadiran dan peringatan minimal kehadiran tampil di kartu mata kuliah, dasbor, dan asisten.
- **Ujian** (UTS, UAS, kuis, presentasi) masuk kalender dan pengingat.
- **Nilai & IPK**: isi komponen nilai dan bobotnya; nilai huruf, IPS, dan IPK dihitung dengan skala ITB (A, AB, B, BC, C, D, E) atau skala umum.
- **Catatan pertemuan**: satu klik membuat halaman catatan untuk topik pertemuan hari itu.

## OKR & KPI

- **OKR** per kuartal: objective dan key result terukur. Objective bisa dihubungkan ke proyek sehingga tampil di timeline dan evaluasi proyek. Check-in mencatat riwayat nilai.
- **KPI harian**: angka yang diisi setiap hari (mis. Jam menulis thesis). Hubungkan ke proyek dan objective. Tabel menampilkan tren 14 hari dan persentase tercapai 30 hari.
- Tugas yang ditautkan ke key result menaikkan nilainya otomatis saat selesai.

## Keuangan

Halaman [Keuangan](page:ledger) adalah buku kas untuk keuangan **pribadi** dan **proyek** sekaligus. Pilih **Pribadi saja**, **Proyek saja**, atau keduanya di atas tab; memfokuskan satu proyek di sidebar hanya menampilkan keuangan proyek itu.

- **Catat cepat**: ketik di kolom catat cepat, misalnya `25rb makan siang`, `bensin 50.000`, atau `1,2jt sewa kos`, lalu Enter. Jumlah, keterangan, dan kategori dibaca otomatis; tombol **Ubah** di notifikasi untuk merapikan. Bisa juga dari **Ctrl+Shift+Space** (`keluar 25rb makan`) atau bot (`keluar 25rb makan`, `masuk 1,5jt honor`).
- **Akun & dompet**: rekening bank, e-wallet, dompet tunai, kartu kredit, atau investasi dengan saldo awal. Saldo tiap akun dihitung dari transaksinya. **Transfer** memindahkan dana antarakun tanpa dihitung sebagai pemasukan/pengeluaran. Akun bisa milik proyek (mis. Kas proyek Jitu).
- **Kategori** terkelompok: pribadi (makan & minum, transportasi, tagihan, pulsa & internet, kesehatan, pendidikan, sedekah & zakat, …), proyek (gaji tim, vendor, perangkat lunak, pemasaran, operasional, …), dan dana titipan (infaq, sedekah, zakat, penyaluran).
- **Ringkasan**: saldo semua akun, masuk/keluar bulan ini dibanding bulan lalu, **proyeksi saldo 30 hari** dari tagihan rutin, diagram **arus kas** 6/12 bulan (klik bulan untuk melihat transaksinya; tersedia tampilan tabel), pengeluaran per kategori, anggaran, dan jadwal 14 hari.
- **Anggaran**: batas bulanan per kategori atau untuk semua pengeluaran, serta anggaran **total proyek** (mis. riset Rp3 jt). Bilah berubah kuning saat 80% dan merah saat terlampaui.
- **Tagihan rutin**: listrik, kos, internet, langganan, cicilan, gaji. Saat jatuh tempo muncul di Ringkasan, dasbor, dan rangkuman pagi dengan tombol **Bayar/Terima** atau **Lewati**. Centang **Catat otomatis** untuk debit otomatis dan langganan.
- **Transaksi**: saring menurut jenis, akun, kategori, dan kata kunci; kolom saldo berjalan mengikuti akun yang dipilih; **CSV** untuk Excel.

### Donatur & laporan (dana titipan)

Tab **Donatur** merekap infaq, sedekah, zakat, wakaf, dan donasi per donatur beserta penyalurannya.

- **Laporan donatur**: pilih donatur dan periode, isi nama lembaga dan catatan, lalu **Cetak / simpan PDF** atau **Simpan HTML**. Laporan berisi rincian setoran, total, dan dana yang sudah disalurkan lembaga pada periode yang sama.
- Lewat asisten AI: "catat infaq 500rb dari Pak Ahmad via transfer" atau "berapa saldo kas Penitipan Infaq?".

## Evaluasi & diagram per proyek

Halaman [Evaluasi](page:review) merangkum hari, minggu, atau bulan: aktivitas selesai, KPI tercapai, tugas selesai, waktu tercatat, kualitas ibadah, dan check-in OKR.

- **Diagram per proyek**: pilih proyek (atau Semua proyek untuk membandingkan proyek utama; satu proyek untuk membandingkan subproyeknya), lalu pilih ukuran — **Waktu tercatat**, **Tugas selesai**, **KPI tercapai**, **Progres OKR** — dan jenis diagram: **Batang**, **Garis**, **Donat**, **Heatmap**, atau **Tabel**.
- Donat hanya tersedia untuk ukuran yang bisa dijumlah (waktu dan tugas).
- Refleksi harian/mingguan/bulanan disimpan bersama angka periode itu.

## Catatan

Editor blok seperti Notion. Halaman bisa bersarang, dihubungkan ke proyek, dan tampil di sidebar Ruang.

- **Perintah garis miring**: ketik **/** di awal atau tengah baris untuk memilih blok. Ketik untuk menyaring (mis. `/tog`, `/tabel`). Kelompoknya: **Dasar** (teks, judul 1–3, daftar, daftar bernomor, checklist, toggle, kutipan, callout, pemisah, kode, tabel), **Media** (gambar, daftar isi), **Sebut** (tautan ke halaman lain, tugas, tanggal), **Ruangku** (subhalaman, tugas baru, template), dan **Warna**.
- **Menu blok**: arahkan kursor ke blok lalu klik **⋮⋮** di kiri (seret ikon itu untuk memindahkan blok; **+** menambah blok di bawahnya). Isinya: hapus, duplikat, **ubah menjadi** (judul, daftar, toggle, callout, kutipan, kode, …), warna teks & latar, pindah ke atas/bawah, salin teks, jadikan tugas, serta operasi baris/kolom tabel.
- **Bilah format**: pilih teks untuk menebalkan, miring, garis bawah, coret, kode, tautan, warna, sorot, atau menjadikannya tugas.
- **Menu konteks** (klik kanan) di editor dan di pohon halaman: buka, subhalaman baru, favorit, ganti nama, ikon, duplikat, pindahkan, salin tautan, hapus.
- **Toggle**, **callout** (catatan, tips, penting, peringatan, bahaya), **daftar isi** otomatis, **gambar** (tempel dari clipboard atau seret file; ubah lebarnya), dan **sampul** halaman.
- **[[** untuk menautkan halaman lain; halaman bisa diseret di pohon untuk dipindahkan.
- **Komentar**: panel komentar ada di bawah setiap halaman (lihat **Komentar & sebutan** di bagian Kolaborasi tim).
- **Tempel di desktop**: tombol sticky note menampilkan catatan sebagai kertas tempel di desktop. Klik untuk menulis, centang checklist langsung, ubah warna, dan pilih lapisan (biasa, selalu di atas, atau menempel di desktop).

### Referensi thesis (Zotero / BibTeX)

Tombol **Impor daftar pustaka** (ikon buku di atas pohon halaman Catatan) membaca berkas `.bib`.

1. Di Zotero: klik kanan koleksi → **Export Collection…** → format **BibTeX**. Mendeley dan Google Scholar juga bisa mengekspor `.bib`.
2. Di Ruangku: **Impor daftar pustaka** → **Pilih berkas .bib** (atau tempel isinya) → pilih proyek (mis. Riset Thesis) → **Impor**. Pratinjau menunjukkan berapa referensi terbaca dan berapa yang sudah ada.
3. Ruangku membuat halaman **Pustaka** berisi daftar pustaka gaya APA 7 dan, bila dicentang, satu subhalaman catatan baca per referensi: sitasi lengkap, sitasi dalam teks, kunci sitasi, DOI/URL, ringkasan (diisi abstrak bila ada), serta bagian Metode & data, Temuan penting, dan Relevansi untuk thesis.
4. Impor ulang aman: referensi yang kunci sitasinya sudah ada dilewati, sehingga catatan baca Anda tidak tertimpa; daftar di halaman Pustaka diperbarui.

Cari referensi lewat Ctrl+K dengan judul atau nama penulisnya.

## File

- Penjelajah file lengkap: salin, potong, tempel, ganti nama, hapus ke Recycle Bin, cari, ukuran folder, favorit, dan tag.
- **Folder proyek** muncul di panel kiri. Saat memilih proyek di pemilih proyek, folder proyek itu langsung dibuka.
- Panel detail file punya pilihan **Proyek** untuk menandai file; lihat semua file bertanda proyek lewat "File bertanda …".

## Ibadah

Jadwal sholat (kriteria Kemenag), reminder ibadah, target sempurna setiap ibadah wajib dan sunnah, puasa sunnah otomatis menurut kalender Hijriah, serta skor harian dan rekap. Atur kota dan reminder di halaman [Ibadah](page:ibadah).

### Jadwal sadar ibadah

Setelah lokasi diatur, Ruangku melindungi waktu sholat di jadwal Anda.

- Rentang yang dilindungi dihitung dari adzan: Subuh 20 menit, Dzuhur 15, Ashar 15, Maghrib 20, Isya 15. Hari **Jumat**, Dzuhur diganti **Sholat Jumat** mulai 15 menit sebelum adzan selama 60 menit.
- Di Kalender (Hari/Minggu), rentang itu diarsir. Bila Anda membuat atau menggeser blok sehingga menimpanya, muncul peringatan dengan tombol **Geser ke …** yang memindahkan blok tepat setelah sholat (bila menabrak sholat berikutnya, digeser lagi).
- Asisten AI mengetahui rentang ini dan tidak menaruh blok di waktu sholat saat merencanakan hari.
- Matikan atau nyalakan lewat **Lindungi waktu sholat** di panel kiri Kalender.

## Widget desktop

Widget transparan di desktop: jam, ibadah, **agenda hari ini**, tugas, KPI, OKR, dan catatan; tab Kalender membuka detail hari dengan grid jam yang bisa diedit langsung.

- **Agenda hari ini** menggabungkan blok jadwal, rapat (dengan tombol **Gabung** untuk rapat daring), kelas kuliah, pengingat, tugas berjam, dan acara kalender luar. Kartu **Sekarang** menunjukkan sisa waktu acara yang sedang berjalan, dan acara berikutnya diberi hitung mundur. Hari libur dan acara seharian tampil sebagai label di atas daftar. Klik agenda untuk membuka Kalender pada hari itu.
- **Mode mini** (ikon kecilkan di kepala widget): kartu kecil berisi jam, acara berikutnya, sholat berikutnya, dan timer yang berjalan. Klik dua kali atau ikon perbesar untuk kembali ke ukuran sebelumnya.
- **Lipat bagian**: klik judul bagian (Ibadah, Agenda, Tugas, …) untuk melipat atau membukanya. Urutan bagian bisa diubah di Atur widget → Isi.
- **Atur widget** (ikon slider): gaya cepat, **warna aksen**, warna latar, kepekatan, ukuran teks, sudut, efek Windows (Blur, Acrylic, Mica), dan isi.
- **Letakkan di** (Atur widget): Kiri atas, Kanan atas, Kiri bawah, Kanan bawah, Kanan setinggi layar, atau Bawah selebar layar. Widget menempel ke tepi layar kerja tanpa menutupi taskbar.
- **Arah isi**: Vertikal (bertumpuk) atau Horizontal (berjajar ke samping, grid jam ke kanan).
- **Ukuran jendela**: Kecil, Sedang, Besar, Lebar, Panorama — atau tarik tepinya. **Ukuran grid jam** bisa diatur terpisah.
- **Pemilih proyek** di pojok kanan atas widget menyaring isi widget tanpa mengubah pilihan di aplikasi utama.
- **Catatan cepat**: ketik di bagian Catatan lalu Enter; ikon 📌 menempelkan catatan sebagai sticky note.
- **Lapisan**: di desktop (di bawah semua jendela), biasa, atau selalu di atas. **Klik tembus** meneruskan klik ke desktop; buka lagi dari menu tray → Buka kunci widget.
- Semua pengaturan ini juga ada di aplikasi utama: [Pengaturan](page:settings) → **Widget**, lengkap dengan pratinjau.

## Pengingat istirahat

Pengaturan → **Pengingat istirahat**.

- Bawaan 50 menit kerja lalu 10 menit istirahat (pilihan cepat: 25/5 Pomodoro, 90/15 deep work).
- **Istirahat mata 20-20-20**: tiap 20 menit, lihat benda sejauh ±6 meter selama 20 detik.
- Saat waktunya, muncul **layar istirahat** dengan hitung mundur dan saran (regangkan badan, minum air, wudhu). Tombol **Tunda 5 menit**, **Lewati**, atau **Sudah istirahat**.
- **Selaraskan dengan waktu sholat**: bila istirahat jatuh tidak lama sebelum adzan (10–30 menit, bisa diatur), istirahat ditunda dan diambil saat adzan sekalian sholat, dengan durasi yang bisa diatur.
- Bila komputer tidak dipakai beberapa menit (keyboard/mouse diam), dihitung sudah istirahat dan hitungan mulai lagi. Setelah komputer tidur, hitungan juga mulai dari awal.
- Mulai istirahat kapan saja dari menu tray → **Istirahat sekarang**.

## Asisten AI

Halaman [Asisten AI](page:assistant) (Ctrl+J) bisa menjawab, merekomendasikan, dan langsung menambah atau mengubah data.

### Menyiapkan model

- **Claude (disarankan)**: buat API key di platform.claude.com → API keys, lalu tempel di tombol **Model**. Pilihan: Sonnet 5.5 (seimbang), Haiku 5.5 (hemat), Opus 5.5 (paling cerdas). Biaya dihitung per pemakaian oleh Anthropic.
- **ChatGPT (OpenAI)**: buat API key di platform.openai.com → API keys, lalu pilih preset GPT-6.1 Sol, GPT-6.1 Terra, atau GPT-6 Astra. Ruangku memakai Responses API OpenAI. Penagihan API terpisah dari langganan ChatGPT Plus/Pro.
- **Ollama (gratis, offline)**: pasang dari ollama.com, jalankan `ollama pull qwen2.5:7b`, lalu pilih preset Ollama. Butuh komputer cukup kuat.
- **Endpoint kompatibel OpenAI** lain juga bisa (isi alamat, model, dan kunci).
- API key disimpan di Windows Credential Manager di komputer ini dan tidak ikut sinkronisasi.

### Contoh perintah

- "Rencanakan hari saya dan buatkan blok jadwalnya" (waktu sholat otomatis dihindari)
- "Apa saja yang terlambat di Recruitment?"
- "Buat tugas siapkan slide seminar Jumat, proyek Riset Thesis, prioritas tinggi, tugaskan ke saya"
- "Geser blok Menulis bab 3 ke jam 14.00"
- "Catat KPI jam menulis thesis 2,5"
- "Catat infaq 1 juta dari Hamba Allah, tunai"
- "Berapa saldo kas Penitipan Infaq bulan ini?"
- "Ringkas kemajuan minggu ini per proyek"
- "Jadwalkan rapat evaluasi Jitu Kamis jam 13–14 dengan Rina dan Bayu, agendanya demo dan bug"
- "Saya izin kuliah Statistika hari ini" (mengisi presensi)
- "Keluar 45rb bensin dari dompet" / "Pengeluaran makan bulan ini berapa? Masih dalam anggaran?"

Tambah dan ubah data dijalankan langsung (bisa diubah agar selalu minta persetujuan). **Penghapusan selalu menunggu tombol Setujui.** Asisten menghormati peran: pembaca hanya bisa melihat.

## Claude & ChatGPT (server MCP)

Selain asisten di dalam aplikasi, Ruangku bisa menjadi **server MCP** (Model Context Protocol) sehingga Claude Desktop, Claude Code, ChatGPT, dan aplikasi AI lain bisa membaca serta mencatat ke data Anda: tugas, jadwal, rapat, kuliah, keuangan, catatan, KPI, dan OKR.

1. Buka [Pengaturan](page:settings) → **Connector** → **Server MCP**, lalu nyalakan **Aktifkan server MCP**. Ruangku mendengar di `http://127.0.0.1:47821/mcp` (port bisa diubah) dengan token rahasia.
2. Pilih kliennya dan salin cuplikan konfigurasi yang disediakan:
   - **Claude Desktop**: Settings → Developer → Edit Config, tempel bagian `ruangku` (perintah `ruangku.exe --mcp`), simpan, lalu buka ulang Claude Desktop.
   - **Claude Code**: jalankan perintah `claude mcp add …` yang disalin (HTTP dengan token, atau stdio).
   - **ChatGPT**: pakai **Secure MCP Tunnel** OpenAI (tunnel-client dengan `--mcp-command`), lalu di ChatGPT → Plugins → Add custom MCP server → Connection: Tunnel. Fitur ini mengikuti izin workspace ChatGPT Anda.
3. Ruangku harus sedang berjalan (ikon tray). Nyalakan **Jalan otomatis** agar selalu siap.

Keamanan: server hanya menerima koneksi dari komputer ini, memeriksa token dan asal permintaan, dan **tidak pernah membuka alat hapus**. Matikan **Izinkan AI menambah & mengubah data** untuk mode baca saja. Aktivitas terakhir tampil di bawah pengaturan MCP. Ruangku mendukung revisi MCP terbaru (2026-07-28) maupun klien lama.

**Konteks untuk Projects**: Pengaturan → Connector → **Konteks untuk Claude & ChatGPT Projects** mengekspor ringkasan proyek (tugas terbuka, rapat, kuliah, OKR, keuangan proyek, catatan) sebagai Markdown untuk ditempel ke pengetahuan Project.

## Pengaturan

[Pengaturan](page:settings) dibagi menjadi beberapa tab:

- **Umum**: tampilan (tema, warna aksen, ukuran, kepadatan, lebar halaman, huruf, sudut, animasi), sidebar & menu modul, jalan otomatis, data demo.
- **Widget**: semua pengaturan widget desktop dengan pratinjau langsung.
- **Connector**: server MCP untuk Claude/ChatGPT, model AI asisten, ekspor konteks, serta status Google Calendar, langganan ICS, server tim, Telegram, WhatsApp, Gmail, folder cloud, dan GitHub Releases.
- **Plugin & ekstensi**: nyalakan/matikan modul (Rapat, Kuliah, Catatan, File, Keuangan, OKR, KPI, Evaluasi, Ibadah, Tim & bot, Asisten AI) dan ekstensi otomatis (server MCP, penjaga waktu sholat, pengingat istirahat, rangkuman pagi, catat otomatis tagihan rutin). Modul yang dimatikan hilang dari sidebar, Ctrl+K, dasbor, dan widget; datanya tetap aman.
- **Notifikasi**: blok aktivitas, evaluasi, jam tenang, dan pengingat istirahat.
- **Data & keamanan**: sinkronisasi folder cloud, backup & pemulihan, keamanan, pembaruan, log & diagnostik.

## Kolaborasi tim

Kolaborasi memakai server **PocketBase** milik Anda sendiri, sehingga peran per email benar-benar ditegakkan di server.

### Memasang server

1. Unduh PocketBase untuk sistem Anda dari pocketbase.io/docs, lalu ekstrak ke sebuah folder.
2. Salin folder `server/pb_migrations` dan `server/pb_hooks` dari paket Ruangku ke folder yang sama dengan berkas `pocketbase`.
3. Jalankan `pocketbase serve --http=0.0.0.0:8090` (Windows: `pocketbase.exe serve --http=0.0.0.0:8090`). Saat pertama jalan, buka tautan yang tercetak untuk membuat akun superuser.
4. Agar bisa diakses dari luar kantor, pasang di VPS, gunakan Cloudflare Tunnel, atau layanan PocketHost, dan pakai alamat **https**.

### Menghubungkan aplikasi

1. [Tim & bot](page:team) → **Server tim** → isi alamat server, email, dan kata sandi → **Daftar akun baru** (pertama kali) atau **Masuk**.
2. Buat **ruang kerja** (mis. "Tim Jitu"). Anda otomatis menjadi pemiliknya.
3. Tab **Anggota & peran** → **Tambah anggota** → pilih ruang kerja, isi email dan peran. Anggota memasang Ruangku, lalu mendaftar ke server yang sama dengan email itu.
4. Bagikan proyek: Proyek → ubah proyek → **Dibagikan ke tim** → pilih ruang kerja. Subproyek, tugas, jadwal, catatan, OKR, KPI, komentar, dan buku kas proyek itu ikut tersinkron ke anggota.

### Langsung (realtime)

Selama aplikasi terbuka, Ruangku berlangganan perubahan dari server. Perubahan anggota lain muncul dalam beberapa detik tanpa menunggu sinkronisasi berkala. Status koneksi tampil di halaman Tim & bot (**Realtime aktif** atau **Realtime terputus**); bila koneksi putus, Ruangku tetap menyinkronkan tiap 30 detik dan menyambung ulang otomatis.

Dua orang yang mengubah tugas yang sama pada saat berdekatan tidak saling menimpa: Ruangku menggabungkan **per kolom**. Bila Anda mengubah tenggat dan rekan mengubah judul, keduanya tersimpan. Hanya bila kolom yang sama diubah, perubahan terakhir yang dipakai.

### Komentar & sebutan

- Setiap tugas dan halaman catatan punya kolom **komentar**. Ketik **@** untuk menyebut anggota (mis. `@Rina tolong cek bab 2`).
- Anggota yang disebut menerima pemberitahuan di **Kotak masuk** (ikon lonceng di samping nama aplikasi) dan, bila bot aktif, pesan lewat kanal mereka (WhatsApp, Telegram, atau email).
- Kotak masuk berisi tugas yang baru ditugaskan kepada Anda dan komentar yang menyebut Anda. Klik untuk membuka item; **Tandai dibaca** untuk membersihkan.
- Komentar buatan sendiri bisa dihapus.

### Peran

- **Pemilik**: semua akses, termasuk mengelola ruang kerja dan anggota.
- **Admin**: tambah, ubah, hapus semua data; kelola anggota kecuali pemilik.
- **Editor**: tambah, ubah, hapus semua data proyek tim.
- **Kontributor**: tambah data; ubah tugas yang ditugaskan kepadanya atau yang ia buat; hapus buatannya sendiri.
- **Pembaca**: hanya melihat dan menerima notifikasi. Di proyek tempat Anda pembaca, detail tugas dan halaman catatan terbuka dalam mode hanya-baca dengan keterangan di atasnya, acara proyek itu di Kalender tidak bisa digeser, dan setiap upaya mengubah data langsung ditolak dengan pesan penjelasan, bahkan sebelum dikirim ke server.

Perubahan yang tidak diizinkan ditolak server dan dikembalikan ke versi tim, disertai pemberitahuan. Data pribadi (ibadah, pengaturan, proyek yang tidak dibagikan) tidak pernah dikirim.

## Bot WhatsApp, Telegram & Gmail

Di [Tim & bot](page:team) → **Bot & kanal**, aktifkan **Perangkat ini menjalankan bot** pada satu komputer yang paling sering menyala.

### Telegram

1. Di Telegram, buka **@BotFather** → `/newbot` → salin token.
2. Tempel token, klik **Cek bot**, lalu aktifkan.
3. Di daftar anggota, klik ikon tautan untuk menyalin tautan `t.me/…?start=KODE` dan kirim ke anggota. Setelah mereka menekan Start, akun Telegram mereka terhubung.

### Gmail

1. Aktifkan verifikasi 2 langkah di akun Google.
2. Buat **Sandi aplikasi (App Password)** di Akun Google → Keamanan.
3. Isi alamat Gmail dan App Password, aktifkan, lalu kirim email uji. Penugasan dikirim dengan subjek `[Ruangku #KODE]`; balasan "selesai" atau "tunda besok" diproses otomatis bila **Baca balasan (IMAP)** aktif.

### WhatsApp Cloud API (resmi)

1. Di developers.facebook.com, buat aplikasi tipe Business dan tambahkan produk **WhatsApp**. Siapkan nomor khusus bot.
2. Catat **Phone Number ID** dan buat **token akses permanen** (System User di Meta Business).
3. Buat template pesan kategori Utility, bahasa Indonesia, misalnya `tugas_baru` dengan isi: "Tugas baru: {{1}}. Tenggat: {{2}}. Kode: {{3}}. Balas selesai {{3}} bila sudah beres." Template wajib untuk pesan pertama di luar jendela 24 jam.
4. Untuk pesan masuk, set webhook di Meta ke `https://server-anda/api/ruangku/wa/webhook`, isi verify token yang sama dengan variabel `RUANGKU_WA_VERIFY_TOKEN` di server, lalu langganan `messages`. Atur juga `RUANGKU_WA_APP_SECRET` agar tanda tangan pesan diperiksa.
5. Pilih cara kirim: langsung dari aplikasi (token di komputer ini) atau lewat server (`RUANGKU_WA_TOKEN` dan `RUANGKU_WA_PHONE_ID` di server).

Ruangku sengaja tidak memakai library WhatsApp Web tidak resmi karena melanggar ketentuan WhatsApp dan berisiko nomor diblokir.

### Rangkuman pagi

Di Tim & bot → Bot & kanal → **Rangkuman pagi**, aktifkan dan pilih jam kirim (bawaan 06:30) serta penerimanya.

- Isi rangkuman: tanggal Masehi dan Hijriah, waktu sholat, hari libur, agenda hari ini (blok jadwal, rapat beserta tautannya, kelas kuliah, pengingat, tugas berjam, acara kalender luar), tugas jatuh tempo dan terlambat beserta kodenya, tagihan rutin yang jatuh tempo (untuk Anda saja), serta tugas 3 hari ke depan.
- Anggota juga menerima rapat yang mereka ikuti.
- Anggota hanya menerima tugas yang ditugaskan kepada mereka; blok jadwal pribadi Anda tidak ikut terkirim.
- Dikirim lewat kanal masing-masing penerima. Untuk Anda sendiri tanpa kanal, rangkuman muncul sebagai notifikasi desktop.
- Dikirim sekali sehari. Bila komputer baru menyala setelah jam kirim (sebelum tengah hari), rangkuman tetap dikirim saat itu.
- Tombol **Kirim contoh sekarang** untuk mencoba.

### Perintah bot

- `tugas` — daftar tugas Anda
- `hari ini` (atau `ringkasan`, `agenda`) — agenda, tugas, dan waktu sholat hari ini
- `tambah Kirim laporan besok jam 10 #kantor` — buat tugas
- `selesai A1B2` — tandai selesai (kode ada di pesan penugasan)
- `tunda A1B2 jumat` — ubah tenggat
- `catat isi catatan` — simpan catatan
- `rapat` — rapat 7 hari ke depan beserta tautan Gabung
- `kuliah` — kelas hari ini & besok serta tugas kuliah (khusus pemilik)
- `kas` (atau `saldo`) — ringkasan keuangan, anggaran, dan tagihan jatuh tempo (khusus pemilik)
- `keluar 25rb makan siang` / `masuk 1,5jt honor` — catat pengeluaran/pemasukan (khusus pemilik)
- Pesan bebas lainnya dijawab asisten AI sesuai peran pengirim (bila diaktifkan). Penghapusan tidak bisa lewat bot.

## Sinkronisasi, backup & keamanan

### Sinkronisasi

- **Sinkronisasi pribadi** antarperangkat Anda lewat folder OneDrive/Google Drive/Dropbox: Pengaturan → Sinkronisasi cloud.
- **Server tim** untuk berbagi proyek dengan orang lain (lihat Kolaborasi tim).

### Backup & pemulihan

Pengaturan → **Backup & pemulihan**.

- **Backup otomatis harian** ke folder data Ruangku (backup pertama dibuat beberapa menit setelah aplikasi dibuka). Jumlah yang disimpan bisa diatur (bawaan 14 terakhir); yang lebih lama dihapus otomatis.
- **Backup sekarang** membuat backup manual yang tidak ikut terhapus otomatis. **Buka folder backup** menampilkannya di Explorer.
- **Pulihkan**: pilih titik backup dari daftar. Sebelum memulihkan, Ruangku selalu menyimpan keadaan sekarang sebagai backup **sebelum-pulihkan**, jadi pemulihan bisa dibatalkan dengan memulihkan backup itu.
- **Simpan ke file…** menyimpan seluruh data ke satu file JSON di lokasi pilihan Anda (mis. flashdisk). **Gabungkan dari file…** memasukkan file seperti itu tanpa menghapus data yang ada.

### Keamanan

Kunci API asisten AI, token bot Telegram/WhatsApp, sandi aplikasi Gmail, token server tim, serta client secret dan login Google Calendar disimpan di **Windows Credential Manager**, bukan di file pengaturan biasa, dan tidak pernah ikut sinkronisasi folder cloud. Kunci yang tersimpan dari versi lama dipindahkan otomatis saat pertama kali dibuka.

### Pembaruan aplikasi

Isi repo GitHub tempat installer Ruangku dirilis di Pengaturan → **Pembaruan aplikasi**. Ruangku memeriksanya sekali sehari dan memberi tahu bila ada versi baru, lengkap dengan catatan rilis dan tombol **Unduh installer**. **Periksa sekarang** untuk mengecek manual.

### Log & diagnostik

Pengaturan → **Log & diagnostik** → **Tampilkan diagnostik** memperlihatkan versi, ukuran dan hasil pemeriksaan database, jumlah data per jenis, status backup, folder data, dan log kejadian terakhir (backup, sinkronisasi, galat bot/Google). **Salin info** untuk dikirim saat melapor masalah; isinya tidak memuat isi catatan atau kunci rahasia. **Buka folder data** untuk melihat berkas log lengkap.

## Pintasan keyboard

- **Ctrl+K**: cari & perintah cepat
- **Ctrl+= / Ctrl+−**: perbesar/perkecil tampilan
- **Ctrl+1 … Ctrl+9**: Hari ini, Proyek, Tugas, Kalender, OKR, KPI, Evaluasi, Catatan, File
- **Ctrl+0**: Jadwal harian
- **Ctrl+P**: pilih proyek
- `Ctrl+\`: sembunyikan/tampilkan sidebar; **F2** ganti nama dan **Ctrl+D** duplikat pada item sidebar yang dipilih
- **Ctrl+J**: asisten AI
- **Ctrl+N**: item baru di halaman aktif
- **Ctrl+Shift+Space**: catat cepat dari aplikasi mana pun
- **[ dan ]**: hari sebelumnya/berikutnya di Jadwal harian
- Di Kalender: **D/W/M/A/Y** ganti tampilan, **T** hari ini, **←/→** mundur/maju, **N** buat acara
- **F1**: panduan ini

## Pertanyaan umum

- **Notifikasi tidak muncul?** Pengaturan Windows → Sistem → Notifikasi: izinkan Ruangku dan matikan Fokus/Jangan Ganggu.
- **Aplikasi tertutup tapi reminder tetap jalan?** Ya, menutup jendela hanya menyembunyikannya ke system tray. Pilih Keluar di menu tray untuk benar-benar menutup.
- **Bot tidak membalas?** Pastikan "Perangkat ini menjalankan bot" aktif di komputer yang menyala, lihat Aktivitas bot untuk pesan galat, dan cek token/kunci masing-masing kanal.
- **Asisten AI menjawab "gagal"?** Periksa API key, koneksi internet, atau pastikan Ollama sedang berjalan.
- **Google Calendar meminta login lagi?** Saat aplikasi Google masih berstatus *Testing*, Google mencabut login setelah 7 hari. Klik **Hubungkan** lagi, atau terbitkan aplikasi (Publish app) di OAuth consent screen.
- **Hari libur tidak muncul?** Pastikan lapisan **Kalender luar** dicentang dan "Libur nasional Indonesia" tetap dicentang di pengelolaan kalender.
- **Data hilang atau rusak?** Pengaturan → Backup & pemulihan → pilih backup otomatis dari hari sebelumnya → **Pulihkan**.
- **Claude/ChatGPT tidak melihat Ruangku?** Pastikan Ruangku berjalan dan Pengaturan → Connector → Server MCP berstatus **Berjalan**. Untuk Claude Desktop, buka ulang Claude setelah mengubah konfigurasi. Bila token dibuat ulang, perbarui perintah Claude Code. Port bentrok? Ganti port lalu salin ulang cuplikannya.
- **Tema gelap/terang tidak sesuai?** Pengaturan → Umum → Tampilan: pilih Terang atau Gelap, atau Ikuti Windows.
- **Tulisan terlalu kecil/besar atau halaman terlalu sempit?** Tekan Ctrl+= / Ctrl+−, atau klik ikon **Aa** di kaki sidebar untuk mengatur ukuran, kepadatan, dan lebar halaman.
- **Bagian halaman hilang?** Klik tombol **Tampilan** di halaman itu lalu centang lagi bagiannya, atau klik **Bawaan**.
- **Data demo terhapus tidak sengaja?** Pengaturan → Data demo → Muat ulang data demo.
