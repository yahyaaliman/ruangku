// Alat (tools) yang bisa dipanggil asisten AI untuk membaca dan mengubah data Ruangku.
import { api, newId } from "../lib/api";
import { removeBlockSmart, REMOVE_MESSAGE } from "../lib/agendaSync";
import type { Item, KeyResult, Kpi, KpiEntry, Note, Objective, Reminder, TimeBlock } from "../lib/types";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { fmtMin, parseHHMM } from "../lib/timeblocks";
import { bandsFor, bandsText, conflicts, nudge } from "../lib/prayerGuard";
import { byParty, rupiah, type LedgerEntry, type TxType } from "../lib/ledger";
import { ACCOUNT_KIND, BUDGET_KIND, financeSummaryText, guessCategory, LEDGER_KIND, RECURRING_KIND, type Account, type Budget, type Recurring } from "../lib/finance";
import { MEETING_KIND, meetingWhen, type Meeting } from "../lib/meetings";
import { ATTENDANCE_LABEL, attendanceStats, COURSE_KIND, courseLabel, type Attendance, type Course } from "../lib/courses";
import { parseField } from "../lib/customFields";
import { fmtDuration, isTaskDone, priorityRank, Project, projectOf, Task, TaskPriority } from "../lib/tasks";
import { blockProject, flatTree, projectPath, subtreeIds } from "../lib/projects";
import { can, Member, Role } from "../lib/team";
import { kpiMet, krProgress } from "../lib/metrics";
import { createTask, load, projectsAll, removeTask, shortCode, strip, updateTask } from "../lib/taskOps";
import type { ToolDef } from "./llm";

export interface ToolCtx {
  role: Role;
  actor?: Item<Member>;
  /** Tambah/ubah langsung dijalankan. Bila false, menjadi usulan yang perlu disetujui. */
  autoApply: boolean;
  /** Konteks bot: penghapusan tidak diizinkan lewat chat. */
  viaBot?: boolean;
}
export interface ActionLog {
  kind: "create" | "update" | "delete";
  label: string;
  ref?: { type: "task" | "note" | "project" | "block" | "reminder" | "kpi" | "kr" | "ledger" | "meeting" | "course"; id: string };
}
export interface Pending {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  label: string;
  kind: "create" | "update" | "delete";
}
export interface ToolOut {
  content: string;
  is_error?: boolean;
  action?: ActionLog;
  pending?: Pending;
}

const S = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object" as const, properties: props, required });
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });
const strArr = (description: string) => ({ type: "array", items: { type: "string" }, description });

