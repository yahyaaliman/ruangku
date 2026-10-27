import { describe, expect, it } from "vitest";
import { accentHex, DEFAULT_PREFS, moveSection, normalizePrefs, toggleCollapsed } from "./widgetPrefs";

describe("widget prefs", () => {
  it("mengisi default dan membatasi nilai", () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    const p = normalizePrefs({ opacity: 250, scale: 10, radius: -4, agendaCount: 99, tone: "ungu" });
    expect(p.opacity).toBe(100);
    expect(p.scale).toBe(70);
    expect(p.radius).toBe(0);
    expect(p.agendaCount).toBe(12);
    expect(p.tone).toBe("gelap");
  });
  it("bagian lengkap tanpa duplikat, urutan dipertahankan", () => {
    const p = normalizePrefs({ sections: [{ id: "okr", on: true }, { id: "okr", on: false }, { id: "asing", on: true }] });
    // Bagian yang belum tersimpan disisipkan di posisi default-nya dengan status default.
    expect(p.sections.map((s) => s.id)).toEqual(["ibadah", "agenda", "tasks", "kpi", "okr", "notes"]);
    expect(p.sections.find((s) => s.id === "ibadah")!.on).toBe(true);
    expect(p.sections.find((s) => s.id === "okr")!.on).toBe(true);
    // Pengguna lama (tanpa bagian ibadah) mendapat ibadah di paling atas, urutan lain tetap.
    const old = normalizePrefs({ sections: [{ id: "okr", on: true }, { id: "agenda", on: true }, { id: "kpi", on: false }, { id: "notes", on: false }] });
    expect(old.sections.map((s) => s.id)).toEqual(["ibadah", "okr", "tasks", "agenda", "kpi", "notes"]);
  });
  it("memindah urutan bagian", () => {
    const s = DEFAULT_PREFS.sections;
    expect(moveSection(s, "kpi", -1).map((x) => x.id)).toEqual(["ibadah", "agenda", "kpi", "tasks", "okr", "notes"]);
    expect(normalizePrefs({ orientation: "miring", gridSize: 500 })).toMatchObject({ orientation: "vertikal", gridSize: 180 });
    expect(moveSection(s, "ibadah", -1)).toBe(s);
  });
  it("ciutkan bagian, aksen, dan mode mini", () => {
    const p = normalizePrefs({ collapsed: ["kpi", "kpi", "x"], accent: "neon", mini: "ya", restore: { w: 360 } });
    expect(p).toMatchObject({ collapsed: ["kpi"], accent: "bawaan", mini: false, restore: null });
    expect(toggleCollapsed(["kpi"], "kpi")).toEqual([]);
    expect(toggleCollapsed([], "okr")).toEqual(["okr"]);
    expect(accentHex("daun", true)).toBe("#5fd3a6");
    expect(accentHex("bawaan", false)).toBe("#3b4cca");
  });
});
