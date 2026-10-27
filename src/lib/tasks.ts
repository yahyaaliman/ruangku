// Model tugas & proyek: status kustom per proyek, prioritas, subtugas, checklist,
// dependensi, tautan ke key result, pengulangan, estimasi, dan beban kerja.
import type { BlockColor, Item } from "./types";
import type { FieldDef, FieldValue } from "./customFields";
import { addDays, dateKey, parseDateKey } from "./date";

export const INBOX_ID = "inbox";

export type TaskPriority = "urgent" | "tinggi" | "sedang" | "rendah";
export const PRIORITIES: { id: TaskPriority; label: string; rank: number }[] = [
  { id: "urgent", label: "Mendesak", rank: 0 },
  { id: "tinggi", label: "Tinggi", rank: 1 },
  { id: "sedang", label: "Sedang", rank: 2 },
  { id: "rendah", label: "Rendah", rank: 3 },
];
export const priorityRank = (p?: TaskPriority) => PRIORITIES.find((x) => x.id === p)?.rank ?? 4;

export interface StatusDef {
  id: string;
  label: string;
  color: BlockColor;
  done?: boolean;
}

export const DEFAULT_STATUSES: StatusDef[] = [
  { id: "todo", label: "Belum mulai", color: "abu" },
  { id: "doing", label: "Dikerjakan", color: "nila" },
  { id: "review", label: "Ditinjau", color: "kunyit" },
  { id: "done", label: "Selesai", color: "daun", done: true },
];

export interface Milestone {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  done?: boolean;
}

export interface Project {
  name: string;
  color: BlockColor;
  description?: string;
  statuses: StatusDef[];
  archived?: boolean;
  order?: number;
  /** Proyek induk: proyek ini adalah subproyek. */
  parentId?: string;
  /** Emoji penanda proyek */
  icon?: string;
  /** Periode rencana proyek (untuk timeline). */
  start?: string;
  end?: string;
  milestones?: Milestone[];
  /** Folder kerja proyek di komputer (halaman File). */
  folder?: string;
  /** Ruang kerja tim tempat proyek ini dibagikan (kolaborasi). */
  workspaceId?: string;
  /** Penanggung jawab (id anggota) */
  leadId?: string;
  /** Kolom tambahan untuk tugas di proyek ini (diwarisi subproyek) */
  fields?: FieldDef[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export type RecurFreq = "daily" | "weekdays" | "weekly" | "monthly";
export interface Recurrence {
  freq: RecurFreq;
  interval: number;
}
export const RECUR_LABEL: Record<RecurFreq, string> = { daily: "Setiap hari", weekdays: "Hari kerja", weekly: "Setiap minggu", monthly: "Setiap bulan" };

export interface Task {
  title: string;
  projectId: string;
  parentId?: string;
  status: string;
  priority?: TaskPriority;
  start?: string; // YYYY-MM-DD
  due?: string; // YYYY-MM-DD
  dueTime?: number; // menit sejak 00:00
  estimate?: number; // menit
  tags: string[];
  checklist: ChecklistItem[];
  description?: string;
  dependsOn: string[];
  krId?: string;
  krIncrement?: number;
  recurrence?: Recurrence;
  order: number;
  createdAt: number;
  completedAt?: number;
  /** Kunci otomasi tenggat yang sudah dijalankan: "<ruleId>:<tanggal>" */
  autoFired?: string[];
  /** Anggota yang ditugaskan (id anggota) */
  assignees?: string[];
  /** Pembuat (id anggota) bila dibuat lewat bot/asisten/tim */
  createdBy?: string;
  /** Nilai kolom tambahan: id kolom → nilai */
  custom?: Record<string, FieldValue>;
}

export const INBOX_PROJECT: Item<Project> = { id: INBOX_ID, updatedAt: 0, name: "Inbox", color: "abu", statuses: DEFAULT_STATUSES };

export function projectOf(projects: Item<Project>[], id: string): Item<Project> {
  return projects.find((p) => p.id === id) ?? INBOX_PROJECT;
}

export function statusesOf(p: Pick<Project, "statuses"> | undefined): StatusDef[] {
  return p?.statuses?.length ? p.statuses : DEFAULT_STATUSES;
}

export function isDoneStatus(p: Pick<Project, "statuses"> | undefined, status: string): boolean {
  return !!statusesOf(p).find((s) => s.id === status)?.done;
}

export const firstOpenStatus = (p: Pick<Project, "statuses"> | undefined) => statusesOf(p).find((s) => !s.done)?.id ?? statusesOf(p)[0].id;
export const firstDoneStatus = (p: Pick<Project, "statuses"> | undefined) => statusesOf(p).find((s) => s.done)?.id ?? statusesOf(p)[statusesOf(p).length - 1].id;

export function isTaskDone(t: Task, projects: Item<Project>[]): boolean {
  return isDoneStatus(projectOf(projects, t.projectId), t.status);
}

/** Status tugas dilihat dari alur status proyek lain (mis. proyek induk yang sedang dibuka). */
export function statusIn(view: Pick<Project, "statuses">, t: Task, projects: Item<Project>[]): string {
  if (statusesOf(view).some((s) => s.id === t.status)) return t.status;
  return isTaskDone(t, projects) ? firstDoneStatus(view) : firstOpenStatus(view);
}

/** Status yang dipakai tugas saat dipindah ke kolom `colId` milik proyek tampilan. */
export function statusForColumn(view: Pick<Project, "statuses">, colId: string, t: Task, projects: Item<Project>[]): string {
  const own = projectOf(projects, t.projectId);
  if (statusesOf(own).some((s) => s.id === colId)) return colId;
  return isDoneStatus(view, colId) ? firstDoneStatus(own) : firstOpenStatus(own);
}

export function newTask(input: Partial<Task> & { title: string }, projects: Item<Project>[], order = 0): Task {
  // Abaikan kunci bernilai undefined supaya tidak menimpa nilai bawaan.
  const partial = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<Task> & { title: string };
  const projectId = partial.projectId ?? INBOX_ID;
  return {
    projectId,
    status: partial.status ?? firstOpenStatus(projectOf(projects, projectId)),
    tags: [],
    checklist: [],
    dependsOn: [],
    order,
    createdAt: Date.now(),
    ...partial,
  };
}

/** Dependensi yang belum selesai (tugas ini terblokir olehnya). */
export function blockers(t: Task, all: Item<Task>[], projects: Item<Project>[]): Item<Task>[] {
  return t.dependsOn.map((id) => all.find((x) => x.id === id)).filter((x): x is Item<Task> => !!x && !isTaskDone(x, projects));
}

/** Apakah menambah dependensi `depId` pada `taskId` membuat siklus. */
export function wouldCycle(taskId: string, depId: string, all: Item<Task>[]): boolean {
  if (taskId === depId) return true;
  const seen = new Set<string>();
  const stack = [depId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const t = all.find((x) => x.id === cur);
    if (t) stack.push(...t.dependsOn);
  }
  return false;
}

export type DueState = "overdue" | "today" | "soon" | "later" | "none";
export function dueState(t: Pick<Task, "due">, today = dateKey()): DueState {
  if (!t.due) return "none";
  if (t.due < today) return "overdue";
  if (t.due === today) return "today";
  return t.due <= dateKey(addDays(parseDateKey(today), 3)) ? "soon" : "later";
}

/** Tanggal berikutnya untuk tugas berulang. */
export function nextRecurrence(date: string, r: Recurrence): string {
  const d = parseDateKey(date);
  const n = Math.max(1, r.interval || 1);
  if (r.freq === "daily") return dateKey(addDays(d, n));
  if (r.freq === "weekly") return dateKey(addDays(d, 7 * n));
  if (r.freq === "weekdays") {
    let x = addDays(d, 1);
    while (x.getDay() === 0 || x.getDay() === 6) x = addDays(x, 1);
    return dateKey(x);
  }
  const day = d.getDate();
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, last));
  return dateKey(target);
}