export const TOOLS: (ToolDef & { access: "read" | "create" | "update" | "delete" })[] = [
  { name: "ringkasan_hari", access: "read", description: "Ringkasan satu hari: tugas jatuh tempo & terlambat, blok jadwal, reminder, dan KPI. Pakai ini sebelum memberi rekomendasi rencana hari.", input_schema: S({ tanggal: str("YYYY-MM-DD, default hari ini") }) },
  { name: "daftar_proyek", access: "read", description: "Daftar proyek & subproyek beserta id, periode, dan progres tugas.", input_schema: S({}) },
  { name: "daftar_tugas", access: "read", description: "Cari tugas. Semua filter opsional.", input_schema: S({ proyek: str("id atau nama proyek (termasuk subproyeknya)"), status: { type: "string", enum: ["terbuka", "selesai", "semua"] }, tenggat_sampai: str("YYYY-MM-DD"), ditugaskan_ke: str("id/email/nama anggota, atau 'saya'"), kata: str("kata kunci judul"), batas: num("maks hasil, default 25") }) },
  { name: "cari", access: "read", description: "Cari teks di tugas, catatan, dan proyek.", input_schema: S({ kata: str("kata kunci") }, ["kata"]) },
  { name: "jadwal_hari", access: "read", description: "Blok jadwal per jam pada satu tanggal.", input_schema: S({ tanggal: str("YYYY-MM-DD") }, ["tanggal"]) },
  { name: "statistik", access: "read", description: "Statistik periode: waktu tercatat per proyek, tugas selesai, KPI tercapai, progres OKR.", input_schema: S({ periode: { type: "string", enum: ["minggu", "bulan"] }, proyek: str("id atau nama proyek (opsional)") }) },
  { name: "daftar_anggota", access: "read", description: "Anggota tim dengan id, peran, email, WA, Telegram.", input_schema: S({}) },
  { name: "buat_tugas", access: "create", description: "Membuat tugas baru.", input_schema: S({ judul: str("judul tugas"), proyek: str("id atau nama proyek/subproyek; kosong = Inbox"), tenggat: str("YYYY-MM-DD"), jam: str("HH:MM jam tenggat"), mulai: str("YYYY-MM-DD"), prioritas: { type: "string", enum: ["urgent", "tinggi", "sedang", "rendah"] }, estimasi_menit: num("perkiraan durasi"), tag: strArr("tag tanpa #"), deskripsi: str("keterangan"), ditugaskan_ke: strArr("id/email/nama anggota"), induk: str("id tugas induk bila subtugas") }, ["judul"]) },
  { name: "ubah_tugas", access: "update", description: "Mengubah tugas. status: 'selesai', 'buka', atau id status proyek.", input_schema: S({ id: str("id tugas"), judul: str(""), status: str(""), tenggat: str("YYYY-MM-DD atau kosong untuk menghapus"), jam: str("HH:MM"), prioritas: { type: "string", enum: ["urgent", "tinggi", "sedang", "rendah"] }, proyek: str("id/nama proyek"), estimasi_menit: num(""), ditugaskan_ke: strArr("id/email/nama anggota (mengganti daftar)"), deskripsi: str("") }, ["id"]) },
  { name: "hapus_tugas", access: "delete", description: "Menghapus tugas beserta subtugasnya. Selalu butuh konfirmasi pengguna.", input_schema: S({ id: str("id tugas") }, ["id"]) },
  { name: "buat_proyek", access: "create", description: "Membuat proyek atau subproyek.", input_schema: S({ nama: str(""), induk: str("id/nama proyek induk untuk subproyek"), mulai: str("YYYY-MM-DD"), selesai: str("YYYY-MM-DD"), deskripsi: str(""), warna: { type: "string", enum: ["nila", "kunyit", "daun", "bata", "abu", "ungu", "laut", "jambu", "kopi"] } }, ["nama"]) },
  { name: "buat_blok", access: "create", description: "Menambah blok waktu di jadwal harian (timeboxing).", input_schema: S({ tanggal: str("YYYY-MM-DD"), mulai: str("HH:MM"), selesai: str("HH:MM"), judul: str(""), proyek: str("id/nama proyek"), tugas_id: str("id tugas yang dikerjakan di blok ini") }, ["tanggal", "mulai", "selesai", "judul"]) },
  { name: "ubah_blok", access: "update", description: "Menggeser atau mengubah blok jadwal (tanggal, jam, judul).", input_schema: S({ id: str("id blok"), tanggal: str("YYYY-MM-DD"), mulai: str("HH:MM"), selesai: str("HH:MM"), judul: str("") }, ["id"]) },
  { name: "hapus_blok", access: "delete", description: "Menghapus blok jadwal. Butuh konfirmasi.", input_schema: S({ id: str("id blok") }, ["id"]) },
  { name: "catat_kas", access: "create", description: "Mencatat transaksi keuangan pribadi atau proyek: pemasukan (gaji, honor, infaq dari donatur), pengeluaran (makan, transport, tagihan, penyaluran), atau transfer antarakun. Tanpa proyek = keuangan pribadi. Kategori ditebak dari keterangan bila kosong.", input_schema: S({ jenis: { type: "string", enum: ["masuk", "keluar", "transfer"] }, jumlah: num("rupiah"), kategori: str("mis. Makan & minum, Transportasi, Tagihan & utilitas, Gaji, Infaq, Penyaluran, Operasional"), pihak: str("donatur/klien (masuk) atau penerima/toko (keluar)"), keterangan: str(""), tanggal: str("YYYY-MM-DD, default hari ini"), metode: { type: "string", enum: ["transfer", "tunai", "qris", "kartu", "ewallet", "lainnya"] }, akun: str("nama/id akun sumber (keluar/transfer) atau tujuan (masuk), mis. BCA, GoPay, Dompet"), ke_akun: str("akun tujuan untuk transfer"), proyek: str("id/nama proyek; kosong = pribadi") }, ["jenis", "jumlah"]) },
  { name: "saldo_kas", access: "read", description: "Ringkasan keuangan: saldo tiap akun, masuk/keluar bulan ini, kategori terbesar, anggaran yang hampir/sudah lewat, tagihan rutin jatuh tempo 7 hari, dan donatur bulan ini.", input_schema: S({ proyek: str("id/nama proyek, kosong = semua") }, []) },
  { name: "daftar_transaksi", access: "read", description: "Daftar transaksi buku kas dengan saring opsional.", input_schema: S({ bulan: str("YYYY-MM, default bulan ini"), jenis: { type: "string", enum: ["masuk", "keluar", "transfer"] }, kategori: str(""), akun: str("nama/id akun"), proyek: str("id/nama proyek; 'pribadi' = tanpa proyek"), kata: str("kata kunci"), batas: num("maks hasil, default 30") }) },
  { name: "daftar_rapat", access: "read", description: "Rapat terjadwal beberapa hari ke depan (dan yang baru lewat), dengan id, waktu, lokasi, tautan, peserta, agenda, dan status.", input_schema: S({ hari: num("jumlah hari ke depan, default 7"), proyek: str("id/nama proyek (opsional)") }) },
  { name: "buat_rapat", access: "create", description: "Menjadwalkan rapat. Otomatis muncul di Kalender, Jadwal harian, widget, dan notifikasi.", input_schema: S({ judul: str(""), tanggal: str("YYYY-MM-DD"), mulai: str("HH:MM"), selesai: str("HH:MM"), lokasi: str("ruang/alamat"), tautan: str("tautan Zoom/Meet/Teams"), peserta: strArr("id/email/nama anggota"), tamu: str("tamu luar (teks)"), agenda: strArr("butir agenda"), proyek: str("id/nama proyek"), deskripsi: str("") }, ["judul", "tanggal", "mulai", "selesai"]) },
  { name: "ubah_rapat", access: "update", description: "Mengubah rapat: geser waktu, ganti lokasi/tautan, tandai selesai/batal, atau isi keputusan.", input_schema: S({ id: str("id rapat dari daftar_rapat"), tanggal: str("YYYY-MM-DD"), mulai: str("HH:MM"), selesai: str("HH:MM"), lokasi: str(""), tautan: str(""), status: { type: "string", enum: ["terjadwal", "selesai", "batal"] }, keputusan: str("ringkasan keputusan rapat") }, ["id"]) },
  { name: "jadwal_kuliah", access: "read", description: "Jadwal kelas & ujian beberapa hari ke depan, tugas kuliah yang mendekati tenggat, dan rekap presensi per mata kuliah.", input_schema: S({ hari: num("jumlah hari ke depan, default 7") }) },
  { name: "catat_presensi", access: "update", description: "Mengisi presensi satu pertemuan kuliah.", input_schema: S({ mata_kuliah: str("kode atau nama mata kuliah"), tanggal: str("YYYY-MM-DD, default hari ini"), status: { type: "string", enum: ["hadir", "izin", "sakit", "alpa", "batal"] }, topik: str("topik pertemuan (opsional)") }, ["mata_kuliah", "status"]) },
  { name: "buat_catatan", access: "create", description: "Membuat halaman catatan (isi Markdown).", input_schema: S({ judul: str(""), isi: str("Markdown"), proyek: str("id/nama proyek") }, ["judul", "isi"]) },
  { name: "buat_reminder", access: "create", description: "Membuat reminder dengan notifikasi.", input_schema: S({ judul: str(""), waktu: str("YYYY-MM-DDTHH:MM"), ulang: { type: "string", enum: ["none", "daily", "weekdays", "weekly", "monthly"] }, proyek: str("id/nama proyek") }, ["judul", "waktu"]) },
  { name: "catat_kpi", access: "update", description: "Mengisi nilai KPI harian.", input_schema: S({ kpi: str("id atau nama KPI"), nilai: num(""), tanggal: str("YYYY-MM-DD, default hari ini") }, ["kpi", "nilai"]) },
  { name: "update_kr", access: "update", description: "Check-in nilai key result OKR.", input_schema: S({ kr: str("id atau judul key result"), nilai: num("nilai terbaru"), catatan: str("") }, ["kr", "nilai"]) },
];

export const toolDefs = (role: Role): ToolDef[] =>
  TOOLS.filter((t) => can(role, t.access === "read" ? "read" : t.access === "delete" ? "delete" : "create", { own: true, assigned: true })).map(({ access: _a, ...d }) => d);

// ---------- Pembantu ----------

const norm = (s: string) => s.trim().toLowerCase();
const fmtDate = (d?: string) => (d ? d : "-");
const validDate = (d: unknown): string | undefined => (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined);

function findProject(projects: Item<Project>[], q: unknown): Item<Project> | undefined {
  if (typeof q !== "string" || !q.trim()) return undefined;
  const n = norm(q);
  return projects.find((p) => p.id === q) ?? projects.find((p) => norm(p.name) === n) ?? projects.find((p) => norm(projectPath(projects, p.id)) === n) ?? projects.find((p) => norm(p.name).startsWith(n)) ?? projects.find((p) => norm(p.name).includes(n));
}

function findMembers(members: Item<Member>[], q: unknown, actor?: Item<Member>): string[] {
  const list = Array.isArray(q) ? q : typeof q === "string" ? [q] : [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    const n = norm(raw);
    const m = n === "saya" || n === "aku" ? actor ?? members.find((x) => x.isMe && !x.workspaceId) ?? members.find((x) => x.isMe) : members.find((x) => x.id === raw || norm(x.email) === n || norm(x.name) === n || norm(x.name).split(" ")[0] === n);
    if (m && !out.includes(m.id)) out.push(m.id);
  }
  return out;
}

