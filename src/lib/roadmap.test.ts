import { describe, expect, it } from "vitest";
import { barGeom, dateAtX, isoWeek, makeScale, mondayOf, periodLabel, shiftAnchor } from "./roadmap";

describe("skala timeline", () => {
  it("tahun: triwulan & bulan", () => {
    const s = makeScale("tahun", "2026-10-26", "2026-10-26");
    expect([s.from, s.to, s.days]).toEqual(["2026-01-01", "2026-12-31", 365]);
    expect(s.tiers[0].map((c) => [c.label, c.days])).toEqual([["Triwulan 1", 90], ["Triwulan 2", 91], ["Triwulan 3", 92], ["Triwulan 4", 92]]);
    expect(s.tiers[1]).toHaveLength(12);
  });

  it("triwulan & minggu ISO", () => {
    const s = makeScale("triwulan", "2026-10-26");
    expect([s.from, s.to]).toEqual(["2026-10-01", "2026-12-31"]);
    expect(s.tiers[0].map((c) => c.label)).toEqual(["Oktober 2026", "November 2026", "Desember 2026"]);
    expect(s.tiers[1][0]).toMatchObject({ label: "M40", days: 4 });
    expect(isoWeek("2026-10-26")).toBe(44);
    expect(isoWeek("2027-01-01")).toBe(53);
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
  });

  it("bulan & minggu menandai hari ini dan akhir pekan", () => {
    const s = makeScale("minggu", "2026-10-28", "2026-10-28");
    expect([s.from, s.to]).toEqual(["2026-10-26", "2026-11-01"]);
    expect(s.tiers[0].map((c) => c.label)).toEqual(["Oktober 2026", "November 2026"]);
    expect(s.tiers[1].map((c) => c.label)).toEqual(["Sen 26", "Sel 27", "Rab 28", "Kam 29", "Jum 30", "Sab 31", "Min 1"]);
    expect(s.tiers[1][2].today).toBe(true);
    expect(s.tiers[1][5].weekend).toBe(true);
    expect(periodLabel("minggu", "2026-10-28")).toBe("26 Okt – 1 Nov 2026 · M44");
  });

  it("geser periode", () => {
    expect(shiftAnchor("triwulan", "2026-11-15", 1)).toBe("2027-02-01");
    expect(shiftAnchor("bulan", "2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftAnchor("minggu", "2026-10-28", -1)).toBe("2026-10-21");
    expect(periodLabel("triwulan", "2026-11-15")).toBe("Triwulan 4 2026 · Okt–Des");
  });

  it("batang terpotong di tepi skala", () => {
    const s = makeScale("bulan", "2026-10-10");
    expect(barGeom(s, "2026-09-20", "2026-10-02")).toEqual({ left: 0, width: 72, cutStart: true, cutEnd: false });
    expect(barGeom(s, "2026-10-31", "2026-11-04")).toMatchObject({ left: 30 * 36, cutEnd: true });
    expect(barGeom(s, "2026-11-02", "2026-11-04")).toBeNull();
    expect(dateAtX(s, 36 * 4 + 5)).toBe("2026-10-05");
  });
});
