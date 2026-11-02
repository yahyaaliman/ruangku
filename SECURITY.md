# Kebijakan keamanan

## Versi yang didukung

Perbaikan keamanan dirilis untuk versi terbaru di halaman [Releases](https://github.com/yahyaaliman/ruangku/releases/latest). Perbarui ke versi terbaru sebelum melaporkan masalah.

## Melaporkan celah keamanan

Jangan laporkan celah keamanan lewat issue publik. Gunakan **Security → Report a vulnerability** di halaman repo ini agar laporan hanya terlihat oleh pengelola. Bila tombol itu belum tersedia, buka issue singkat tanpa detail teknis dan minta saluran kontak pribadi.

Sertakan:

- versi Ruangku dan versi Windows;
- langkah untuk memunculkan masalah;
- dampaknya (data apa yang bisa dibaca, diubah, atau dijalankan);
- log dari `%APPDATA%\com.ruangku.app\logs\ruangku.log` bila relevan. Hapus token, kunci API, dan data pribadi terlebih dahulu.

## Cakupan

Termasuk: aplikasi desktop, installer, server MCP lokal, sinkronisasi, dan hook server tim di folder `server/`. Tidak termasuk: layanan pihak ketiga yang dihubungkan pengguna (Google, Microsoft, OpenAI, Anthropic, Telegram, Meta) dan server PocketBase yang dikelola sendiri oleh pengguna.

Rincian model keamanan ada di [docs/integrasi-dan-keamanan.md](docs/integrasi-dan-keamanan.md) dan [docs/instalasi-windows.md](docs/instalasi-windows.md).
