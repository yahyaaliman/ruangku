import { describe, expect, it } from "vitest";
import { dropWhere, parseRef, planDrop, refKey, reorderIds, subPages, topPages } from "./spaceTree";
import { DEFAULT_STATUSES, type Project } from "../lib/tasks";
import type { Item, Note } from "../lib/types";

const p = (id: string, extra: Partial<Project> = {}): Item<Project> => ({ id, updatedAt: 0, name: id.toUpperCase(), color: "nila", statuses: DEFAULT_STATUSES, ...extra });
const n = (id: string, extra: Partial<Note> = {}): Item<Note> => ({ id, updatedAt: 0, title: id, body: "", tags: [], ...extra });

const projects = [p("a", { order: 0 }), p("b", { order: 10 }), p("a1", { parentId: "a", order: 0 }), p("a2", { parentId: "a", order: 10 })];
const notes = [n("n1", { projectId: "a", order: 0 }), n("n2", { projectId: "a", order: 10 }), n("n1x", { parentId: "n1" }), n("priv"), n("tpl", { isTemplate: true }), n("day", { date: "2026-10-27" }), n("orphan", { projectId: "hilang" })];

describe("pohon Ruang", () => {
  it("halaman per proyek dan halaman pribadi", () => {
    expect(topPages(notes, "a").map((x) => x.id)).toEqual(["n1", "n2"]);
    expect(topPages(notes, undefined, new Set(["a", "b"])).map((x) => x.id)).toEqual(["orphan", "priv"]);
    expect(subPages(notes, "n1").map((x) => x.id)).toEqual(["n1x"]);
  });

  it("reorder", () => {
    expect(reorderIds(["x", "y", "z"], "z", "x", "before")).toEqual(["z", "x", "y"]);
    expect(reorderIds(["x", "y", "z"], "x", "y", "after")).toEqual(["y", "x", "z"]);
    expect(reorderIds(["x", "y"], "q", null, "after")).toEqual(["x", "y", "q"]);
  });

  it("proyek: jadikan subproyek, urutkan, cegah siklus", () => {
    const inside = planDrop(projects, notes, { t: "p", id: "b" }, { t: "p", id: "a" }, "inside");
    expect("error" in inside).toBe(false);
    if (!("error" in inside)) expect(inside.projects.find((x) => x.id === "b")!.patch).toMatchObject({ parentId: "a", order: 20 });
    const cyc = planDrop(projects, notes, { t: "p", id: "a" }, { t: "p", id: "a1" }, "inside");
    expect(cyc).toEqual({ error: "Proyek tidak bisa dipindah ke dalam subproyeknya sendiri" });
    const before = planDrop(projects, notes, { t: "p", id: "a2" }, { t: "p", id: "a1" }, "before");
    if (!("error" in before)) {
      expect(before.projects.find((x) => x.id === "a2")!.patch).toMatchObject({ order: 0, parentId: "a" });
      expect(before.projects.find((x) => x.id === "a1")!.patch).toEqual({ order: 10 });
    }
    const out = planDrop(projects, notes, { t: "p", id: "a1" }, { t: "root" }, "after");
    if (!("error" in out)) expect(out.projects.find((x) => x.id === "a1")!.patch).toMatchObject({ parentId: undefined, order: 20 });
    expect(planDrop(projects, notes, { t: "p", id: "a" }, { t: "n", id: "n1" }, "inside")).toHaveProperty("error");
  });

  it("halaman: pindah proyek, jadi subhalaman, urutkan, ke pribadi", () => {
    const toB = planDrop(projects, notes, { t: "n", id: "n2" }, { t: "p", id: "b" }, "inside");
    if (!("error" in toB)) expect(toB.notes.find((x) => x.id === "n2")!.patch).toMatchObject({ projectId: "b", parentId: undefined });
    const into = planDrop(projects, notes, { t: "n", id: "priv" }, { t: "n", id: "n1" }, "inside");
    if (!("error" in into)) expect(into.notes.find((x) => x.id === "priv")!.patch).toMatchObject({ parentId: "n1", projectId: undefined });
    expect(planDrop(projects, notes, { t: "n", id: "n1" }, { t: "n", id: "n1x" }, "inside")).toHaveProperty("error");
    const before = planDrop(projects, notes, { t: "n", id: "n2" }, { t: "n", id: "n1" }, "before");
    if (!("error" in before)) {
      expect(before.notes.find((x) => x.id === "n2")!.patch).toMatchObject({ order: 0, projectId: "a" });
      expect(before.notes.find((x) => x.id === "n1")!.patch).toEqual({ order: 10 });
    }
    const priv = planDrop(projects, notes, { t: "n", id: "n1" }, { t: "private" }, "inside");
    if (!("error" in priv)) expect(priv.notes.find((x) => x.id === "n1")!.patch).toMatchObject({ projectId: undefined, parentId: undefined });
  });

  it("posisi taruh dan kunci", () => {
    expect(dropWhere(2, 28)).toBe("before");
    expect(dropWhere(14, 28)).toBe("inside");
    expect(dropWhere(26, 28)).toBe("after");
    expect(dropWhere(10, 28, false)).toBe("before");
    expect(parseRef(refKey({ t: "n", id: "x:y" }))).toEqual({ t: "n", id: "x:y" });
    expect(parseRef("z:1")).toBeNull();
  });
});
