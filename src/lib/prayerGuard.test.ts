import { describe, expect, it } from "vitest";
import { bandsText, conflicts, DEFAULT_GUARD, nudge, prayerBands } from "./prayerGuard";

const T = { imsak: 240, subuh: 250, terbit: 330, dhuha: 360, dzuhur: 700, ashar: 893, maghrib: 1068, isya: 1139 };

describe("jadwal sadar ibadah", () => {
  it("rentang sholat dan Jumat", () => {
    const b = prayerBands(T, 2);
    expect(b.find((x) => x.id === "dzuhur")).toMatchObject({ start: 700, end: 715 });
    const jumat = prayerBands(T, 5).find((x) => x.id === "dzuhur")!;
    expect(jumat).toMatchObject({ name: "Sholat Jumat", start: 685, end: 745 });
    expect(prayerBands(T, 5, { ...DEFAULT_GUARD, jumat: false }).find((x) => x.id === "dzuhur")!.end).toBe(715);
  });

  it("bentrok dan geser ke setelah sholat", () => {
    const b = prayerBands(T, 2);
    expect(conflicts({ start: 660, end: 720 }, b).map((x) => x.id)).toEqual(["dzuhur"]);
    expect(conflicts({ start: 720, end: 780 }, b)).toEqual([]);
    expect(nudge({ start: 660, end: 720 }, b)).toEqual({ start: 715, end: 775 });
    // Geser berantai: 3 jam mulai 14:30 → setelah Ashar menabrak Maghrib → setelah Maghrib menabrak Isya → setelah Isya.
    expect(nudge({ start: 870, end: 1050 }, b)).toEqual({ start: 1154, end: 1334 });
    expect(nudge({ start: 1300, end: 1440 }, b)).toEqual({ start: 1300, end: 1440 });
    expect(nudge({ start: 1130, end: 1430 }, b)).toBeNull();
  });

  it("teks ringkas", () => {
    expect(bandsText(prayerBands(T, 2)).startsWith("Subuh 04:10–04:30, Dzuhur 11:40–11:55")).toBe(true);
  });
});
