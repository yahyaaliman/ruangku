import { describe, expect, it } from "vitest";
import { nextOccurrence } from "./repeat";

const at = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).getTime();

describe("nextOccurrence", () => {
  it("harian, hari kerja, mingguan", () => {
    expect(nextOccurrence(at(2026, 10, 26), "daily", at(2026, 10, 26))).toBe(at(2026, 10, 27));
    expect(nextOccurrence(at(2026, 10, 30), "weekdays", at(2026, 10, 30))).toBe(at(2026, 11, 2));
    expect(nextOccurrence(at(2026, 10, 26), "weekly", at(2026, 11, 10))).toBe(at(2026, 11, 16));
    expect(nextOccurrence(at(2026, 10, 26), "none", 0)).toBe(null);
  });
  it("bulanan menjaga tanggal asli", () => {
    const feb = nextOccurrence(at(2027, 1, 31), "monthly", at(2027, 1, 31))!;
    expect(feb).toBe(at(2027, 2, 28));
    expect(nextOccurrence(feb, "monthly", feb, 31)).toBe(at(2027, 3, 31));
    expect(nextOccurrence(at(2026, 12, 15), "monthly", at(2026, 12, 15))).toBe(at(2027, 1, 15));
  });
});
