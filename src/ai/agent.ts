// Putaran agen: kirim percakapan ke model, jalankan alat yang diminta, ulangi.
import type { AiConfig } from "./config";
import { Block, complete, Msg } from "./llm";
import { ActionLog, Pending, runTool, ToolCtx, toolDefs } from "./tools";
import { dateKey } from "../lib/date";
import { projectsAll, load } from "../lib/taskOps";
import { flatTree } from "../lib/projects";
import type { Member } from "../lib/team";
import { bandsFor, bandsText } from "../lib/prayerGuard";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export async function systemPrompt(ctx: ToolCtx, channel: "aplikasi" | "telegram" | "whatsapp" | "email"): Promise<string> {
  const now = new Date();
  const projects = await projectsAll();
  const members = await load<Member>("member");
  const me = ctx.actor ?? members.find((m) => m.isMe);
  const tree = flatTree(projects.filter((p) => p.id !== "inbox" && !p.archived))
    .map(({ p, depth }) => `${"  ".repeat(depth)}- ${p.name} (id=${p.id})`)
    .join("\n");
  const bands = await bandsFor(dateKey(now)).catch(() => []);
  return [
    "Anda adalah asisten produktivitas di aplikasi Ruangku. Jawab dalam bahasa Indonesia yang ringkas, hangat, dan praktis.",
    `Sekarang ${HARI[now.getDay()]}, ${dateKey(now)} pukul ${now.toTimeString().slice(0, 5)} (zona waktu lokal pengguna).`,
    `Lawan bicara: ${me ? `${me.name} (peran ${ctx.role}${me.isMe ? ", pemilik aplikasi" : ""})` : `pengguna (peran ${ctx.role})`}. Kanal: ${channel}.`,
    "Proyek yang ada:",
    tree || "(belum ada proyek)",
    "",
    bands.length ? `Waktu sholat hari ini (dilindungi, jangan dijadwalkan kegiatan lain): ${bandsText(bands)}.` : "",
    "Aturan:",
    "- Selalu ambil data lewat alat sebelum menyebut tugas, jadwal, atau angka. Jangan mengarang id; pakai id dari hasil alat.",
    "- Untuk membuat/mengubah data, panggil alat yang sesuai. Untuk 'besok', 'Jumat', dsb. hitung tanggal YYYY-MM-DD dari tanggal hari ini.",
    "- Penghapusan selalu menunggu persetujuan pengguna; jangan mengulang alat hapus setelah mendapat status menunggu.",
    "- Saat diminta rekomendasi atau rencana hari: panggil ringkasan_hari, utamakan yang terlambat dan prioritas tinggi, perhatikan estimasi dan kapasitas sekitar 6 jam kerja fokus, sisakan jeda istirahat dan waktu sholat, lalu tawarkan atau buat blok jadwal.",
    "- Rapat: pakai daftar_rapat/buat_rapat/ubah_rapat (bukan buat_blok) agar undangan, notulen, dan action item tersedia. Kuliah: jadwal_kuliah dan catat_presensi.",
    "- Keuangan: catat_kas untuk pemasukan/pengeluaran/transfer (tanpa proyek = pribadi), saldo_kas untuk ringkasan & anggaran, daftar_transaksi untuk rincian. Tulis angka rupiah lengkap (Rp25.000).",
    "- Bila sebuah alat mengembalikan 'Ditolak', jelaskan dengan sopan bahwa peran pengguna tidak mengizinkannya.",
    channel === "aplikasi" ? "- Format jawaban boleh memakai daftar singkat dan **tebal**. Jangan terlalu panjang." : "- Ini pesan chat: jawab singkat tanpa tabel, maksimal sekitar 8 baris. Sebutkan kode tugas [XXXX] agar bisa dibalas.",
  ].join("\n");
}

/** Pangkas riwayat tanpa memutus pasangan tool_use/tool_result. */
export function trimHistory(h: Msg[], max = 24): Msg[] {
  if (h.length <= max) return h;
  let start = h.length - max;
  while (start < h.length && !(h[start].role === "user" && typeof h[start].content === "string")) start++;
  return start < h.length ? h.slice(start) : h.slice(-1);
}

export interface AgentResult {
  history: Msg[];
  reply: string;
  actions: ActionLog[];
  pending: Pending[];
}

export async function runAgent(opts: { cfg: AiConfig; history: Msg[]; userText: string; ctx: ToolCtx; channel?: "aplikasi" | "telegram" | "whatsapp" | "email"; onStep?: (label: string) => void }): Promise<AgentResult> {
  const { cfg, ctx } = opts;
  const system = await systemPrompt(ctx, opts.channel ?? "aplikasi");
  const tools = toolDefs(ctx.role);
  let history: Msg[] = [...trimHistory(opts.history), { role: "user", content: opts.userText }];
  const actions: ActionLog[] = [];
  const pending: Pending[] = [];
  let reply = "";
  for (let step = 0; step < 8; step++) {
    const res = await complete(cfg, system, history, tools);
    history = [...history, { role: "assistant", content: res.blocks }];
    const text = res.blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    const calls = res.blocks.filter((b) => b.type === "tool_use") as Extract<Block, { type: "tool_use" }>[];
    if (!calls.length) {
      reply = text;
      break;
    }
    if (text) opts.onStep?.(text);
    const results: Block[] = [];
    for (const c of calls) {
      opts.onStep?.(`Menjalankan ${c.name}…`);
      const out = await runTool(c.name, c.input ?? {}, ctx);
      if (out.action) actions.push(out.action);
      if (out.pending) pending.push(out.pending);
      results.push({ type: "tool_result", tool_use_id: c.id, content: out.content, ...(out.is_error ? { is_error: true } : {}) });
    }
    history = [...history, { role: "user", content: results }];
    if (step === 7) reply = text || "Saya sudah menjalankan beberapa langkah. Ada lagi yang perlu dibantu?";
  }
  return { history, reply, actions, pending };
}
