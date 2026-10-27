// Hierarki proyek & subproyek, dan "ruang lingkup proyek" yang dipakai semua modul.
import type { Item, TimeBlock } from "./types";
import { INBOX_ID, Project, Task } from "./tasks";

type P = Pick<Item<Project>, "id" | "parentId" | "name" | "order">;

/** Anak langsung sebuah proyek, terurut. */
export function childrenOf<T extends P>(projects: T[], id: string | undefined): T[] {
  const exists = new Set(projects.map((p) => p.id));
  return projects
    .filter((p) => p.id !== INBOX_ID && (id ? p.parentId === id : !p.parentId || !exists.has(p.parentId)))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
}

/** Id proyek beserta semua subproyeknya (bertingkat). */
export function subtreeIds(projects: P[], id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const p of projects) if (p.parentId && out.has(p.parentId) && !out.has(p.id)) (out.add(p.id), (grew = true));
  }
  return out;
}

/** Rantai induk dari akar sampai proyek ini (termasuk dirinya). */
export function lineage<T extends P>(projects: T[], id: string): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  let cur = projects.find((p) => p.id === id);
  while (cur && !seen.has(cur.id)) {
    out.unshift(cur);
    seen.add(cur.id);
    cur = cur.parentId ? projects.find((p) => p.id === cur!.parentId) : undefined;
  }
  return out;
}

export const rootOf = <T extends P>(projects: T[], id: string): T | undefined => lineage(projects, id)[0];

/** "Riset Thesis › Studi literatur" */
export function projectPath(projects: P[], id: string | undefined, sep = " › "): string {
  if (!id) return "";
  return lineage(projects, id).map((p) => p.name).join(sep);
}

/** Apakah memindah `id` ke bawah `newParent` membuat siklus. */
export function wouldCycleProject(projects: P[], id: string, newParent: string | undefined): boolean {
  if (!newParent) return false;
  return subtreeIds(projects, id).has(newParent);
}

/** Urutan tampil pohon proyek (kedalaman untuk indentasi). */
export function flatTree<T extends P>(projects: T[], collapsed: Set<string> = new Set()): { p: T; depth: number; hasChildren: boolean }[] {
  const out: { p: T; depth: number; hasChildren: boolean }[] = [];
  const walk = (parent: string | undefined, depth: number, seen: Set<string>) => {
    for (const p of childrenOf(projects, parent)) {
      if (seen.has(p.id)) continue;
      const kids = childrenOf(projects, p.id);
      out.push({ p, depth, hasChildren: kids.length > 0 });
      if (!collapsed.has(p.id)) walk(p.id, depth + 1, new Set([...seen, p.id]));
    }
  };
  walk(undefined, 0, new Set());
  return out;
}

// ---------- Ruang lingkup ----------

/** "all" = semua proyek; selain itu id proyek (termasuk subproyeknya). */
export type ScopeId = "all" | string;

export function scopeSet(projects: P[], scope: ScopeId): Set<string> | null {
  if (scope === "all") return null;
  return subtreeIds(projects, scope);
}

/** Apakah item dengan projectId tertentu masuk ruang lingkup. */
export function inScope(set: Set<string> | null, projectId: string | undefined): boolean {
  if (!set) return true;
  return !!projectId && set.has(projectId);
}

/** Proyek efektif sebuah blok waktu: miliknya sendiri, atau dari tugas yang ditautkan. */
export function blockProject(b: Pick<TimeBlock, "projectId" | "taskId">, tasks: Pick<Item<Task>, "id" | "projectId">[]): string | undefined {
  if (b.projectId) return b.projectId;
  if (b.taskId) {
    const t = tasks.find((x) => x.id === b.taskId);
    if (t && t.projectId !== INBOX_ID) return t.projectId;
  }
  return undefined;
}

/** Rentang proyek di timeline: tanggal eksplisit, atau dari tugas & subproyeknya. */
export function projectSpan(
  p: Item<Project>,
  projects: Item<Project>[],
  tasks: Pick<Task, "projectId" | "start" | "due">[],
): { start: string; end: string; derived: boolean } | null {
  if (p.start && p.end) return p.start <= p.end ? { start: p.start, end: p.end, derived: false } : { start: p.end, end: p.start, derived: false };
  const ids = subtreeIds(projects, p.id);
  const dates: string[] = [];
  for (const t of tasks) if (ids.has(t.projectId)) for (const d of [t.start, t.due]) if (d) dates.push(d);
  for (const q of projects) if (ids.has(q.id) && q.id !== p.id) for (const d of [q.start, q.end]) if (d) dates.push(d);
  for (const m of p.milestones ?? []) dates.push(m.date);
  if (p.start) dates.push(p.start);
  if (p.end) dates.push(p.end);
  if (!dates.length) return null;
  dates.sort();
  return { start: dates[0], end: dates[dates.length - 1], derived: true };
}

/** Progres tugas utama di proyek beserta subproyeknya. */
export function subtreeProgress(
  projects: Item<Project>[],
  tasks: Item<Task>[],
  id: string,
  isDone: (t: Item<Task>) => boolean,
): { done: number; total: number; late: number; open: number } {
  const ids = subtreeIds(projects, id);
  const today = new Date();
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  let done = 0;
  let total = 0;
  let late = 0;
  for (const t of tasks) {
    if (!ids.has(t.projectId) || t.parentId) continue;
    total++;
    if (isDone(t)) done++;
    else if (t.due && t.due < key) late++;
  }
  return { done, total, late, open: total - done };
}