const taskLine = (t: Item<Task>, projects: Item<Project>[], members: Item<Member>[]) =>
  [
    `[${shortCode(t.id)}] id=${t.id}`,
    t.title,
    `proyek=${projectPath(projects, t.projectId) || "Inbox"}`,
    `status=${projectOf(projects, t.projectId).statuses?.find((s) => s.id === t.status)?.label ?? t.status}${isTaskDone(t, projects) ? " (selesai)" : ""}`,
    t.due ? `tenggat=${t.due}${t.dueTime !== undefined ? " " + fmtMin(t.dueTime) : ""}` : "",
    t.priority ? `prioritas=${t.priority}` : "",
    t.estimate ? `estimasi=${t.estimate}m` : "",
    t.assignees?.length ? `ditugaskan=${t.assignees.map((a) => members.find((m) => m.id === a)?.name ?? a).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

function guard(ctx: ToolCtx, access: "create" | "update" | "delete", extra: { own?: boolean; assigned?: boolean } = {}): string | null {
  if (!can(ctx.role, access, extra)) return `Ditolak: peran ${ctx.role} tidak boleh ${access === "create" ? "menambah" : access === "update" ? "mengubah" : "menghapus"} data ini.`;
  if (access === "delete" && ctx.viaBot) return "Penghapusan tidak bisa lewat chat bot. Minta pengguna menghapus dari aplikasi Ruangku.";
  return null;
}

// ---------- Eksekusi ----------

export async function runTool(name: string, input: Record<string, unknown>, ctx: ToolCtx, confirmed = false): Promise<ToolOut> {
  const def = TOOLS.find((t) => t.name === name);
  if (!def) return { content: `Alat "${name}" tidak dikenal.`, is_error: true };
  try {
    const [projects, members] = await Promise.all([projectsAll(), load<Member>("member")]);
    const today = dateKey();

    // Mutasi yang perlu disetujui dulu.
    if (def.access !== "read" && !confirmed && (def.access === "delete" || !ctx.autoApply)) {
      const label = await describe(name, input, projects);
      const deny = guard(ctx, def.access, { own: true, assigned: true });
      if (deny) return { content: deny, is_error: true };
      return {
        content: `Menunggu persetujuan pengguna: ${label}. Sampaikan bahwa pengguna perlu menekan tombol "Setujui" di bawah pesan.`,
        pending: { id: newId(), tool: name, input, label, kind: def.access },
      };
    }

    switch (name) {
      case "ringkasan_hari": {
        const d = validDate(input.tanggal) ?? today;
        const tasks = await load<Task>("task");
        const blocks = (await load<TimeBlock>("timeblock")).filter((b) => b.date === d).sort((a, b) => a.start - b.start);
        const open = tasks.filter((t) => !isTaskDone(t, projects) && !t.parentId);
        const due = open.filter((t) => t.due && t.due <= d).sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
        const kpis = (await load<Kpi>("kpi")).filter((k) => !k.archived);
        const entries = (await load<KpiEntry>("kpientry")).filter((e) => e.date === d);
        const rem = (await load<Reminder>("reminder")).filter((r) => !r.done && dateKey(r.dueAt) === d);
        const planned = blocks.filter((b) => !b.tracked).reduce((s, b) => s + b.end - b.start, 0);
        return {
          content: [
            `Tanggal ${d} (hari ini ${today}).`,
            `Tugas jatuh tempo/terlambat (${due.length}):`,
            ...due.slice(0, 30).map((t) => "- " + taskLine(t, projects, members)),
            `Blok jadwal (${blocks.length}, total rencana ${fmtDuration(planned)}):`,
            ...blocks.map((b) => `- id=${b.id} ${fmtMin(b.start)}-${fmtMin(b.end)} ${b.title}${b.tracked ? " (tercatat timer)" : ""}${b.done ? " (selesai)" : ""}${blockProject(b, tasks) ? ` [${projectPath(projects, blockProject(b, tasks))}]` : ""}`),
            `Reminder: ${rem.map((r) => `${new Date(r.dueAt).toTimeString().slice(0, 5)} ${r.title}`).join("; ") || "-"}`,
            ...(await bandsFor(d).then((b) => (b.length ? [`Waktu sholat dilindungi (jangan dijadwalkan): ${bandsText(b)}`] : []))),
            `KPI: ${kpis.map((k) => { const e = entries.find((x) => x.kpiId === k.id); return `${k.name} ${e ? `${e.value}/${k.target}${kpiMet(k, e.value) ? " ✓" : ""}` : "belum diisi"}`; }).join("; ") || "-"}`,
            `Tugas terbuka tanpa tenggat: ${open.filter((t) => !t.due).length}.`,
          ].join("\n"),
        };
      }
      case "daftar_proyek": {
        const tasks = await load<Task>("task");
        const tree = flatTree(projects.filter((p) => p.id !== "inbox" && !p.archived));
        return {
          content: tree
            .map(({ p, depth }) => {
              const ids = subtreeIds(projects, p.id);
              const ts = tasks.filter((t) => ids.has(t.projectId) && !t.parentId);
              const done = ts.filter((t) => isTaskDone(t, projects)).length;
              return `${"  ".repeat(depth)}- id=${p.id} ${p.name}${p.start || p.end ? ` (${fmtDate(p.start)} s/d ${fmtDate(p.end)})` : ""} · ${done}/${ts.length} tugas selesai${p.statuses?.length ? ` · status: ${p.statuses.map((s) => s.id).join("/")}` : ""}`;
            })
            .join("\n") || "Belum ada proyek.",
        };
      }
      case "daftar_tugas":
      case "cari": {
        const tasks = await load<Task>("task");
        const q = typeof input.kata === "string" ? norm(input.kata) : "";
        let list = tasks;
        if (name === "daftar_tugas") {
          const p = findProject(projects, input.proyek);
          if (input.proyek && !p) return { content: `Proyek "${input.proyek}" tidak ditemukan. Panggil daftar_proyek.`, is_error: true };
          const ids = p ? subtreeIds(projects, p.id) : null;
          const st = (input.status as string) || "terbuka";
          const until = validDate(input.tenggat_sampai);
          const who = input.ditugaskan_ke ? findMembers(members, input.ditugaskan_ke, ctx.actor)[0] : undefined;
          list = list.filter((t) => (!ids || ids.has(t.projectId)) && (st === "semua" || (st === "selesai") === isTaskDone(t, projects)) && (!until || (t.due && t.due <= until)) && (!who || (t.assignees ?? []).includes(who)) && (!q || norm(t.title).includes(q)));
        } else list = list.filter((t) => norm(`${t.title} ${t.description ?? ""}`).includes(q));
        list = list.sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || priorityRank(a.priority) - priorityRank(b.priority)).slice(0, Number(input.batas) || 25);
        const out = list.map((t) => "- " + taskLine(t, projects, members));
        if (name === "cari") {
          const notes = (await load<Note>("note")).filter((n) => norm(`${n.title} ${n.body}`).includes(q)).slice(0, 10);
          out.push(...notes.map((n) => `- catatan id=${n.id} "${n.title}"`));
          out.push(...projects.filter((p) => norm(p.name).includes(q)).map((p) => `- proyek id=${p.id} ${projectPath(projects, p.id)}`));
        }
        return { content: out.join("\n") || "Tidak ada hasil." };
      }
      case "jadwal_hari": {
        const d = validDate(input.tanggal) ?? today;
        const tasks = await load<Task>("task");
        const blocks = (await load<TimeBlock>("timeblock")).filter((b) => b.date === d).sort((a, b) => a.start - b.start);
        return { content: blocks.map((b) => `- id=${b.id} ${fmtMin(b.start)}-${fmtMin(b.end)} ${b.title}${blockProject(b, tasks) ? ` [${projectPath(projects, blockProject(b, tasks))}]` : ""}`).join("\n") || `Belum ada blok pada ${d}.` };
      }
      case "statistik": {
        const days = input.periode === "bulan" ? 30 : 7;
        const from = dateKey(addDays(parseDateKey(today), -days + 1));
        const tasks = await load<Task>("task");
        const p = findProject(projects, input.proyek);
        const ids = p ? subtreeIds(projects, p.id) : null;
        const blocks = (await load<TimeBlock>("timeblock")).filter((b) => b.tracked && b.date >= from && b.date <= today);
        const byRoot = new Map<string, number>();
        for (const b of blocks) {
          const pid = blockProject(b, tasks);
          if (ids && !(pid && ids.has(pid))) continue;
          const label = pid ? projectPath(projects, pid).split(" › ")[ids ? 1 : 0] ?? projectPath(projects, pid) : "Tanpa proyek";
          byRoot.set(label, (byRoot.get(label) ?? 0) + b.end - b.start);
        }
        const done = tasks.filter((t) => t.completedAt && dateKey(t.completedAt) >= from && (!ids || ids.has(t.projectId)));
        const kpis = (await load<Kpi>("kpi")).filter((k) => !k.archived && (!ids || (k.projectId && ids.has(k.projectId))));
        const entries = (await load<KpiEntry>("kpientry")).filter((e) => e.date >= from && kpis.some((k) => k.id === e.kpiId));
        const met = entries.filter((e) => kpiMet(kpis.find((k) => k.id === e.kpiId)!, e.value)).length;
        const objs = (await load<Objective>("objective")).filter((o) => !o.archived && (!ids || (o.projectId && ids.has(o.projectId))));
        const krs = await load<KeyResult>("keyresult");
        return {
          content: [
            `Periode ${from} s/d ${today}${p ? `, proyek ${p.name}` : ""}.`,
            `Waktu tercatat: ${[...byRoot.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${fmtDuration(v)}`).join("; ") || "belum ada"}`,
            `Tugas selesai: ${done.length}`,
            `KPI tercapai: ${entries.length ? Math.round((met / entries.length) * 100) : 0}% dari ${entries.length} isian`,
            `OKR: ${objs.map((o) => { const ks = krs.filter((k) => k.objectiveId === o.id); return `${o.title} ${ks.length ? Math.round((ks.reduce((s, k) => s + krProgress(k), 0) / ks.length) * 100) : 0}%`; }).join("; ") || "-"}`,
          ].join("\n"),
        };
      }
      case "daftar_anggota":
        return { content: members.map((m) => `- id=${m.id} ${m.name}${m.isMe ? " (pengguna aplikasi)" : ""} · ${m.role} · ${m.email}${m.wa ? ` · WA ${m.wa}` : ""}${m.telegram ? ` · TG @${m.telegram}` : ""}`).join("\n") || "Belum ada anggota." };

      case "buat_tugas": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const p = findProject(projects, input.proyek);
        if (input.proyek && !p) return { content: `Proyek "${input.proyek}" tidak ditemukan. Panggil daftar_proyek lalu ulangi dengan id yang benar.`, is_error: true };
        const due = validDate(input.tenggat);
        const t = await createTask(
          {
            title: String(input.judul).trim(),
            projectId: p?.id,
            due,
            start: validDate(input.mulai),
            dueTime: typeof input.jam === "string" ? parseHHMM(input.jam) ?? undefined : undefined,
            priority: input.prioritas as TaskPriority | undefined,
            estimate: typeof input.estimasi_menit === "number" ? Math.round(input.estimasi_menit) : undefined,
            tags: Array.isArray(input.tag) ? (input.tag as string[]).map((x) => x.replace(/^#/, "")) : [],
            description: typeof input.deskripsi === "string" ? input.deskripsi : undefined,
            assignees: input.ditugaskan_ke ? findMembers(members, input.ditugaskan_ke, ctx.actor) : ctx.viaBot && ctx.actor ? [ctx.actor.id] : undefined,
            parentId: typeof input.induk === "string" ? input.induk : undefined,
            createdBy: ctx.actor?.id,
          } as Partial<Task> & { title: string },
          ctx.actor?.id,
        );
        return { content: `Tugas dibuat: [${shortCode(t.id)}] id=${t.id} "${t.title}" di ${projectPath(projects, t.projectId) || "Inbox"}${due ? `, tenggat ${due}` : ""}.`, action: { kind: "create", label: `Membuat tugas "${t.title}"`, ref: { type: "task", id: t.id } } };
      }
      case "ubah_tugas": {
        const tasks = await load<Task>("task");
        const cur = tasks.find((t) => t.id === input.id || shortCode(t.id) === String(input.id).replace(/^#/, "").toUpperCase());
        if (!cur) return { content: `Tugas ${input.id} tidak ditemukan.`, is_error: true };
        const deny = guard(ctx, "update", { own: !!ctx.actor && cur.createdBy === ctx.actor.id, assigned: !!ctx.actor && (cur.assignees ?? []).includes(ctx.actor.id) });
        if (deny) return { content: deny, is_error: true };
        const patch: Partial<Task> & { status?: string } = {};
        if (typeof input.judul === "string" && input.judul.trim()) patch.title = input.judul.trim();
        if (typeof input.status === "string" && input.status) patch.status = input.status;
        if (input.tenggat !== undefined) patch.due = validDate(input.tenggat);
        if (typeof input.jam === "string") patch.dueTime = parseHHMM(input.jam) ?? undefined;
        if (input.prioritas) patch.priority = input.prioritas as TaskPriority;
        if (typeof input.estimasi_menit === "number") patch.estimate = Math.round(input.estimasi_menit);
        if (typeof input.deskripsi === "string") patch.description = input.deskripsi;
        if (input.proyek) {
          const p = findProject(projects, input.proyek);
          if (!p) return { content: `Proyek "${input.proyek}" tidak ditemukan.`, is_error: true };
          patch.projectId = p.id;
        }
        if (input.ditugaskan_ke) patch.assignees = findMembers(members, input.ditugaskan_ke, ctx.actor);
        const t = await updateTask(cur.id, patch, ctx.actor?.id);
        return { content: `Tugas diperbarui: ${taskLine(t!, projects, members)}`, action: { kind: "update", label: `${patch.status === "selesai" ? "Menyelesaikan" : "Mengubah"} tugas "${t!.title}"`, ref: { type: "task", id: cur.id } } };
      }
      case "hapus_tugas": {
        const tasks = await load<Task>("task");
        const cur = tasks.find((t) => t.id === input.id || shortCode(t.id) === String(input.id).replace(/^#/, "").toUpperCase());
        if (!cur) return { content: `Tugas ${input.id} tidak ditemukan.`, is_error: true };
        const deny = guard(ctx, "delete", { own: !!ctx.actor && cur.createdBy === ctx.actor.id });
        if (deny) return { content: deny, is_error: true };
        const n = await removeTask(cur.id);
        return { content: `Dihapus: "${cur.title}"${n > 1 ? ` beserta ${n - 1} subtugas` : ""}.`, action: { kind: "delete", label: `Menghapus tugas "${cur.title}"` } };
      }
      case "buat_proyek": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const parent = findProject(projects, input.induk);
        const id = newId();
        const data: Project = {
          name: String(input.nama).trim(),
          color: (input.warna as Project["color"]) ?? parent?.color ?? "nila",
          parentId: parent?.id,
          start: validDate(input.mulai),
          end: validDate(input.selesai),
          description: typeof input.deskripsi === "string" ? input.deskripsi : undefined,
          statuses: parent?.statuses ?? [
            { id: "todo", label: "Belum mulai", color: "abu" },
            { id: "doing", label: "Dikerjakan", color: "nila" },
            { id: "review", label: "Ditinjau", color: "kunyit" },
            { id: "done", label: "Selesai", color: "daun", done: true },
          ],
        };
        await api.save(id, "project", data);
        return { content: `Proyek dibuat: id=${id} ${parent ? `${parent.name} › ` : ""}${data.name}.`, action: { kind: "create", label: `Membuat ${parent ? "subproyek" : "proyek"} "${data.name}"`, ref: { type: "project", id } } };
      }
      case "buat_blok": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const d = validDate(input.tanggal);
        const s = parseHHMM(String(input.mulai ?? ""));
        const e = parseHHMM(String(input.selesai ?? ""));
        if (!d || s === null || e === null || e <= s) return { content: "Tanggal atau jam tidak valid. Pakai YYYY-MM-DD dan HH:MM, selesai setelah mulai.", is_error: true };
        const blocks = (await load<TimeBlock>("timeblock")).filter((b) => b.date === d && !b.tracked);
        const clash = blocks.find((b) => s < b.end && b.start < e);
        const p = findProject(projects, input.proyek);
        const tasks = typeof input.tugas_id === "string" ? await load<Task>("task") : [];
        const task = tasks.find((t) => t.id === input.tugas_id);
        const bands = await bandsFor(d);
        const pray = conflicts({ start: s, end: e }, bands);
        const alt = pray.length ? nudge({ start: s, end: e }, bands) : null;
        const prayNote = pray.length ? ` Perhatian: menimpa waktu ${pray.map((b) => `${b.name} ${fmtMin(b.start)}-${fmtMin(b.end)}`).join(", ")}${alt ? `; sarankan geser ke ${fmtMin(alt.start)}-${fmtMin(alt.end)} (pakai ubah_blok bila pengguna setuju)` : ""}.` : "";
        const id = newId();
        await api.save(id, "timeblock", { date: d, start: s, end: e, title: String(input.judul), color: (p ?? projectOf(projects, task?.projectId ?? "inbox")).color, projectId: p?.id ?? (task && task.projectId !== "inbox" ? task.projectId : undefined), taskId: task?.id });
        return { content: `Blok dibuat: id=${id} ${d} ${fmtMin(s)}-${fmtMin(e)} ${input.judul}.${clash ? ` Perhatian: bertabrakan dengan "${clash.title}" (${fmtMin(clash.start)}-${fmtMin(clash.end)}).` : ""}${prayNote}`, action: { kind: "create", label: `Menjadwalkan "${input.judul}" ${fmtMin(s)}–${fmtMin(e)}`, ref: { type: "block", id } } };
      }
      case "ubah_blok": {
        const deny = guard(ctx, "update");
        if (deny) return { content: deny, is_error: true };
        const b = (await load<TimeBlock>("timeblock")).find((x) => x.id === input.id);
        if (!b) return { content: "Blok tidak ditemukan. Ambil id dari jadwal_hari.", is_error: true };
        const d = input.tanggal ? validDate(input.tanggal) : b.date;
        const s = input.mulai ? parseHHMM(String(input.mulai)) : b.start;
        const e = input.selesai ? parseHHMM(String(input.selesai)) : input.mulai && s !== null ? s + (b.end - b.start) : b.end;
        if (!d || s === null || e === null || e <= s || e > 1440) return { content: "Tanggal atau jam tidak valid.", is_error: true };
        const title = typeof input.judul === "string" && input.judul.trim() ? input.judul.trim() : b.title;
        await api.save(b.id, "timeblock", { ...strip(b), date: d, start: s, end: e, title });
        const pray = conflicts({ start: s, end: e }, await bandsFor(d));
        return { content: `Blok diubah: ${d} ${fmtMin(s)}-${fmtMin(e)} ${title}.${pray.length ? ` Masih menimpa ${pray.map((x) => x.name).join(", ")}.` : ""}`, action: { kind: "update", label: `Menggeser "${title}" ke ${fmtMin(s)}–${fmtMin(e)}`, ref: { type: "block", id: b.id } } };
      }
      case "catat_kas": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const jenis: TxType = input.jenis === "keluar" ? "keluar" : input.jenis === "transfer" ? "transfer" : "masuk";
        const jumlah = typeof input.jumlah === "number" ? input.jumlah : parseField({ id: "x", name: "x", type: "rupiah" }, String(input.jumlah ?? ""));
        if (typeof jumlah !== "number" || jumlah <= 0) return { content: "Jumlah tidak valid.", is_error: true };
        const accounts = (await load<Account>(ACCOUNT_KIND)).filter((a) => !a.archived);
        const findAcc = (q: unknown) => (typeof q === "string" && q.trim() ? accounts.find((a) => a.id === q) ?? accounts.find((a) => norm(a.name) === norm(q)) ?? accounts.find((a) => norm(a.name).includes(norm(q))) : undefined);
        const acc = findAcc(input.akun);
        const to = findAcc(input.ke_akun);
        if (input.akun && !acc) return { content: `Akun "${input.akun}" tidak ditemukan. Akun yang ada: ${accounts.map((a) => a.name).join(", ") || "-"}.`, is_error: true };
        if (jenis === "transfer" && (!acc || !to || acc.id === to.id)) return { content: "Transfer butuh akun asal dan ke_akun yang berbeda.", is_error: true };
        const ket = typeof input.keterangan === "string" && input.keterangan ? input.keterangan : undefined;
        const kategori = jenis === "transfer" ? "Transfer" : typeof input.kategori === "string" && input.kategori ? input.kategori : guessCategory(`${ket ?? ""} ${input.pihak ?? ""}`, jenis);
        const titipan = /^(infaq|sedekah|zakat|wakaf|donasi|penyaluran)/i.test(kategori);
        const p = findProject(projects, input.proyek) ?? (titipan ? projects.find((x) => /infaq|zakat|donasi/i.test(x.name) && !x.parentId) : undefined) ?? (acc?.projectId ? projects.find((x) => x.id === acc.projectId) : undefined);
        const d = validDate(input.tanggal) ?? today;
        const entry: LedgerEntry = { date: d, type: jenis, amount: jumlah, category: kategori, party: typeof input.pihak === "string" && input.pihak ? input.pihak : undefined, description: ket, method: (typeof input.metode === "string" ? input.metode : acc?.type === "tunai" ? "tunai" : acc?.type === "ewallet" ? "ewallet" : "transfer") as LedgerEntry["method"], projectId: p?.id, accountId: acc?.id, toAccountId: to?.id };
        const id = newId();
        await api.save(id, LEDGER_KIND, entry);
        const what = jenis === "masuk" ? "pemasukan" : jenis === "keluar" ? "pengeluaran" : "transfer";
        return { content: `Tercatat ${what} ${rupiah(jumlah)} · ${kategori}${entry.party ? ` (${entry.party})` : ""} tanggal ${d}${acc ? ` · ${acc.name}${to ? ` → ${to.name}` : ""}` : ""}${p ? ` · proyek ${p.name}` : " · pribadi"}.`, action: { kind: "create", label: `Mencatat ${what} ${rupiah(jumlah)}`, ref: { type: "ledger", id } } };
      }
      case "saldo_kas": {
        const p = findProject(projects, input.proyek);
        const ids = p ? subtreeIds(projects, p.id) : null;
        const match = (pid: string | undefined) => !ids || (!!pid && ids.has(pid));
        const [accounts, entries, recurring, budgets] = await Promise.all([load<Account>(ACCOUNT_KIND), load<LedgerEntry>(LEDGER_KIND), load<Recurring>(RECURRING_KIND), load<Budget>(BUDGET_KIND)]);
        const ym = today.slice(0, 7);
        const top = byParty(entries.filter((x) => match(x.projectId) && x.date.startsWith(ym) && /^(infaq|sedekah|zakat|wakaf|donasi)/i.test(x.category))).slice(0, 5);
        return { content: [`${p ? `Proyek ${p.name}. ` : ""}${financeSummaryText({ accounts, entries, recurring, budgets, today, match })}`, top.length ? `Donatur bulan ini: ${top.map((t) => `${t.party} ${rupiah(t.total)}`).join("; ")}` : ""].filter(Boolean).join("\n") };
      }
      case "daftar_transaksi": {
        const ym = typeof input.bulan === "string" && /^\d{4}-\d{2}$/.test(input.bulan) ? input.bulan : today.slice(0, 7);
        const accounts = await load<Account>(ACCOUNT_KIND);
        const acc = typeof input.akun === "string" && input.akun ? accounts.find((a) => a.id === input.akun || norm(a.name).includes(norm(String(input.akun)))) : undefined;
        const personal = typeof input.proyek === "string" && norm(input.proyek) === "pribadi";
        const p = personal ? undefined : findProject(projects, input.proyek);
        const ids = p ? subtreeIds(projects, p.id) : null;
        const kata = typeof input.kata === "string" ? norm(input.kata) : "";
        const list = (await load<LedgerEntry>(LEDGER_KIND))
          .filter((e) => e.date.startsWith(ym))
          .filter((e) => !input.jenis || e.type === input.jenis)
          .filter((e) => !input.kategori || norm(e.category) === norm(String(input.kategori)))
          .filter((e) => !acc || e.accountId === acc.id || e.toAccountId === acc.id)
          .filter((e) => (personal ? !e.projectId : !ids || (!!e.projectId && ids.has(e.projectId))))
          .filter((e) => !kata || norm(`${e.party ?? ""} ${e.description ?? ""} ${e.category}`).includes(kata))
          .sort((a, b) => b.date.localeCompare(a.date));
        const n = Math.min(Number(input.batas) || 30, 100);
        const accName = (id?: string) => accounts.find((a) => a.id === id)?.name;
        const total = (t: string) => list.filter((e) => e.type === t).reduce((s, e) => s + e.amount, 0);
        return {
          content: list.length
            ? [`${list.length} transaksi ${ym} (masuk ${rupiah(total("masuk"))}, keluar ${rupiah(total("keluar"))}):`, ...list.slice(0, n).map((e) => `- id=${e.id} ${e.date} ${e.type} ${rupiah(e.amount)} · ${e.category}${e.party ? ` · ${e.party}` : ""}${e.description ? ` · ${e.description}` : ""}${e.accountId ? ` · ${accName(e.accountId) ?? "?"}${e.toAccountId ? ` → ${accName(e.toAccountId) ?? "?"}` : ""}` : ""}${e.projectId ? ` · [${projectPath(projects, e.projectId)}]` : ""}`)].join("\n")
            : `Tidak ada transaksi ${ym} dengan saringan itu.`,
        };
      }
      case "daftar_rapat": {
        const days = Math.min(Math.max(Number(input.hari) || 7, 1), 60);
        const last = dateKey(addDays(parseDateKey(today), days));
        const first = dateKey(addDays(parseDateKey(today), -3));
        const p = findProject(projects, input.proyek);
        const ids = p ? subtreeIds(projects, p.id) : null;
        const list = (await load<Meeting>(MEETING_KIND)).filter((m) => m.date >= first && m.date <= last && (!ids || (!!m.projectId && ids.has(m.projectId)))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
        const who = (ids2: string[]) => ids2.map((x) => members.find((m) => m.id === x)?.name ?? x).join(", ");
        return {
          content: list.length
            ? list.map((m) => `- id=${m.id} ${meetingWhen(m)} "${m.title}" status=${m.status}${m.location ? ` · lokasi ${m.location}` : ""}${m.link ? ` · tautan ${m.link}` : ""}${m.attendees.length ? ` · peserta ${who(m.attendees)}` : ""}${m.agenda.length ? ` · agenda: ${m.agenda.map((a) => a.text).join("; ")}` : ""}${m.projectId ? ` · [${projectPath(projects, m.projectId)}]` : ""}${m.seriesId ? " · berulang" : ""}`).join("\n")
            : `Tidak ada rapat dari ${first} sampai ${last}.`,
        };
      }
      case "buat_rapat": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const d = validDate(input.tanggal);
        const s = parseHHMM(String(input.mulai ?? ""));
        const e = parseHHMM(String(input.selesai ?? ""));
        if (!d || s === null || e === null || e <= s) return { content: "Tanggal atau jam tidak valid.", is_error: true };
        const p = findProject(projects, input.proyek);
        const people = findMembers(members, input.peserta, ctx.actor);
        const me = ctx.actor?.id ?? members.find((m) => m.isMe)?.id;
        const agenda = (Array.isArray(input.agenda) ? input.agenda : []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((text) => ({ id: newId(), text: text.trim(), done: false }));
        const id = newId();
        const mt: Meeting = { title: String(input.judul).trim(), date: d, start: s, end: e, projectId: p?.id, location: typeof input.lokasi === "string" && input.lokasi ? input.lokasi : undefined, link: typeof input.tautan === "string" && input.tautan ? input.tautan : undefined, attendees: [...new Set([...(me ? [me] : []), ...people])], guests: typeof input.tamu === "string" && input.tamu ? input.tamu : undefined, description: typeof input.deskripsi === "string" && input.deskripsi ? input.deskripsi : undefined, agenda, actions: [], status: "terjadwal", createdAt: Date.now() };
        await api.save(id, MEETING_KIND, mt);
        const pray = conflicts({ start: s, end: e }, await bandsFor(d));
        return { content: `Rapat dibuat: id=${id} "${mt.title}" ${meetingWhen(mt)}${mt.location ? ` di ${mt.location}` : ""}.${pray.length ? ` Perhatian: menimpa waktu ${pray.map((x) => x.name).join(", ")}.` : ""} Undangan bisa dikirim dari menu Rapat.`, action: { kind: "create", label: `Menjadwalkan rapat "${mt.title}"`, ref: { type: "meeting", id } } };
      }
      case "ubah_rapat": {
        const deny = guard(ctx, "update", { own: true });
        if (deny) return { content: deny, is_error: true };
        const m = (await load<Meeting>(MEETING_KIND)).find((x) => x.id === input.id);
        if (!m) return { content: "Rapat tidak ditemukan. Ambil id dari daftar_rapat.", is_error: true };
        const d = input.tanggal ? validDate(input.tanggal) : m.date;
        const s = input.mulai ? parseHHMM(String(input.mulai)) : m.start;
        const e = input.selesai ? parseHHMM(String(input.selesai)) : input.mulai && s !== null ? s + (m.end - m.start) : m.end;
        if (!d || s === null || e === null || e <= s) return { content: "Tanggal atau jam tidak valid.", is_error: true };
        const status = input.status === "selesai" || input.status === "batal" || input.status === "terjadwal" ? input.status : m.status;
        const moved = d !== m.date || s !== m.start || e !== m.end;
        await api.save(m.id, MEETING_KIND, { ...strip(m), date: d, start: s, end: e, status, location: typeof input.lokasi === "string" ? input.lokasi || undefined : m.location, link: typeof input.tautan === "string" ? input.tautan || undefined : m.link, decisions: typeof input.keputusan === "string" ? input.keputusan : m.decisions, detached: m.seriesId && moved ? true : m.detached });
        return { content: `Rapat "${m.title}" diperbarui: ${meetingWhen({ date: d, start: s, end: e })}, status ${status}.`, action: { kind: "update", label: `Mengubah rapat "${m.title}"`, ref: { type: "meeting", id: m.id } } };
      }
      case "jadwal_kuliah": {
        const days = Math.min(Math.max(Number(input.hari) || 7, 1), 60);
        const last = dateKey(addDays(parseDateKey(today), days));
        const [blocks, courses, tasks] = await Promise.all([load<TimeBlock>("timeblock"), load<Course>(COURSE_KIND), load<Task>("task")]);
        const live = courses.filter((c) => !c.archived && c.end >= today);
        if (!live.length) return { content: "Belum ada mata kuliah aktif semester ini." };
        const name = (id?: string) => {
          const c = courses.find((x) => x.id === id);
          return c ? courseLabel(c) : "?";
        };
        const cls = blocks.filter((b) => b.courseId && b.date >= today && b.date <= last).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
        const projIds = new Set(live.map((c) => c.projectId).filter(Boolean) as string[]);
        const due = tasks.filter((t) => !isTaskDone(t, projects) && !t.parentId && (projIds.has(t.projectId) || t.tags.includes("kuliah")) && t.due && t.due <= last).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""));
        return {
          content: [
            `Kelas & ujian ${today} s/d ${last}:`,
            ...(cls.length ? cls.map((b) => `- ${b.date} ${fmtMin(b.start)}-${fmtMin(b.end)} ${b.sessionId?.startsWith("ujian:") ? "UJIAN " : ""}${b.title}${b.location ? ` · ${b.location}` : ""}${b.attendance ? ` · ${ATTENDANCE_LABEL[b.attendance]}` : ""}`) : ["- (tidak ada)"]),
            `Tugas kuliah s/d ${last}:`,
            ...(due.length ? due.slice(0, 15).map((t) => "- " + taskLine(t, projects, members)) : ["- (tidak ada)"]),
            "Presensi:",
            ...live.map((c) => {
              const st = attendanceStats(blocks, c.id, today);
              return `- ${name(c.id)}: hadir ${st.hadir}/${st.held}${st.percent !== null ? ` (${st.percent}%)` : ""}${st.percent !== null && st.percent < c.minAttendance && st.held >= 3 ? ` ⚠ di bawah minimal ${c.minAttendance}%` : ""}`;
            }),
          ].join("\n"),
        };
      }
      case "catat_presensi": {
        const deny = guard(ctx, "update", { own: true });
        if (deny) return { content: deny, is_error: true };
        const q = norm(String(input.mata_kuliah ?? ""));
        const courses = await load<Course>(COURSE_KIND);
        const c = courses.find((x) => x.id === input.mata_kuliah) ?? courses.find((x) => norm(x.code ?? "") === q) ?? courses.find((x) => norm(x.name).includes(q) || norm(courseLabel(x)).includes(q));
        if (!c) return { content: `Mata kuliah "${input.mata_kuliah}" tidak ditemukan. Yang ada: ${courses.filter((x) => !x.archived).map(courseLabel).join(", ")}`, is_error: true };
        const d = validDate(input.tanggal) ?? today;
        const b = (await load<TimeBlock>("timeblock")).find((x) => x.courseId === c.id && x.date === d && !x.sessionId?.startsWith("ujian:"));
        if (!b) return { content: `Tidak ada pertemuan ${courseLabel(c)} pada ${d}.`, is_error: true };
        const status = String(input.status) as Attendance;
        if (!(status in ATTENDANCE_LABEL)) return { content: "Status presensi tidak valid.", is_error: true };
        await api.save(b.id, "timeblock", { ...strip(b), attendance: status, topic: typeof input.topik === "string" && input.topik ? input.topik : b.topic });
        return { content: `Presensi ${courseLabel(c)} ${d}: ${ATTENDANCE_LABEL[status]}.`, action: { kind: "update", label: `Presensi ${courseLabel(c)}: ${ATTENDANCE_LABEL[status]}`, ref: { type: "course", id: c.id } } };
      }
      case "hapus_blok": {
        const deny = guard(ctx, "delete");
        if (deny) return { content: deny, is_error: true };
        const b = (await load<TimeBlock>("timeblock")).find((x) => x.id === input.id);
        if (!b) return { content: `Blok ${input.id} tidak ditemukan.`, is_error: true };
        const r = await removeBlockSmart(b);
        return { content: REMOVE_MESSAGE[r.kind](b.title) + ".", action: { kind: "delete", label: REMOVE_MESSAGE[r.kind](b.title) } };
      }
      case "buat_catatan": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const p = findProject(projects, input.proyek);
        const id = newId();
        await api.save(id, "note", { title: String(input.judul), body: String(input.isi), tags: ["asisten"], projectId: p?.id });
        return { content: `Catatan dibuat: id=${id} "${input.judul}".`, action: { kind: "create", label: `Membuat catatan "${input.judul}"`, ref: { type: "note", id } } };
      }
      case "buat_reminder": {
        const deny = guard(ctx, "create");
        if (deny) return { content: deny, is_error: true };
        const at = new Date(String(input.waktu)).getTime();
        if (Number.isNaN(at)) return { content: "Waktu tidak valid. Pakai YYYY-MM-DDTHH:MM.", is_error: true };
        const p = findProject(projects, input.proyek);
        const id = newId();
        await api.save(id, "reminder", { title: String(input.judul), dueAt: at, repeat: (input.ulang as string) || "none", done: false, priority: "sedang", projectId: p?.id });
        return { content: `Reminder dibuat: "${input.judul}" pada ${input.waktu}.`, action: { kind: "create", label: `Membuat reminder "${input.judul}"`, ref: { type: "reminder", id } } };
      }
      case "catat_kpi": {
        const deny = guard(ctx, "update", { own: true });
        if (deny) return { content: deny, is_error: true };
        const kpis = await load<Kpi>("kpi");
        const k = kpis.find((x) => x.id === input.kpi) ?? kpis.find((x) => norm(x.name) === norm(String(input.kpi))) ?? kpis.find((x) => norm(x.name).includes(norm(String(input.kpi))));
        if (!k) return { content: `KPI "${input.kpi}" tidak ditemukan. KPI yang ada: ${kpis.map((x) => x.name).join(", ")}`, is_error: true };
        const d = validDate(input.tanggal) ?? today;
        await api.save(`${k.id}:${d}`, "kpientry", { kpiId: k.id, date: d, value: Number(input.nilai) });
        return { content: `KPI ${k.name} ${d} = ${input.nilai} (target ${k.target}${kpiMet(k, Number(input.nilai)) ? ", tercapai" : ""}).`, action: { kind: "update", label: `Mengisi KPI ${k.name}: ${input.nilai}`, ref: { type: "kpi", id: k.id } } };
      }
      case "update_kr": {
        const deny = guard(ctx, "update", { own: true });
        if (deny) return { content: deny, is_error: true };
        const krs = await load<KeyResult>("keyresult");
        const kr = krs.find((x) => x.id === input.kr) ?? krs.find((x) => norm(x.title).includes(norm(String(input.kr))));
        if (!kr) return { content: `Key result "${input.kr}" tidak ditemukan.`, is_error: true };
        const value = Number(input.nilai);
        await api.save(kr.id, "keyresult", { ...strip(kr), current: value, history: [...(kr.history ?? []), { at: Date.now(), value, note: typeof input.catatan === "string" ? input.catatan : "Check-in lewat asisten" }].slice(-60) });
        return { content: `Key result "${kr.title}" sekarang ${value} dari target ${kr.target}.`, action: { kind: "update", label: `Check-in KR "${kr.title}": ${value}`, ref: { type: "kr", id: kr.id } } };
      }
    }
    return { content: "Alat belum diimplementasikan.", is_error: true };
  } catch (e) {
    return { content: `Galat: ${e instanceof Error ? e.message : String(e)}`, is_error: true };
  }
}

