// Operasi data tanpa React (dipakai asisten AI dan bot WA/Telegram/email).
// Mengikuti aturan yang sama dengan halaman Tugas: waktu selesai, pengulangan,
// kenaikan key result, dan antrean pesan penugasan.
import { api, newId } from "./api";
import { dataOf, type Item, type KeyResult, type RawRecord } from "./types";
import { firstDoneStatus, firstOpenStatus, INBOX_PROJECT, isTaskDone, newTask, nextOccurrenceTask, Project, projectOf, statusesOf, Task } from "./tasks";

const flat = <T,>(rows: RawRecord[]): Item<T>[] => rows.map((r) => ({ ...dataOf<T>(r.data), id: r.id, updatedAt: r.updatedAt }));
export async function load<T>(kind: string): Promise<Item<T>[]> {
  return flat<T>(await api.list(kind));
}
export function strip<T>(x: Item<T>): T {
  const { id: _i, updatedAt: _u, ...rest } = x as Item<T> & Record<string, unknown>;
  return rest as unknown as T;
}

export async function projectsAll(): Promise<Item<Project>[]> {
  return [INBOX_PROJECT, ...(await load<Project>("project"))];
}

async function enqueueAssign(taskId: string, before: string[] | undefined, after: string[] | undefined, by?: string) {
  const added = (after ?? []).filter((m) => !(before ?? []).includes(m));
  for (const memberId of added) await api.save(newId(), "outbox", { type: "assign", taskId, memberId, by, at: Date.now(), status: "pending", tries: 0 });
}

export async function createTask(input: Partial<Task> & { title: string }, by?: string): Promise<Item<Task>> {
  const [projects, tasks] = await Promise.all([projectsAll(), load<Task>("task")]);
  const order = Math.max(0, ...tasks.map((t) => t.order)) + 1;
  const t = newTask(input, projects, order);
  const id = newId();
  await api.save(id, "task", t);
  if (t.assignees?.length) await enqueueAssign(id, [], t.assignees, by);
  return { ...t, id, updatedAt: Date.now() };
}

async function bumpKr(t: Task, sign: 1 | -1) {
  if (!t.krId) return;
  const kr = (await load<KeyResult>("keyresult")).find((k) => k.id === t.krId);
  if (!kr) return;
  const value = Math.round((kr.current + (t.krIncrement ?? 1) * sign) * 1000) / 1000;
  const history = [...(kr.history ?? []), { at: Date.now(), value, note: `${sign > 0 ? "Tugas selesai" : "Tugas dibuka lagi"}: ${t.title}` }].slice(-60);
  await api.save(kr.id, "keyresult", { ...strip(kr), current: value, history });
}

/** Ubah tugas. `status` boleh "selesai"/"buka" atau id status proyek. */
export async function updateTask(id: string, patch: Partial<Task> & { status?: string }, by?: string): Promise<Item<Task> | null> {
  const [projects, tasks] = await Promise.all([projectsAll(), load<Task>("task")]);
  const cur = tasks.find((t) => t.id === id);
  if (!cur) return null;
  const prev = strip(cur);
  const next: Task = { ...prev, ...patch };
  const target = projectOf(projects, next.projectId);
  if (patch.status === "selesai") next.status = firstDoneStatus(target);
  else if (patch.status === "buka") next.status = firstOpenStatus(target);
  else if (patch.projectId && patch.projectId !== prev.projectId && !statusesOf(target).some((s) => s.id === next.status)) {
    next.status = isTaskDone(prev, projects) ? firstDoneStatus(target) : firstOpenStatus(target);
  }
  const wasDone = isTaskDone(prev, projects);
  const isDone = isTaskDone(next, projects);
  if (isDone && !wasDone) next.completedAt = Date.now();
  if (!isDone && wasDone) next.completedAt = undefined;
  await api.save(id, "task", next);
  if (isDone !== wasDone) await bumpKr(next, isDone ? 1 : -1);
  if (isDone && !wasDone && next.recurrence) {
    const n = nextOccurrenceTask(next, projects);
    if (n) await api.save(newId(), "task", { ...n, order: next.order + 0.001 });
  }
  if ((next.assignees ?? []).join() !== (prev.assignees ?? []).join()) await enqueueAssign(id, prev.assignees, next.assignees, by);
  return { ...next, id, updatedAt: Date.now() };
}

export async function removeTask(id: string): Promise<number> {
  const tasks = await load<Task>("task");
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) if (t.parentId && ids.has(t.parentId) && !ids.has(t.id)) (ids.add(t.id), (grew = true));
  }
  for (const x of ids) await api.remove(x, "task");
  for (const t of tasks) if (!ids.has(t.id) && t.dependsOn.some((d) => ids.has(d))) await api.save(t.id, "task", { ...strip(t), dependsOn: t.dependsOn.filter((d) => !ids.has(d)) });
  return ids.size;
}

/** Kode pendek tugas untuk bot: 4 karakter pertama id, huruf besar. */
export const shortCode = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4).toUpperCase();
export function findByCode<T extends { id: string }>(list: T[], code: string): T | undefined {
  const c = code.replace(/^#/, "").toUpperCase();
  return list.find((x) => shortCode(x.id) === c) ?? list.find((x) => x.id === code);
}
