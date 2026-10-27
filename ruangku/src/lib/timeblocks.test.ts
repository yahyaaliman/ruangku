import { describe, expect, it } from "vitest";
import { checkInsOn, dayMarks, durationLabel, layout, monthGrid, moveRange, normalizeRange, noteTitleFrom, parseHHMM, reminderTimesOn, resizeRange, visibleHours } from "./timeblocks";
import type { Reminder } from "./types";

const at = (y: number, m: number, d: number, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

describe("rentang waktu", () => {
  it("normalisasi, geser, ubah ukuran", () => {
    expect(normalizeRange(547, 488)).toEqual({ start: 495, end: 540 });
    expect(normalizeRange(1435, 1440)).toEqual({ start: 1425, end: 1440 });
    expect(moveRange(540, 600, 1000)).toEqual({ start: 1380, end: 1440 });
    expect(moveRange(540, 600, -700)).toEqual({ start: 0, end: 60 });
    expect(moveRange(540, 600, 22)).toEqual({ start: 555, end: 615 });
    expect(resizeRange(540, 600, "end", 548)).toEqual({ start: 540, end: 555 });
    expect(resizeRange(540, 600, "start", 590)).toEqual({ start: 585, end: 600 });
  });
  it("format dan parse jam", () => {
    expect(parseHHMM("8:30")).toBe(510);
    expect(parseHHMM("24:00")).toBe(1440);
    expect(parseHHMM("25:00")).toBe(null);
    expect(parseHHMM("abc")).toBe(null);
    expect(durationLabel(540, 630)).toBe("1 j 30 m");
    expect(durationLabel(540, 660)).toBe("2 jam");
  });
  it("tata letak tumpang tindih", () => {
    const p = layout([
      { id: "a", start: 540, end: 600 },
      { id: "b", start: 570, end: 660 },
      { id: "c", start: 600, end: 630 },
      { id: "d", start: 700, end: 760 },
    ]);
    const by = Object.fromEntries(p.map((x) => [x.item.id, x]));
    expect([by.a.col, by.b.col, by.c.col]).toEqual([0, 1, 0]);
    expect(by.a.cols).toBe(2);
    expect(by.d).toMatchObject({ col: 0, cols: 1 });
  });
  it("rentang jam terlihat", () => {
    expect(visibleHours([])).toEqual({ from: 6, to: 22 });
    expect(visibleHours([300, 1410])).toEqual({ from: 5, to: 24 });
  });
});

describe("kalender", () => {
  it("grid dimulai Senin dan 42 hari", () => {
    const g = monthGrid(2026, 9); // Oktober 2026, tanggal 1 = Kamis
    expect(g).toHaveLength(42);
    expect(g[0]).toBe("2026-09-28");
    expect(g[3]).toBe("2026-10-01");
  });
  it("reminder berulang muncul di tanggal yang tepat", () => {
    const r: Reminder = { title: "x", dueAt: at(2026, 10, 26, 9), repeat: "weekdays", done: false };
    expect(reminderTimesOn(r, "2026-10-26")).toEqual([at(2026, 10, 26, 9)]);
    expect(reminderTimesOn(r, "2026-10-30")).toEqual([at(2026, 10, 30, 9)]);
    expect(reminderTimesOn(r, "2026-10-31")).toEqual([]); // Sabtu
    expect(reminderTimesOn(r, "2026-10-25")).toEqual([]); // sebelum jadwal
    expect(reminderTimesOn({ ...r, repeat: "none" }, "2026-10-27")).toEqual([]);
  });
  it("penanda per tanggal", () => {
    const m = dayMarks(["2026-10-26", "2026-10-27"], {
      blocks: [{ id: "b", updatedAt: 0, date: "2026-10-26", start: 540, end: 600, title: "Fokus" }],
      reminders: [{ id: "r", updatedAt: 0, title: "x", dueAt: at(2026, 10, 26), repeat: "daily", done: false }],
      notes: [{ id: "n", updatedAt: 0, title: "a", body: "", tags: [], date: "2026-10-27" }],
      entries: [{ id: "e", updatedAt: 0, kpiId: "k", date: "2026-10-26", value: 3 }],
    });
    expect(m.get("2026-10-26")).toEqual({ blocks: 1, reminders: 1, notes: 0, kpiFilled: 1 });
    expect(m.get("2026-10-27")).toEqual({ blocks: 0, reminders: 1, notes: 1, kpiFilled: 0 });
  });
  it("check-in per tanggal dan judul catatan", () => {
    const kr = { id: "k", updatedAt: 0, objectiveId: "o", title: "KR", start: 0, target: 10, current: 3, history: [{ at: at(2026, 10, 26, 10), value: 3 }, { at: at(2026, 10, 20), value: 1 }] };
    expect(checkInsOn([kr], "2026-10-26").map((c) => c.value)).toEqual([3]);
    expect(noteTitleFrom("\n## Rapat klien\nisi", "x")).toBe("Rapat klien");
    expect(noteTitleFrom("  ", "Catatan 26 Okt")).toBe("Catatan 26 Okt");
  });
});