/** Kalimat ringkas untuk kartu persetujuan. */
async function describe(name: string, input: Record<string, unknown>, projects: Item<Project>[]): Promise<string> {
  const p = findProject(projects, input.proyek);
  switch (name) {
    case "buat_tugas":
      return `Buat tugas "${input.judul}"${p ? ` di ${p.name}` : ""}${input.tenggat ? `, tenggat ${input.tenggat}` : ""}`;
    case "ubah_tugas": {
      const t = (await load<Task>("task")).find((x) => x.id === input.id);
      return `Ubah tugas "${t?.title ?? input.id}"${input.status ? ` → ${input.status}` : ""}${input.tenggat ? `, tenggat ${input.tenggat}` : ""}`;
    }
    case "hapus_tugas": {
      const t = (await load<Task>("task")).find((x) => x.id === input.id);
      return `Hapus tugas "${t?.title ?? input.id}"`;
    }
    case "hapus_blok": {
      const b = (await load<TimeBlock>("timeblock")).find((x) => x.id === input.id);
      return `Hapus blok "${b?.title ?? input.id}"`;
    }
    case "buat_blok":
      return `Jadwalkan "${input.judul}" ${input.tanggal} ${input.mulai}–${input.selesai}`;
    case "buat_proyek":
      return `Buat proyek "${input.nama}"`;
    case "buat_catatan":
      return `Buat catatan "${input.judul}"`;
    case "buat_reminder":
      return `Buat reminder "${input.judul}" ${input.waktu}`;
    case "catat_kpi":
      return `Isi KPI ${input.kpi} = ${input.nilai}`;
    case "update_kr":
      return `Check-in KR ${input.kr} = ${input.nilai}`;
    case "catat_kas":
      return `Catat ${input.jenis} ${typeof input.jumlah === "number" ? rupiah(input.jumlah) : input.jumlah}${input.keterangan ? ` · ${input.keterangan}` : ""}${input.akun ? ` · ${input.akun}` : ""}${p ? ` · ${p.name}` : ""}`;
    case "buat_rapat":
      return `Jadwalkan rapat "${input.judul}" ${input.tanggal} ${input.mulai}–${input.selesai}${input.lokasi ? ` di ${input.lokasi}` : ""}`;
    case "ubah_rapat": {
      const m = (await load<Meeting>(MEETING_KIND)).find((x) => x.id === input.id);
      return `Ubah rapat "${m?.title ?? input.id}"${input.status ? ` → ${input.status}` : ""}${input.tanggal || input.mulai ? ` ke ${input.tanggal ?? m?.date ?? ""} ${input.mulai ?? ""}` : ""}`;
    }
    case "catat_presensi":
      return `Presensi ${input.mata_kuliah} ${input.tanggal ?? "hari ini"}: ${input.status}`;
  }
  return name;
}
