import { describe, expect, it } from "vitest";
import { groupRuns, moveIn, resolveLayout, type SectionDef } from "./pageLayout";

const defs: SectionDef[] = [
  { id: "a", label: "A" },
  { id: "b", label: "B", canWide: true, wide: true },
  { id: "c", label: "C", on: false },
  { id: "d", label: "D" },
];

describe("tata letak halaman", () => {
  it("bawaan: urutan definisi, bagian 'on: false' tersembunyi", () => {
    const r = resolveLayout(defs, {});
    expect(r.map((s) => `${s.id}${s.on ? "" : "-"}${s.wide ? "W" : ""}`)).toEqual(["a", "bW", "c-", "d"]);
  });
  it("urutan & pilihan pengguna, bagian baru disisipkan di posisi bawaannya", () => {
    const r = resolveLayout(defs, { order: ["d", "a", "x-lama"], hidden: ["a"], shown: ["c"], wide: { b: false } });
    // b tidak ada di urutan tersimpan → setelah a; c setelah b.
    expect(r.map((s) => s.id)).toEqual(["d", "a", "b", "c"]);
    expect(r.find((s) => s.id === "a")!.on).toBe(false);
    expect(r.find((s) => s.id === "c")!.on).toBe(true);
    expect(r.find((s) => s.id === "b")!.wide).toBe(false);
  });
  it("pindah naik/turun dan batas", () => {
    expect(moveIn(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveIn(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveIn(["a", "b", "c"], "z", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("kelompok grid", () => {
  it("kartu bersebelahan satu grid, bagian lain berdiri sendiri", () => {
    const r = groupRuns(["tiles", "a", "b", "alert", "c"], new Set(["a", "b", "c"]));
    expect(r).toEqual([
      { grid: false, ids: ["tiles"] },
      { grid: true, ids: ["a", "b"] },
      { grid: false, ids: ["alert"] },
      { grid: true, ids: ["c"] },
    ]);
  });
});
