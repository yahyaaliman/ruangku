import { describe, expect, it } from "vitest";
import { applicableItems, dayScore, DEFAULT_CONFIG, IbadahConfig, normalizeConfig, rangeSummary } from "./ibadah";

const cfg: IbadahConfig = normalizeConfig({ setup: true, city: "Jakarta", lat: -6.2, lng: 106.8, tz: 7 });

describe("ibadah", () => {
  it("default: semua aktif dengan target sempurna", () => {
    expect(DEFAULT_CONFIG.prayerTarget).toBe("masjid");
    const ids = applicableItems(cfg, "2026-10-28", false).map((i) => i.id); // Rabu, bukan hari puasa
    expect(ids).toContain("tilawah");
    expect(ids).not.toContain("puasa_senin_kamis");
    expect(ids).not.toContain("tarawih");
    const mon = applicableItems(cfg, "2026-10-26", false).map((i) => i.id);
    expect(mon).toEqual(expect.arrayContaining(["puasa_senin_kamis", "puasa_ayyamul_bidh"]));
    // udzur: sholat & puasa gugur, dzikir tetap
    const u = applicableItems(cfg, "2026-10-26", true).map((i) => i.id);
    expect(u).not.toContain("dhuha");
    expect(u).not.toContain("puasa_senin_kamis");
    expect(u).toContain("dzikir_pagi");
  });

  it("skor harian", () => {
    const date = "2026-10-28";
    const all5 = { subuh: "masjid", dzuhur: "masjid", ashar: "masjid", maghrib: "masjid", isya: "masjid" } as const;
    const perfectItems = Object.fromEntries(applicableItems(cfg, date, false).map((d) => [d.id, d.target]));
    expect(dayScore(cfg, { date, prayers: all5, items: perfectItems }, date).total).toBe(1);
    const s = dayScore(cfg, { date, prayers: { ...all5, isya: "sendiri" }, items: {} }, date);
    expect(s.wajib).toBeCloseTo((4 + 2 / 5) / 5);
    expect(s.sunnah).toBe(0);
    expect(s.perfectPrayers).toBe(4);
    // target "awal waktu": sholat sendiri di awal waktu sudah sempurna
    const awal = normalizeConfig({ ...cfg, prayerTarget: "awal" });
    expect(dayScore(awal, { date, prayers: { subuh: "awal" }, items: {} }, date).perfectPrayers).toBe(1);
    // udzur: wajib tidak dihitung
    const u = dayScore(cfg, { date, prayers: {}, items: { dzikir_pagi: 1 }, udzur: true }, date);
    expect(u.wajib).toBe(null);
    expect(u.total).toBeGreaterThan(0);
  });

  it("ringkasan rentang", () => {
    const logs = [
      { id: "a", updatedAt: 0, date: "2026-10-26", prayers: { subuh: "masjid" as const }, items: { tilawah: 20 } },
      { id: "b", updatedAt: 0, date: "2026-10-27", prayers: { subuh: "sendiri" as const }, items: { tilawah: 5 } },
    ];
    const r = rangeSummary(cfg, logs, ["2026-10-26", "2026-10-27", "2026-10-28"]);
    const subuh = r.perPrayer.find((p) => p.id === "subuh")!;
    expect(subuh).toMatchObject({ perfect: 1, done: 2, days: 3 });
    expect(r.perItem.find((i) => i.id === "tilawah")).toMatchObject({ done: 1, days: 3 });
    expect(r.loggedDays).toBe(2);
  });
});
