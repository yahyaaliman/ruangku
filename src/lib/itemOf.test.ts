import { describe, expect, it } from "vitest";
import { itemOf } from "./types";

describe("itemOf", () => {
  it("mengisi kolom larik wajib yang hilang tanpa menimpa yang ada", () => {
    const n = itemOf<{ title: string; tags: string[] }>({ id: "n1", kind: "note", data: { title: "Tanpa tag", _ft: { title: 1 } }, updatedAt: 5 });
    expect(n).toEqual({ id: "n1", updatedAt: 5, title: "Tanpa tag", tags: [] });
    const t = itemOf<{ tags: string[]; checklist: unknown[]; dependsOn: string[] }>({ id: "t1", kind: "task", data: { tags: ["a"], checklist: null }, updatedAt: 1 });
    expect(t.tags).toEqual(["a"]);
    expect(t.checklist).toEqual([]);
    expect(t.dependsOn).toEqual([]);
  });

  it("tidak menambah kolom untuk jenis lain dan tahan data kosong", () => {
    expect(itemOf({ id: "b", kind: "timeblock", data: { start: 600 }, updatedAt: 2 })).toEqual({ id: "b", updatedAt: 2, start: 600 });
    expect(itemOf({ id: "x", kind: "meeting", data: null, updatedAt: 0 })).toEqual({ id: "x", updatedAt: 0, attendees: [], agenda: [], actions: [] });
  });
});
