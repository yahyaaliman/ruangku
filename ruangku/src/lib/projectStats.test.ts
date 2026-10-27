import { describe, expect, it } from "vitest";
import { chartColors, groupsFor, krValueAt, seriesFor } from "./projectStats";
import { demoRecords } from "./demo";
import type { RawRecord } from "./types";

const now = new Date(2026, 9, 26, 12, 0);
const rows = demoRecords({ now });
const items = (kind: string) => rows.filter((r: RawRecord) => r.kind === kind).map((r) => ({ ...r.data, id: r.id, updatedAt: r.updatedAt }));
const data = { blocks: items("timeblock"), kpis: items("kpi"), entries: items("kpientry"), objectives: items("objective"), krs: items("keyresult"), tasks: items("task"), projects: items("project") };
const days = Array.from({ length: 14 }, (_, i) => `2026-10-${String(13 + i).padStart(2, "0")}`);

describe("statistik per proyek", () => {
  it("kelompok: semua proyek utama, atau subproyek + bagian umum", () => {
    expect(groupsFor(data.projects, "all").map((g) => g.label)).toEqual(["Internal", "Jitu", "Kuliah", "Penitipan Infaq", "Recruitment", "Riset Thesis"]);
    const th = groupsFor(data.projects, "pj-thesis");
    expect(th.map((g) => g.label)).toEqual(["Studi literatur", "Pengumpulan data", "Eksperimen model", "Penulisan bab", "Riset Thesis (umum)"]);
    expect(groupsFor(data.projects, "pj-thesis-lit")).toHaveLength(1);
  });

  it("waktu tercatat dan tugas selesai per hari", () => {
    const s = seriesFor("waktu", groupsFor(data.projects, "all"), days, data, "2026-10-26");
    const th = s.find((x) => x.id === "pj-thesis")!;
    expect(th.values).toHaveLength(14);
    expect(th.total).toBeGreaterThan(5);
    expect(th.values[13]).toBe(0); // hari ini belum ada catatan timer
    const t = seriesFor("tugas", groupsFor(data.projects, "all"), days, data, "2026-10-26");
    expect(t.find((x) => x.id === "pj-jitu")!.total).toBe(1);
  });

  it("progres OKR mengikuti riwayat check-in", () => {
    expect(krValueAt({ start: 0, current: 28, history: [{ at: new Date(2026, 9, 2).getTime(), value: 8 }, { at: new Date(2026, 9, 20).getTime(), value: 21 }] }, "2026-10-10")).toBe(8);
    expect(krValueAt({ start: 0, current: 5, history: [] }, "2026-10-10")).toBe(5);
    const o = seriesFor("okr", groupsFor(data.projects, "all"), days, data, "2026-10-26");
    const th = o.find((x) => x.id === "pj-thesis")!;
    expect(th.values[0]! <= th.values[13]!).toBe(true);
    expect(th.total).toBe(Math.round(((28 / 40 + 2 / 3 + 180 / 500) / 3) * 100));
  });

  it("warna diagram tetap per entitas dan tidak bertabrakan", () => {
    const c = chartColors([{ id: "a", color: "ungu" }, { id: "b", color: "ungu" }, { id: "c", color: "nila" }, { id: "d", color: "abu" }]);
    expect(["a", "b", "c", "d"].map((k) => c.get(k))).toEqual(["ungu", "kopi", "nila", "laut"]);
  });
});
