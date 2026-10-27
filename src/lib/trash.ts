// Sampah ala Notion: halaman yang dihapus (beserta subhalamannya) disimpan utuh sebagai satu
// record "trash" sehingga bisa dipulihkan; "Hapus permanen" baru benar-benar membuangnya.
import type { Item, Note } from "./types";

export const TRASH_KIND = "trash";

export interface TrashEntry {
  kind: "note";
  title: string;
  icon?: string;
  trashedAt: number;
  /** Proyek efektif saat dihapus (untuk dipulihkan ke tempat yang sama) */
  projectId?: string;
  parentId?: string;
  /** Halaman induk + seluruh subhalaman, isinya utuh */
  items: { id: string; data: Note }[];
}

/** Id halaman beserta seluruh keturunannya (urutan: induk dulu). */
export function subtreeNoteIds(notes: Pick<Item<Note>, "id" | "parentId">[], rootId: string): string[] {
  const out = [rootId];
  const seen = new Set(out);
  for (let i = 0; i < out.length; i++) {
    for (const n of notes) if (n.parentId === out[i] && !seen.has(n.id)) (seen.add(n.id), out.push(n.id));
  }
  return out;
}

const strip = <T extends object>(x: Item<T>): T => {
  const { id: _i, updatedAt: _u, ...rest } = x as Item<T> & Record<string, unknown>;
  void _i;
  void _u;
  return rest as unknown as T;
};

/** Bangun entri sampah dari halaman `rootId`. */
export function makeTrash(notes: Item<Note>[], rootId: string, now = Date.now(), effProject?: string): TrashEntry | null {
  const root = notes.find((n) => n.id === rootId);
  if (!root) return null;
  const ids = subtreeNoteIds(notes, rootId);
  return {
    kind: "note",
    title: root.title || "Tanpa judul",
    icon: root.icon,
    trashedAt: now,
    projectId: effProject ?? root.projectId,
    parentId: root.parentId,
    items: ids.map((id) => notes.find((n) => n.id === id)!).filter(Boolean).map((n) => ({ id: n.id, data: { ...strip(n), sticky: undefined, pinned: false } })),
  };
}

/** Isi yang dipulihkan: bila induk asal sudah tidak ada, halaman kembali ke tingkat atas proyeknya. */
export function restoreItems(entry: TrashEntry, existing: Set<string>): { id: string; data: Note }[] {
  return entry.items.map((it, i) => {
    if (i > 0) return it;
    const parentOk = !!entry.parentId && existing.has(entry.parentId);
    return { id: it.id, data: { ...it.data, parentId: parentOk ? entry.parentId : undefined, projectId: parentOk ? it.data.projectId : (it.data.projectId ?? entry.projectId) } };
  });
}

/** Sampah lebih dari 30 hari dibersihkan otomatis. */
export const TRASH_DAYS = 30;
export const expired = (e: Pick<TrashEntry, "trashedAt">, now = Date.now()) => now - e.trashedAt > TRASH_DAYS * 86400000;
