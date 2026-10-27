import { describe, expect, it } from "vitest";
import { expired, makeTrash, restoreItems, subtreeNoteIds } from "./trash";
import type { Item, Note } from "./types";

const n = (id: string, extra: Partial<Note> = {}): Item<Note> => ({ id, updatedAt: 1, title: id, body: `isi ${id}`, tags: [], ...extra });

describe("sampah halaman", () => {
  const notes = [n("a", { projectId: "p1", icon: "📚", pinned: true }), n("b", { parentId: "a" }), n("c", { parentId: "b" }), n("d")];

  it("mengambil subhalaman bertingkat", () => {
    expect(subtreeNoteIds(notes, "a")).toEqual(["a", "b", "c"]);
    expect(subtreeNoteIds(notes, "d")).toEqual(["d"]);
  });

  it("menyimpan isi utuh tanpa sticky/pin", () => {
    const t = makeTrash(notes, "a", 1000)!;
    expect(t.title).toBe("a");
    expect(t.icon).toBe("📚");
    expect(t.items.map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(t.items[0].data.body).toBe("isi a");
    expect(t.items[0].data.pinned).toBe(false);
    expect((t.items[0].data as unknown as { id?: string }).id).toBeUndefined();
  });

  it("memulihkan ke induk asal bila masih ada, kalau tidak ke tingkat atas proyeknya", () => {
    const t = makeTrash(notes, "b", 1000, "p1")!;
    expect(restoreItems(t, new Set(["a"]))[0].data.parentId).toBe("a");
    const lone = restoreItems(t, new Set());
    expect(lone[0].data.parentId).toBeUndefined();
    expect(lone[0].data.projectId).toBe("p1");
    expect(lone[1].data.parentId).toBe("b");
  });

  it("kedaluwarsa setelah 30 hari", () => {
    expect(expired({ trashedAt: 0 }, 31 * 86400000)).toBe(true);
    expect(expired({ trashedAt: 0 }, 29 * 86400000)).toBe(false);
  });
});
