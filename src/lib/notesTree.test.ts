import { describe, expect, it } from "vitest";
import { ancestors, backlinks, children, fillTemplate, isDescendant, linkedTaskIds } from "./notesTree";
import type { Item, Note } from "./types";

const n = (id: string, patch: Partial<Note> = {}): Item<Note> => ({ id, updatedAt: 0, title: id, body: "", tags: [], ...patch });

describe("catatan bersarang", () => {
  const notes = [n("a"), n("b", { parentId: "a" }), n("c", { parentId: "b", body: "lihat [A](note:a) dan [tugas](task:t1)" }), n("d", { parentId: "a", pinned: true }), n("tpl", { isTemplate: true }), n("harian", { date: "2026-10-26" })];
  it("breadcrumb, anak, keturunan", () => {
    expect(ancestors(notes, "c").map((x) => x.id)).toEqual(["a", "b"]);
    expect(children(notes, "a").map((x) => x.id)).toEqual(["d", "b"]);
    expect(children(notes, null).map((x) => x.id)).toEqual(["a"]);
    expect(isDescendant(notes, "c", "a")).toBe(true);
    expect(isDescendant(notes, "a", "c")).toBe(false);
  });
  it("backlink dan tautan tugas", () => {
    expect(backlinks(notes, "a").map((x) => x.id)).toEqual(["c"]);
    expect(backlinks(notes, "b")).toEqual([]);
    expect(linkedTaskIds(notes[2].body)).toEqual(["t1"]);
  });
  it("siklus induk tidak membuat perulangan tanpa akhir", () => {
    const loop = [n("x", { parentId: "y" }), n("y", { parentId: "x" })];
    expect(ancestors(loop, "x").length).toBeLessThanOrEqual(2);
  });
  it("placeholder template", () => {
    expect(fillTemplate("Rapat {{tanggal}} ({{hari}})", new Date(2026, 9, 26))).toBe("Rapat 26 Oktober 2026 (Senin)");
  });
});