/** Salinan tugas berikutnya saat tugas berulang diselesaikan. */
export function nextOccurrenceTask(t: Task, projects: Item<Project>[]): Task | null {
  if (!t.recurrence) return null;
  const base = t.due ?? t.start ?? dateKey();
  const due = nextRecurrence(base, t.recurrence);
  const shift = t.start && t.due ? Math.round((parseDateKey(t.due).getTime() - parseDateKey(t.start).getTime()) / 86400000) : null;
  return {
    ...t,
    status: firstOpenStatus(projectOf(projects, t.projectId)),
    due: t.due ? due : undefined,
    start: t.start ? (shift !== null ? dateKey(addDays(parseDateKey(due), -shift)) : nextRecurrence(t.start, t.recurrence)) : undefined,
    checklist: t.checklist.map((c) => ({ ...c, done: false })),
    completedAt: undefined,
    createdAt: Date.now(),
  };
}

export function sortTasks<T extends Task>(list: T[]): T[] {
  return [...list].sort((a, b) => a.order - b.order || priorityRank(a.priority) - priorityRank(b.priority) || (a.due ?? "9").localeCompare(b.due ?? "9"));
}

/** Urutan baru untuk menaruh tugas tepat sebelum `beforeId` (atau di akhir). */
export function orderBetween(list: { id: string; order: number }[], beforeId: string | null, movingId: string): number {
  const rest = list.filter((x) => x.id !== movingId).sort((a, b) => a.order - b.order);
  if (!beforeId) return (rest[rest.length - 1]?.order ?? 0) + 1;
  const i = rest.findIndex((x) => x.id === beforeId);
  if (i < 0) return (rest[rest.length - 1]?.order ?? 0) + 1;
  const after = rest[i].order;
  const before = i > 0 ? rest[i - 1].order : after - 2;
  return (before + after) / 2;
}

/** Rentang batang di timeline. */
export function barRange(t: Pick<Task, "start" | "due">): { start: string; end: string } | null {
  if (!t.start && !t.due) return null;
  const s = t.start ?? t.due!;
  const e = t.due ?? t.start!;
  return s <= e ? { start: s, end: e } : { start: e, end: s };
}

/** Beban kerja per tanggal (menit estimasi tugas terbuka yang jatuh tempo pada tanggal itu). */
export function workload(tasks: Item<Task>[], projects: Item<Project>[], dates: string[], defaultEstimate = 30): Map<string, { minutes: number; count: number }> {
  const m = new Map(dates.map((d) => [d, { minutes: 0, count: 0 }]));
  for (const t of tasks) {
    if (isTaskDone(t, projects) || !t.due) continue;
    const e = m.get(t.due);
    if (!e) continue;
    e.minutes += t.estimate ?? defaultEstimate;
    e.count++;
  }
  return m;
}

export function subtaskProgress(t: { id: string }, all: Item<Task>[], projects: Item<Project>[]): { done: number; total: number } {
  const subs = all.filter((x) => x.parentId === t.id);
  return { done: subs.filter((s) => isTaskDone(s, projects)).length, total: subs.length };
}

export function fmtDuration(min: number): string {
  if (min < 60) return `${min} m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} j ${m} m` : `${h} j`;
}
