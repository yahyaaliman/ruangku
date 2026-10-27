// Operasi data untuk menu konteks sidebar: duplikat halaman/proyek beserta isinya.
import type { Item, Note } from "../lib/types";
import { firstOpenStatus, isTaskDone, type Project, type Task } from "../lib/tasks";
import { subtreeIds } from "../lib/projects";
import { subtreeNoteIds } from "../lib/trash";

const strip = <T extends object>(x: Item<T>): T => {
  const { id: _i, updatedAt: _u, ...rest } = x as Item<T> & Record<string, unknown>;
  void _i;
  void _u;
  return rest as unknown as T;
};

/** Salinan halaman beserta seluruh subhalamannya (id baru, judul induk diberi "(salinan)"). */
export function duplicatePages(notes: Item<Note>[], rootId: string, newId: () => string): { id: string; data: Note }[] {
  const ids = subtreeNoteIds(notes, rootId);
  const map = new Map(ids.map((id) => [id, newId()]));
  return ids.map((id) => {
    const n = notes.find((x) => x.id === id)!;
    const data: Note = { ...strip(n), sticky: undefined, pinned: false };
    if (id === rootId) {
      data.title = `${n.title || "Tanpa judul"} (salinan)`;
      data.order = (n.order ?? 0) + 1;
    } else if (n.parentId && map.has(n.parentId)) data.parentId = map.get(n.parentId);
    return { id: map.get(id)!, data };
  });
}

/** Salinan proyek beserta subproyek dan tugasnya (status dibuka lagi, tanpa riwayat waktu). */
export function duplicateProject(projects: Item<Project>[], tasks: Item<Task>[], rootId: string, newId: () => string, now = Date.now()): { projects: { id: string; data: Project }[]; tasks: { id: string; data: Task }[] } {
  const pids = [...subtreeIds(projects, rootId)].filter((id) => projects.some((p) => p.id === id));
  const pmap = new Map(pids.map((id) => [id, newId()]));
  const outP = pids.map((id) => {
    const p = projects.find((x) => x.id === id)!;
    const data: Project = { ...strip(p), workspaceId: id === rootId ? undefined : p.workspaceId };
    if (id === rootId) {
      data.name = `${p.name} (salinan)`;
      data.order = (p.order ?? 0) + 1;
      data.workspaceId = undefined;
    } else if (p.parentId && pmap.has(p.parentId)) data.parentId = pmap.get(p.parentId);
    return { id: pmap.get(id)!, data };
  });
  const own = tasks.filter((t) => pmap.has(t.projectId));
  const tmap = new Map(own.map((t) => [t.id, newId()]));
  const outT = own.map((t) => {
    const proj = projects.find((p) => p.id === t.projectId);
    const done = isTaskDone(t, projects);
    const data: Task = {
      ...strip(t),
      projectId: pmap.get(t.projectId)!,
      parentId: t.parentId ? tmap.get(t.parentId) : undefined,
      dependsOn: t.dependsOn.map((d) => tmap.get(d)).filter((d): d is string => !!d),
      status: done ? firstOpenStatus(proj) : t.status,
      checklist: t.checklist.map((c) => ({ ...c, done: false })),
      completedAt: undefined,
      autoFired: undefined,
      createdAt: now,
    };
    return { id: tmap.get(t.id)!, data };
  });
  return { projects: outP, tasks: outT };
}
