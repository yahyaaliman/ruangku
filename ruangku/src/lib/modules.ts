// Modul (plugin bawaan) yang bisa dinyalakan/dimatikan di Pengaturan → Plugin & ekstensi.
// Modul yang mati disembunyikan dari sidebar, palet Ctrl+K, dasbor, dan widget; datanya tetap aman.
import { useJsonSetting } from "./useSetting";

export type ModuleId = "meetings" | "courses" | "notes" | "files" | "ledger" | "okr" | "kpi" | "review" | "ibadah" | "team" | "assistant";

export interface ModuleDef {
  id: ModuleId;
  label: string;
  desc: string;
  /** Halaman yang dibuka modul ini */
  page: string;
  emoji: string;
}

export const MODULES: ModuleDef[] = [
  { id: "meetings", label: "Rapat", page: "meetings", emoji: "🤝", desc: "Agenda, peserta, tautan Zoom/Meet, notulen, dan action item yang langsung jadi tugas." },
  { id: "courses", label: "Kuliah", page: "courses", emoji: "🎓", desc: "Mata kuliah, jadwal mingguan satu semester, presensi, tugas, ujian, dan nilai/IPK." },
  { id: "notes", label: "Catatan", page: "notes", emoji: "📝", desc: "Halaman bersarang ala Notion dengan editor blok, template, dan tautan antarhalaman." },
  { id: "files", label: "File", page: "files", emoji: "📁", desc: "Penjelajah file dengan folder proyek, tag, dan favorit." },
  { id: "ledger", label: "Keuangan", page: "ledger", emoji: "💰", desc: "Buku kas pribadi & proyek: akun, anggaran, tagihan berulang, arus kas, laporan donatur." },
  { id: "okr", label: "OKR", page: "okr", emoji: "🎯", desc: "Objective & key result per kuartal dengan check-in." },
  { id: "kpi", label: "KPI harian", page: "kpi", emoji: "📈", desc: "Angka harian dengan target, tren, dan streak." },
  { id: "review", label: "Evaluasi", page: "review", emoji: "🧭", desc: "Rangkuman dan refleksi harian, mingguan, bulanan dengan diagram per proyek." },
  { id: "ibadah", label: "Ibadah", page: "ibadah", emoji: "🕌", desc: "Jadwal sholat, target ibadah wajib & sunnah, puasa, dan skor harian." },
  { id: "team", label: "Tim & bot", page: "team", emoji: "👥", desc: "Server tim, anggota & peran, bot WhatsApp/Telegram/Gmail." },
  { id: "assistant", label: "Asisten AI", page: "assistant", emoji: "🤖", desc: "Asisten Claude/ChatGPT/Ollama yang bisa membaca dan mengubah data Anda." },
];

export const MODULES_KEY = "modules_off";

/** Modul aktif. Disimpan sebagai daftar modul yang dimatikan supaya modul baru otomatis menyala. */
export function useModules() {
  const [off, setOff] = useJsonSetting<string[]>(MODULES_KEY, []);
  const isOn = (id: string) => !off.includes(id);
  const pageOn = (page: string) => {
    const m = MODULES.find((x) => x.page === page);
    return !m || isOn(m.id);
  };
  const set = (id: ModuleId, on: boolean) => setOff((cur) => (on ? cur.filter((x) => x !== id) : [...new Set([...cur, id])]));
  return { off, isOn, pageOn, set };
}
