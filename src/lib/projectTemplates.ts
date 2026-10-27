// Template proyek (daftar tugas dengan tanggal relatif & dependensi) dan template hari (susunan blok waktu).
import type { BlockColor, Item, TimeBlock } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { DEFAULT_STATUSES, isTaskDone, Project, StatusDef, Task, TaskPriority } from "./tasks";

export interface TemplateTask {
  title: string;
  startOffset?: number; // hari dari tanggal mulai proyek
  dueOffset?: number;
  estimate?: number;
  priority?: TaskPriority;
  checklist?: string[];
  dependsOn?: number[]; // indeks tugas lain dalam template
  parent?: number; // indeks induk (subtugas)
  tags?: string[];
}

export interface ProjectTemplate {
  name: string;
  icon: string;
  description: string;
  color: BlockColor;
  statuses: StatusDef[];
  tasks: TemplateTask[];
}

export const BUILTIN_PROJECT_TEMPLATES: (ProjectTemplate & { id: string })[] = [
  {
    id: "klien",
    name: "Proyek klien",
    icon: "💼",
    description: "Dari kickoff sampai serah terima, dengan review klien.",
    color: "nila",
    statuses: [
      { id: "todo", label: "Antrean", color: "abu" },
      { id: "doing", label: "Dikerjakan", color: "nila" },
      { id: "review", label: "Review klien", color: "kunyit" },
      { id: "done", label: "Selesai", color: "daun", done: true },
    ],
    tasks: [
      { title: "Kickoff & kumpulkan kebutuhan", startOffset: 0, dueOffset: 2, estimate: 120, priority: "tinggi", checklist: ["Jadwalkan rapat", "Daftar kebutuhan", "Sepakati timeline"] },
      { title: "Susun proposal & estimasi biaya", startOffset: 2, dueOffset: 4, estimate: 180, dependsOn: [0] },
      { title: "Kerjakan draf pertama", startOffset: 5, dueOffset: 12, estimate: 960, dependsOn: [1] },
      { title: "Review klien & revisi", startOffset: 13, dueOffset: 16, estimate: 240, dependsOn: [2] },
      { title: "Serah terima & invoice", startOffset: 17, dueOffset: 18, estimate: 60, priority: "tinggi", dependsOn: [3], checklist: ["Kirim file final", "Kirim invoice", "Minta testimoni"] },
    ],
  },
  {
    id: "peluncuran",
    name: "Peluncuran produk",
    icon: "🚀",
    description: "Persiapan, pemasaran, hari H, dan evaluasi.",
    color: "bata",
    statuses: DEFAULT_STATUSES,
    tasks: [
      { title: "Tetapkan target & pesan utama", startOffset: 0, dueOffset: 3, estimate: 120, priority: "tinggi" },
      { title: "Siapkan halaman produk", startOffset: 3, dueOffset: 10, estimate: 600, dependsOn: [0] },
      { title: "Materi media sosial", startOffset: 5, dueOffset: 12, estimate: 360, dependsOn: [0] },
      { title: "Uji coba internal", startOffset: 11, dueOffset: 13, estimate: 180, dependsOn: [1] },
      { title: "Hari peluncuran", startOffset: 14, dueOffset: 14, estimate: 240, priority: "urgent", dependsOn: [2, 3] },
      { title: "Evaluasi hasil peluncuran", startOffset: 21, dueOffset: 21, estimate: 90, dependsOn: [4] },
    ],
  },
  {
    id: "belajar",
    name: "Belajar skill baru",
    icon: "📚",
    description: "Empat minggu: dasar, latihan, proyek kecil, refleksi.",
    color: "daun",
    statuses: [
      { id: "todo", label: "Belum", color: "abu" },
      { id: "doing", label: "Sedang belajar", color: "nila" },
      { id: "done", label: "Paham", color: "daun", done: true },
    ],
    tasks: [
      { title: "Minggu 1: konsep dasar", startOffset: 0, dueOffset: 6, estimate: 300 },
      { title: "Minggu 2: latihan terarah", startOffset: 7, dueOffset: 13, estimate: 360, dependsOn: [0] },
      { title: "Minggu 3: proyek kecil", startOffset: 14, dueOffset: 20, estimate: 480, dependsOn: [1] },
      { title: "Minggu 4: rangkum & ajarkan ulang", startOffset: 21, dueOffset: 27, estimate: 240, dependsOn: [2], checklist: ["Tulis ringkasan", "Jelaskan ke orang lain"] },
    ],
  },
  {
    id: "acara",
    name: "Acara / kegiatan",
    icon: "🎉",
    description: "Pengajian, syukuran, atau acara kantor.",
    color: "kunyit",
    statuses: DEFAULT_STATUSES,
    tasks: [
      { title: "Tentukan tanggal, tempat, anggaran", startOffset: 0, dueOffset: 2, priority: "tinggi" },
      { title: "Undangan & konfirmasi tamu", startOffset: 3, dueOffset: 10, dependsOn: [0] },
      { title: "Konsumsi & perlengkapan", startOffset: 5, dueOffset: 12, dependsOn: [0], checklist: ["Pesan konsumsi", "Sewa kursi/tenda", "Sound system"] },
      { title: "Susun acara & pembawa acara", startOffset: 7, dueOffset: 12, dependsOn: [0] },
      { title: "Hari H", startOffset: 14, dueOffset: 14, priority: "urgent", dependsOn: [1, 2, 3] },
    ],
  },
];

