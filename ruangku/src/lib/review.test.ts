import { describe, expect, it } from "vitest";
import { computeStats, periodDates, periodKey, periodLabel, shiftPeriod, weekStart } from "./review";
import { normalizeConfig } from "./ibadah";

describe("periode evaluasi", () => {
  it("minggu dimulai Senin, bulan lengkap", () => {
    expect(weekStart("2026-10-28")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26"); // Minggu
    expect(periodDates("week", "2026-10-26")).toHaveLength(7);
    expect(periodDates("month", "2026-02")).toHaveLength(28);
    expect(periodKey("month", "2026-10-26")).toBe("2026-10");
    expect(shiftPeriod("month", "2026-12", 1)).toBe("2027-01");
    expect(shiftPeriod("week", "2026-10-26", -1)).toBe("2026-10-19");
    expect(periodLabel("week", "2026-10-26")).toBe("26 Okt – 1 Nov 2026");
  });
});

describe("ringkasan", () => {
  it("menghitung aktivitas, KPI, OKR, dan evaluasi harian", () => {
    const t = (d: number, h: number) => new Date(2026, 9, d, h).getTime();
    const it = <T,>(id: string, x: T) => ({ id, updatedAt: 0, ...x });
    const s = computeStats(["2026-10-26", "2026-10-27"], {
      blocks: [
        it("a", { date: "2026-10-26", start: 540, end: 660, title: "x", color: "nila" as const, done: true }),
        it("b", { date: "2026-10-26", start: 700, end: 760, title: "y", color: "daun" as const }),
        it("c", { date: "2026-10-30", start: 540, end: 600, title: "di luar" }),
      ],
      reminders: [it("r", { title: "r", dueAt: t(27, 9), repeat: "none" as const, done: true })],
      kpis: [it("k", { name: "Tiket", target: 10, direction: "naik" as const })],
      entries: [it("e1", { kpiId: "k", date: "2026-10-26", value: 12 }), it("e2", { kpiId: "k", date: "2026-10-27", value: 4 })],
      objectives: [it("o", { title: "O", period: "2026-Q4" })],
      krs: [it("kr", { objectiveId: "o", title: "KR", start: 0, target: 10, current: 6, history: [{ at: t(20, 9), value: 2 }, { at: t(27, 9), value: 6 }] })],
      ibadahConfig: normalizeConfig(null),
      ibadahLogs: [],
      reviews: [it("dr", { type: "day" as const, key: "2026-10-26", energy: 4, answers: { obstacle: "Rapat mendadak" } })],
    }, "2026-10-31");
    expect(s.planned).toBe(180);
    expect(s.done).toBe(120);
    expect(s.byColor[0]).toEqual({ color: "nila", minutes: 120 });
    expect(s.days[0].activity).toBeCloseTo(2 / 3);
    expect(s.remindersDone).toBe(1);
    expect(s.kpiRate).toBe(0.5);
    expect(s.checkIns).toBe(1);
    expect(s.okr[0].delta).toBeCloseTo(0.4);
    expect(s.energyAvg).toBe(4);
    expect(s.notes[0].obstacle).toBe("Rapat mendadak");
  });
  it("hari mendatang tidak dihitung", () => {
    const empty = { blocks: [{ id: "b", updatedAt: 0, date: "2026-10-27", start: 540, end: 600, title: "besok" }], reminders: [], kpis: [], entries: [], objectives: [], krs: [], ibadahConfig: normalizeConfig(null), ibadahLogs: [], reviews: [] };
    const s = computeStats(["2026-10-26", "2026-10-27"], empty, "2026-10-26");
    expect(s.planned).toBe(0);
    expect(s.days[1].activity).toBe(null);
  });
});
