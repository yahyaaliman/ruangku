// Perintah chat bot (WhatsApp, Telegram, email). Teks bebas lainnya diteruskan ke asisten AI.
export type Command =
  | { cmd: "bantuan" }
  | { cmd: "link"; code: string }
  | { cmd: "tugas" }
  | { cmd: "hari_ini" }
  | { cmd: "tambah"; text: string }
  | { cmd: "selesai"; code: string }
  | { cmd: "tunda"; code: string; when: string }
  | { cmd: "catat"; text: string }
  | { cmd: "rapat" }
  | { cmd: "kuliah" }
  | { cmd: "kas" }
  | { cmd: "uang"; type: "masuk" | "keluar"; text: string }
  | { cmd: "ai"; text: string };

/** `ctxCode`: kode tugas dari konteks (mis. subjek email "[Ruangku #A1B2]"). */
export function parseCommand(raw: string, ctxCode?: string): Command {
  const text = raw.trim().replace(/\s+/g, " ");
  const low = text.toLowerCase().replace(/^\//, "");
  const code = (s: string | undefined) => (s ?? "").replace(/^#/, "").replace(/[^a-z0-9-]/gi, "").toUpperCase();
  let m: RegExpExecArray | null;
  if (!low || /^(bantuan|help|menu|\?)$/.test(low)) return { cmd: "bantuan" };
  if ((m = /^start(?:@\w+)?(?:\s+(\S+))?$/.exec(low))) return m[1] ? { cmd: "link", code: m[1] } : { cmd: "bantuan" };
  if (/^(tugas|tugas saya|daftar|daftar tugas|todo)$/.test(low)) return { cmd: "tugas" };
  if (/^(hari ini|jadwal|jadwal hari ini|agenda|ringkasan|rangkuman|pagi)$/.test(low)) return { cmd: "hari_ini" };
  if ((m = /^(?:tambah|tugas baru|\+)\s*(.+)$/i.exec(text.replace(/^\//, "")))) return { cmd: "tambah", text: m[1].trim() };
  if ((m = /^(?:selesai|done|beres|sudah)(?:\s+(#?[a-z0-9-]+))?\.?$/i.exec(low))) {
    const c = code(m[1]) || code(ctxCode);
    if (c) return { cmd: "selesai", code: c };
  }
  if ((m = /^(?:tunda|undur|pindah)\s+(#?[a-z0-9-]+)\s+(.+)$/i.exec(text.replace(/^\//, "")))) return { cmd: "tunda", code: code(m[1]), when: m[2] };
  if ((m = /^(?:tunda|undur)\s+(.+)$/i.exec(text)) && ctxCode) return { cmd: "tunda", code: code(ctxCode), when: m[1] };
  if ((m = /^(?:catat|catatan|note)\s+(.+)$/i.exec(text.replace(/^\//, "")))) return { cmd: "catat", text: m[1] };
  if (/^(rapat|meeting|jadwal rapat|rapat saya)$/.test(low)) return { cmd: "rapat" };
  if (/^(kuliah|kelas|jadwal kuliah|kelas hari ini)$/.test(low)) return { cmd: "kuliah" };
  if (/^(kas|saldo|keuangan|uang|cashflow)$/.test(low)) return { cmd: "kas" };
  if ((m = /^(?:keluar|bayar|beli|belanja|pengeluaran)\s+(.+)$/i.exec(text.replace(/^\//, "")))) return { cmd: "uang", type: "keluar", text: m[1] };
  if ((m = /^(?:masuk|terima|pemasukan|gaji)\s+(.+)$/i.exec(text.replace(/^\//, "")))) return { cmd: "uang", type: "masuk", text: m[1] };
  return { cmd: "ai", text };
}

export const HELP_TEXT = [
  "🤖 *Bot Ruangku*",
  "• *tugas* — daftar tugas Anda",
  "• *hari ini* / *ringkasan* — agenda, tugas, dan waktu sholat hari ini",
  "• *tambah* Kirim laporan besok jam 10 #kantor — buat tugas",
  "• *selesai* A1B2 — tandai tugas selesai",
  "• *tunda* A1B2 jumat — ubah tenggat",
  "• *catat* isi catatan — simpan catatan",
  "• *rapat* — rapat Anda 7 hari ke depan (waktu, tempat, tautan)",
  "• *kuliah* — kelas hari ini & besok serta tugas kuliah",
  "• *keluar* 25rb makan siang / *masuk* 5jt gaji — catat ke buku kas",
  "• *kas* — saldo dan pengeluaran bulan ini",
  "Selain itu, tulis bebas (mis. \"apa prioritas saya minggu ini?\") untuk dijawab asisten AI.",
].join("\n");

/** Ambil kode tugas dari subjek email "[Ruangku #A1B2] ...". */
export function codeFromSubject(subject: string): string | undefined {
  const m = /\[Ruangku\s*#([A-Z0-9-]+)\]/i.exec(subject);
  return m ? m[1].toUpperCase() : undefined;
}
