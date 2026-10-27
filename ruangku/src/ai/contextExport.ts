// Ekspor konteks proyek sebagai Markdown untuk ditempel ke Claude Projects / ChatGPT Projects
// (pengetahuan proyek), atau dilampirkan ke percakapan AI mana pun. Murni fungsi dari data.
import type { Item, KeyResult, Note, Objective } from "../lib/types";
import { isTaskDone, projectOf, type Project, type Task } from "../lib/tasks";
import { flatTree, projectPath, subtreeIds } from "../lib/projects";
import type { Meeting } from "../lib/meetings";
import { courseLabel, type Course } from "../lib/courses";
import type { LedgerEntry } from "../lib/ledger";
import { byCategory, type Budget } from "../lib/finance";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";

export interface ContextInput {
  projectId: string | null;
  today: string;
  projects: Item<Project>[];
  tasks: Item<Task>[];
  notes: Item<Note>[];
  meetings: Item<Meeting>[];
  courses: Item<Course>[];
  ledger: Item<LedgerEntry>[];
  budgets: Item<Budget>[];
  objectives: Item<Objective>[];
  keyResults: Item<KeyResult>[];
  /** Sertakan cuplikan isi catatan (default ya) */
  noteBodies?: boolean;
}

const rp = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n).trimEnd()}…` : s);
const plain = (md: string) =>
  md
    .replace(/<\/?(details|summary|span|mark)[^>]*>/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "[gambar]")
    .replace(/\[TOC\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export function projectContextMarkdown(x: ContextInput): string {
  const ids = x.projectId ? subtreeIds(x.projects, x.projectId) : null;
  const inScope = (pid?: string) => !ids || (!!pid && ids.has(pid));
  const root = x.projectId ? x.projects.find((p) => p.id === x.projectId) : undefined;
  const title = root ? `${root.icon ? `${root.icon} ` : ""}${root.name}` : "Semua proyek";
  const horizon = dateKey(addDays(parseDateKey(x.today), 14));
  const out: string[] = [];
  out.push(`# Konteks Ruangku: ${title}`, "", `Diekspor ${x.today} dari aplikasi Ruangku. Gunakan sebagai pengetahuan latar; data bisa berubah setelah tanggal ini.`, "");

  // Proyek
  const live = x.projects.filter((p) => p.id !== "inbox" && !p.archived && (!ids || ids.has(p.id)));
  out.push("## Proyek");
  for (const { p, depth } of flatTree(live)) {
    const sub = subtreeIds(x.projects, p.id);
    const ts = x.tasks.filter((t) => sub.has(t.projectId) && !t.parentId);
    const done = ts.filter((t) => isTaskDone(t, x.projects)).length;
    out.push(`${"  ".repeat(depth)}- **${p.name}**${p.start || p.end ? ` (${p.start ?? "?"} s/d ${p.end ?? "?"})` : ""} · ${done}/${ts.length} tugas selesai${p.description ? ` — ${clip(p.description, 160)}` : ""}`);
  }
  out.push("");

  // Tugas terbuka
  const open = x.tasks.filter((t) => !t.parentId && !isTaskDone(t, x.projects) && inScope(t.projectId)).sort((a, b) => (a.due ?? "9999").localeCompare(b.due ?? "9999"));
  out.push(`## Tugas terbuka (${open.length})`);
  for (const t of open.slice(0, 60)) {
    const st = projectOf(x.projects, t.projectId).statuses?.find((s) => s.id === t.status)?.label ?? t.status;
    out.push(`- ${t.title} · ${projectPath(x.projects, t.projectId) || "Inbox"} · ${st}${t.due ? ` · tenggat ${t.due}${t.due < x.today ? " (terlambat)" : ""}` : ""}${t.priority ? ` · ${t.priority}` : ""}`);
  }
  if (open.length > 60) out.push(`- …dan ${open.length - 60} tugas lain`);
  out.push("");

  // Rapat
  const mts = x.meetings.filter((m) => inScope(m.projectId) && m.status !== "batal" && m.date >= dateKey(addDays(parseDateKey(x.today), -14)) && m.date <= horizon).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);
  if (mts.length) {
    out.push("## Rapat (2 minggu terakhir & 2 minggu ke depan)");
    for (const m of mts) {
      out.push(`- ${m.date} ${fmtMin(m.start)}–${fmtMin(m.end)} **${m.title}**${m.status === "selesai" ? " (selesai)" : ""}${m.location ? ` · ${m.location}` : ""}`);
      if (m.agenda.length) out.push(`  - Agenda: ${m.agenda.map((a) => a.text).join("; ")}`);
      if (m.decisions) out.push(`  - Keputusan: ${clip(m.decisions.replace(/\n+/g, " "), 300)}`);
      const acts = m.actions.filter((a) => a.text.trim());
      if (acts.length) out.push(`  - Action item: ${acts.map((a) => a.text).join("; ")}`);
    }
    out.push("");
  }

  // Kuliah
  const crs = x.courses.filter((c) => !c.archived && c.end >= x.today && (!ids || (c.projectId && ids.has(c.projectId))));
  if (crs.length) {
    out.push("## Mata kuliah");
    for (const c of crs) {
      out.push(`- **${courseLabel(c)}** (${c.sks} SKS, ${c.semester})${c.lecturer ? ` · dosen ${c.lecturer}` : ""}`);
      const ex = c.exams.filter((e) => e.date >= x.today);
      if (ex.length) out.push(`  - Ujian: ${ex.map((e) => `${e.kind} ${e.date} ${fmtMin(e.start)}${e.location ? ` (${e.location})` : ""}`).join("; ")}`);
      if (c.grading.length) out.push(`  - Komponen nilai: ${c.grading.map((g) => `${g.name} ${g.weight}%${g.score !== undefined && g.score !== null ? ` (nilai ${g.score})` : ""}`).join(", ")}`);
    }
    out.push("");
  }

  // OKR
  const objs = x.objectives.filter((o) => !o.archived && inScope(o.projectId) && (!ids || o.projectId));
  if (objs.length) {
    out.push("## OKR");
    for (const o of objs) {
      out.push(`- **${o.title}** (${o.period})`);
      for (const kr of x.keyResults.filter((k) => k.objectiveId === o.id)) out.push(`  - ${kr.title}: ${kr.current}/${kr.target}${kr.unit ? ` ${kr.unit}` : ""}`);
    }
    out.push("");
  }

  // Keuangan (hanya proyek: keuangan pribadi tidak diekspor saat memilih proyek)
  const led = x.ledger.filter((e) => (ids ? !!e.projectId && ids.has(e.projectId) : !!e.projectId));
  if (led.length) {
    const masuk = led.filter((e) => e.type === "masuk").reduce((s, e) => s + e.amount, 0);
    const keluar = led.filter((e) => e.type === "keluar").reduce((s, e) => s + e.amount, 0);
    out.push("## Keuangan proyek", `- Total masuk ${rp(masuk)}, keluar ${rp(keluar)}, saldo ${rp(masuk - keluar)} (${led.length} transaksi)`);
    const cats = byCategory(led, "0000-01-01", "9999-12-31").slice(0, 6);
    if (cats.length) out.push(`- Pengeluaran terbesar: ${cats.map((c) => `${c.category} ${rp(c.total)}`).join(", ")}`);
    for (const b of x.budgets.filter((b) => b.projectId && (!ids || ids.has(b.projectId)) && b.period === "total")) {
      const spent = led.filter((e) => e.type === "keluar" && (b.category === "*" || e.category === b.category) && e.projectId && subtreeIds(x.projects, b.projectId!).has(e.projectId)).reduce((s, e) => s + e.amount, 0);
      out.push(`- Anggaran ${b.category === "*" ? "total" : b.category} ${projectPath(x.projects, b.projectId)}: terpakai ${rp(spent)} dari ${rp(b.amount)}`);
    }
    out.push("");
  }

  // Catatan
  const notes = x.notes.filter((n) => !n.isTemplate && inScope(n.projectId) && (!ids || n.projectId)).sort((a, b) => b.updatedAt - a.updatedAt);
  if (notes.length) {
    out.push(`## Catatan (${notes.length})`);
    for (const n of notes.slice(0, 25)) {
      out.push(`### ${n.icon ? `${n.icon} ` : ""}${n.title || "Tanpa judul"}`);
      if (x.noteBodies !== false && n.body.trim()) out.push(clip(plain(n.body), 1200), "");
    }
    if (notes.length > 25) out.push(`…dan ${notes.length - 25} catatan lain.`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}
