import { describe, expect, it } from "vitest";
import { entriesByDate, hitRate, kpiAchievement, kpiMet, krProgress, objectiveProgress, okrHealth, series, streak } from "./metrics";
import { quarterElapsed, shiftQuarter, dateKey } from "./date";

describe("OKR", () => {
  it("progres naik dan turun", () => {
    expect(krProgress({ start: 0, target: 40, current: 10 })).toBe(0.25);
    // target turun: 8 jam -> 2 jam, sekarang 5 jam = 50%
    expect(krProgress({ start: 8, target: 2, current: 5 })).toBe(0.5);
    expect(krProgress({ start: 0, target: 10, current: 15 })).toBe(1);
    expect(krProgress({ start: 0, target: 10, current: -3 })).toBe(0);
    expect(krProgress({ start: 5, target: 5, current: 5 })).toBe(1);
  });
  it("progres objective rata-rata", () => {
    expect(objectiveProgress([])).toBe(0);
    expect(objectiveProgress([{ start: 0, target: 10, current: 10 }, { start: 0, target: 10, current: 0 }])).toBe(0.5);
  });
  it("kesehatan OKR terhadap waktu", () => {
    expect(okrHealth(0.5, 0.5)).toBe("aman");
    expect(okrHealth(0.3, 0.5)).toBe("waspada");
    expect(okrHealth(0.1, 0.5)).toBe("tertinggal");
    expect(okrHealth(0, 0.05)).toBe("aman");
  });
  it("kuartal", () => {
    expect(shiftQuarter("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftQuarter("2026-Q1", -1)).toBe("2025-Q4");
    expect(quarterElapsed("2026-Q4", new Date(2026, 10, 15))).toBeCloseTo(45 / 92, 1);
  });
});

describe("KPI", () => {
  const naik = { target: 10, direction: "naik" as const };
  const turun = { target: 3, direction: "turun" as const };
  it("capaian", () => {
    expect(kpiAchievement(naik, 5)).toBe(0.5);
    expect(kpiAchievement(naik, 12)).toBe(1.2);
    expect(kpiAchievement(turun, 2)).toBe(1);
    expect(kpiAchievement(turun, 6)).toBe(0.5);
    expect(kpiMet(turun, 3)).toBe(true);
    expect(kpiMet(turun, 4)).toBe(false);
  });
  it("deret, streak, hit rate", () => {
    const e = (date: string, value: number) => ({ id: date, updatedAt: 0, kpiId: "a", date, value });
    const map = entriesByDate([e("2026-10-22", 12), e("2026-10-23", 8), e("2026-10-24", 11), e("2026-10-25", 10)], "a");
    const s = series(map, 5, "2026-10-26");
    expect(s.map((x) => x.value)).toEqual([12, 8, 11, 10, null]);
    // hari ini kosong tidak memutus streak
    expect(streak(naik, map, "2026-10-26")).toBe(2);
    expect(hitRate(naik, s.map((x) => x.value))).toBe(0.75);
    expect(hitRate(naik, [null])).toBe(null);
  });
  it("dateKey lokal", () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
