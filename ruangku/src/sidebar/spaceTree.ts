// Logika pohon "Ruang" di sidebar: proyek → subproyek → halaman, dan perencanaan seret-taruh
// (urutkan ulang, jadikan anak, pindahkan halaman antarproyek). Murni, tanpa React, supaya teruji.
import type { Item, Note } from "../lib/types";
import type { Project } from "../lib/tasks";
import { childrenOf, wouldCycleProject } from "../lib/projects";
import { isDescendant } from "../lib/notesTree";

export type NodeRef = { t: "p"; id: string } | { t: "n"; id: string };
export type DropTarget = NodeRef | { t: "root" } | { t: "private" };
export type DropWhere = "before" | "after" | "inside";

type P = Item<Project>;
type N = Item<Note>;

const isPage = (n: N) => !n.isTemplate && !n.date;
const byOrder = <T extends { order?: number; title?: string; name?: string }>(a: T, b: T) =>
  (a.order ?? 1e9) - (b.order ?? 1e9) || (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? "", "id");

/** Halaman tingkat atas sebuah proyek (projectId kosong = halaman pribadi tanpa proyek). */
export function topPages(notes: N[], projectId: string | undefined, projectIds?: Set<string>): N[] {
  const ids = new Set(notes.map((n) => n.id));
  return notes
    .filter((n) => isPage(n) && (!n.parentId || !ids.has(n.parentId)))
    .filter((n) => (projectId ? n.projectId === projectId : !n.projectId || (projectIds ? !projectIds.has(n.projectId) : false)))
    .sort(byOrder);
}

export function subPages(notes: N[], noteId: string): N[] {
  return notes.filter((n) => isPage(n) && n.parentId === noteId).sort(byOrder);
}

export interface Patch<T> {
  id: string;
  patch: Partial<T>;
}
export interface DropPlan {
  projects: Patch<Project>[];
  notes: Patch<Note>[];
}

/** Susun ulang urutan saudara: `drag` disisipkan sebelum/sesudah `target` (atau di akhir bila target kosong). */
export function reorderIds(siblings: string[], drag: string, target: string | null, where: "before" | "after"): string[] {
  const rest = siblings.filter((x) => x !== drag);
  if (!target) return [...rest, drag];
  const i = rest.indexOf(target);
  if (i < 0) return [...rest, drag];
  rest.splice(where === "before" ? i : i + 1, 0, drag);
  return rest;
}

function orderPatches<T extends { order?: number }>(ids: string[], items: (Item<T>)[]): Patch<T>[] {
  const out: Patch<T>[] = [];
  ids.forEach((id, i) => {
    const cur = items.find((x) => x.id === id);
    if (cur && cur.order !== i * 10) out.push({ id, patch: { order: i * 10 } as Partial<T> });
  });
  return out;
}

function merge<T>(list: Patch<T>[], id: string, patch: Partial<T>): Patch<T>[] {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return [...list, { id, patch }];
  return list.map((x, j) => (j === i ? { id, patch: { ...x.patch, ...patch } } : x));
}

