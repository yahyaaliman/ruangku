// Tur singkat saat pertama kali membuka Ruangku.
import { useEffect, useLayoutEffect, useState } from "react";
import { api } from "../lib/api";

const STEPS: { sel: string; title: string; text: string }[] = [
  { sel: ".sb-space", title: "Ruang", text: "Proyek, subproyek, dan halaman Anda tersusun seperti Notion. Klik proyek untuk memfokuskan semua halaman ke proyek itu; seret untuk menata ulang; klik kanan untuk ganti nama, ikon, duplikat, atau hapus. Ctrl+P untuk berpindah cepat." },
  { sel: ".cp-trigger", title: "Cari & perintah (Ctrl+K)", text: "Cari tugas, catatan, dan proyek, buat tugas dengan kalimat biasa, atau lompat ke tanggal. Ketik > untuk aksi seperti backup dan widget." },
  { sel: '[data-nav="projects"]', title: "Proyek & timeline", text: "Kelola proyek dan subproyek, lalu lihat timeline dari skala tahun, triwulan, bulan, minggu, sampai hari." },
  { sel: '[data-nav="tasks"]', title: "Tugas", text: "List, Kanban, Tabel dengan kolom kustom, Kalender, Timeline, dan Rencana hari. Tugaskan ke anggota tim; mereka diberi tahu lewat WhatsApp, Telegram, atau email." },
  { sel: '[data-nav="calendar"]', title: "Kalender", text: "Jadwal, tugas, pengingat, milestone, waktu sholat, dan hari libur nasional dalam tampilan hari, minggu, bulan, agenda, atau tahun. Bisa terhubung ke Google Calendar." },
  { sel: '[data-nav="schedule"]', title: "Jadwal harian", text: "Grid jam yang bisa vertikal atau horizontal, ukuran bisa diatur, dan tugas bisa diseret ke jam. Waktu sholat dilindungi." },
  { sel: '[data-nav="review"]', title: "Evaluasi", text: "Rangkuman harian, mingguan, bulanan, dengan diagram per proyek: batang, garis, donat, atau heatmap." },
  { sel: '[data-nav="assistant"]', title: "Asisten AI", text: "Minta rekomendasi rencana hari atau suruh menambah tugas dan jadwal. Penghapusan selalu minta persetujuan Anda." },
  { sel: '[data-nav="team"]', title: "Tim & bot", text: "Atur anggota dan peran per email, hubungkan server tim, dan aktifkan bot WhatsApp, Telegram, atau Gmail." },
  { sel: '[data-nav="guide"]', title: "Panduan", text: "Semua langkah ada di sini (F1). Selamat mencoba dengan data demo — hapus kapan saja dari banner kuning." },
];

export default function Tour({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = STEPS[i];
  useLayoutEffect(() => {
    const el = document.querySelector(step.sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
    setRect(el?.getBoundingClientRect() ?? null);
  }, [step.sel]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const finish = () => {
    api.setSetting("tour_done", "1").catch(() => {});
    onDone();
  };
  const next = () => (i < STEPS.length - 1 ? setI(i + 1) : finish());
  const pad = 6;
  const card = rect ? { top: Math.min(window.innerHeight - 200, Math.max(12, rect.top - 8)), left: Math.min(window.innerWidth - 340, rect.right + 18) } : { top: window.innerHeight / 2 - 90, left: window.innerWidth / 2 - 160 };
  return (
    <div className="tour" role="dialog" aria-label={`Tur: ${step.title}`}>
      {rect ? <div className="tour-spot" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className="tour-card" style={card}>
        <p className="tour-step">{i + 1} / {STEPS.length}</p>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        <div className="tour-btns">
          <button className="link" onClick={finish}>Lewati tur</button>
          <span>
            {i > 0 && <button className="btn btn-sm" onClick={() => setI(i - 1)}>Kembali</button>}
            <button className="btn btn-sm btn-primary" onClick={next}>{i < STEPS.length - 1 ? "Lanjut" : "Selesai"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