let seq = 0;
const cid = () => `c${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Ubah template menjadi tugas siap simpan. `ids` = id untuk tiap tugas (agar dependensi bisa ditautkan). */
export function instantiate(tpl: ProjectTemplate, projectId: string, startDate: string, ids: string[], firstStatus = "todo", orderBase = 0): Task[] {
  const at = (n?: number) => (n === undefined ? undefined : dateKey(addDays(parseDateKey(startDate), n)));
  return tpl.tasks.map((t, i) => ({
    title: t.title,
    projectId,
    parentId: t.parent !== undefined ? ids[t.parent] : undefined,
    status: firstStatus,
    priority: t.priority,
    start: at(t.startOffset),
    due: at(t.dueOffset),
    estimate: t.estimate,
    tags: t.tags ?? [],
    checklist: (t.checklist ?? []).map((text) => ({ id: cid(), text, done: false })),
    dependsOn: (t.dependsOn ?? []).map((j) => ids[j]).filter(Boolean),
    order: orderBase + i + 1,
    createdAt: Date.now(),
  }));
}

/** Simpan proyek yang ada sebagai template: tanggal dijadikan relatif terhadap tanggal paling awal. */
export function fromProject(p: Project, tasks: Item<Task>[]): ProjectTemplate {
  const list = tasks.filter((t) => t.projectId !== undefined).sort((a, b) => a.order - b.order);
  const dates = list.flatMap((t) => [t.start, t.due]).filter((d): d is string => !!d).sort();
  const base = dates[0] ? parseDateKey(dates[0]).getTime() : null;
  const off = (d?: string) => (d && base !== null ? Math.round((parseDateKey(d).getTime() - base) / 86400000) : undefined);
  const index = new Map(list.map((t, i) => [t.id, i]));
  return {
    name: p.name,
    icon: "🧩",
    description: p.description ?? `${list.length} tugas`,
    color: p.color,
    statuses: p.statuses,
    tasks: list.map((t) => ({
      title: t.title,
      startOffset: off(t.start),
      dueOffset: off(t.due),
      estimate: t.estimate,
      priority: t.priority,
      checklist: t.checklist.map((c) => c.text),
      dependsOn: t.dependsOn.map((d) => index.get(d)).filter((x): x is number => x !== undefined),
      parent: t.parentId ? index.get(t.parentId) : undefined,
      tags: t.tags,
    })),
  };
}

export interface DayTemplate {
  name: string;
  icon: string;
  blocks: Pick<TimeBlock, "start" | "end" | "title" | "color">[];
}

export const BUILTIN_DAY_TEMPLATES: (DayTemplate & { id: string })[] = [
  {
    id: "fokus",
    name: "Hari kerja fokus",
    icon: "🎯",
    blocks: [
      { start: 480, end: 510, title: "Rencana hari & email", color: "abu" },
      { start: 510, end: 690, title: "Kerja fokus (tanpa notifikasi)", color: "nila" },
      { start: 720, end: 780, title: "Istirahat & makan siang", color: "daun" },
      { start: 780, end: 900, title: "Rapat & kolaborasi", color: "kunyit" },
      { start: 900, end: 990, title: "Kerja fokus sesi 2", color: "nila" },
      { start: 990, end: 1020, title: "Tutup hari & evaluasi", color: "abu" },
    ],
  },
  {
    id: "kuliah",
    name: "Hari kuliah",
    icon: "🎓",
    blocks: [
      { start: 420, end: 600, title: "Kuliah pagi", color: "nila" },
      { start: 600, end: 720, title: "Belajar mandiri / perpustakaan", color: "daun" },
      { start: 780, end: 960, title: "Kuliah siang", color: "nila" },
      { start: 1140, end: 1260, title: "Kerjakan tugas", color: "kunyit" },
    ],
  },
  {
    id: "akhirpekan",
    name: "Akhir pekan seimbang",
    icon: "🌿",
    blocks: [
      { start: 360, end: 420, title: "Olahraga", color: "daun" },
      { start: 480, end: 600, title: "Waktu keluarga", color: "kunyit" },
      { start: 600, end: 720, title: "Belanja & beres rumah", color: "abu" },
      { start: 900, end: 1020, title: "Hobi / proyek pribadi", color: "nila" },
      { start: 1200, end: 1260, title: "Rencana minggu depan", color: "abu" },
    ],
  },
];

/** Blok dari template hari untuk tanggal tertentu, melewati blok yang bertabrakan jika `skipOverlap`. */
export function applyDayTemplate(tpl: DayTemplate, date: string, existing: Pick<TimeBlock, "start" | "end">[], skipOverlap = true): TimeBlock[] {
  return tpl.blocks
    .filter((b) => !skipOverlap || !existing.some((e) => b.start < e.end && e.start < b.end))
    .map((b) => ({ ...b, date }));
}

/** Progres proyek: tugas selesai / total (tanpa subtugas). */
export function projectProgress(projectId: string, tasks: Item<Task>[], projects: Item<Project>[]) {
  const top = tasks.filter((t) => t.projectId === projectId && !t.parentId);
  return { done: top.filter((t) => isTaskDone(t, projects)).length, total: top.length };
}