/** Rencana perubahan untuk satu seret-taruh, atau pesan kesalahan bila tidak boleh. */
export function planDrop(projects: P[], notes: N[], drag: NodeRef, target: DropTarget, where: DropWhere): DropPlan | { error: string } {
  const live = projects.filter((p) => !p.archived);
  if (drag.t === "p") {
    const me = live.find((p) => p.id === drag.id);
    if (!me) return { error: "Proyek tidak ditemukan" };
    if (target.t === "n" || target.t === "private") return { error: "Proyek hanya bisa dipindah di antara proyek" };
    if (target.t === "p" && target.id === drag.id) return { projects: [], notes: [] };
    if (target.t === "root") {
      const ids = reorderIds(childrenOf(live, undefined).map((p) => p.id), me.id, null, "after");
      return { projects: merge(orderPatches(ids, live), me.id, { parentId: undefined }), notes: [] };
    }
    const tgt = live.find((p) => p.id === target.id);
    if (!tgt) return { error: "Proyek tujuan tidak ditemukan" };
    if (where === "inside") {
      if (wouldCycleProject(live, me.id, tgt.id)) return { error: "Proyek tidak bisa dipindah ke dalam subproyeknya sendiri" };
      const ids = reorderIds(childrenOf(live, tgt.id).map((p) => p.id), me.id, null, "after");
      return { projects: merge(orderPatches(ids, live), me.id, { parentId: tgt.id }), notes: [] };
    }
    const parent = tgt.parentId && live.some((p) => p.id === tgt.parentId) ? tgt.parentId : undefined;
    if (wouldCycleProject(live, me.id, parent)) return { error: "Proyek tidak bisa dipindah ke dalam subproyeknya sendiri" };
    const ids = reorderIds(childrenOf(live, parent).map((p) => p.id), me.id, tgt.id, where);
    return { projects: merge(orderPatches(ids, live), me.id, { parentId: parent }), notes: [] };
  }

  const me = notes.find((n) => n.id === drag.id);
  if (!me) return { error: "Halaman tidak ditemukan" };
  const projIds = new Set(live.map((p) => p.id));
  if (target.t === "root") return { error: "Taruh halaman di proyek atau di Halaman pribadi" };
  if (target.t === "private") {
    const ids = reorderIds(topPages(notes, undefined, projIds).map((n) => n.id), me.id, null, "after");
    return { projects: [], notes: merge(orderPatches(ids, notes), me.id, { parentId: undefined, projectId: undefined }) };
  }
  if (target.t === "p") {
    const ids = reorderIds(topPages(notes, target.id).map((n) => n.id), me.id, null, "after");
    return { projects: [], notes: merge(orderPatches(ids, notes), me.id, { parentId: undefined, projectId: target.id }) };
  }
  if (target.id === me.id) return { projects: [], notes: [] };
  const tgt = notes.find((n) => n.id === target.id);
  if (!tgt) return { error: "Halaman tujuan tidak ditemukan" };
  if (isDescendant(notes, tgt.id, me.id)) return { error: "Halaman tidak bisa dipindah ke dalam subhalamannya sendiri" };
  if (where === "inside") {
    const ids = reorderIds(subPages(notes, tgt.id).map((n) => n.id), me.id, null, "after");
    return { projects: [], notes: merge(orderPatches(ids, notes), me.id, { parentId: tgt.id, projectId: undefined }) };
  }
  const parentOk = !!tgt.parentId && notes.some((n) => n.id === tgt.parentId);
  const sibs = parentOk ? subPages(notes, tgt.parentId!) : topPages(notes, tgt.projectId && projIds.has(tgt.projectId) ? tgt.projectId : undefined, projIds);
  const ids = reorderIds(sibs.map((n) => n.id), me.id, tgt.id, where);
  return { projects: [], notes: merge(orderPatches(ids, notes), me.id, parentOk ? { parentId: tgt.parentId, projectId: undefined } : { parentId: undefined, projectId: tgt.projectId && projIds.has(tgt.projectId) ? tgt.projectId : undefined }) };
}

/** Posisi taruh dari letak kursor di dalam baris: atas ¼ = sebelum, bawah ¼ = sesudah, tengah = ke dalam. */
export function dropWhere(offsetY: number, height: number, allowInside = true): DropWhere {
  const f = height > 0 ? offsetY / height : 0.5;
  if (!allowInside) return f < 0.5 ? "before" : "after";
  return f < 0.25 ? "before" : f > 0.75 ? "after" : "inside";
}

export const refKey = (r: NodeRef) => `${r.t}:${r.id}`;
export function parseRef(k: string): NodeRef | null {
  const m = /^(p|n):(.+)$/.exec(k);
  return m ? ({ t: m[1] as "p" | "n", id: m[2] } as NodeRef) : null;
}
