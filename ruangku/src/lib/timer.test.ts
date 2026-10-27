import { describe, expect, it } from "vitest";
import { fmtClock, splitSession, trackedByTask } from "./timer";

const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe("timer", () => {
  it("sesi dipecah per tanggal dan sesi < 1 menit diabaikan", () => {
    expect(splitSession(at(26, 9, 0), at(26, 10, 30))).toEqual([{ date: "2026-10-26", start: 540, end: 630 }]);
    expect(splitSession(at(26, 23, 30), at(27, 0, 45))).toEqual([
      { date: "2026-10-26", start: 1410, end: 1440 },
      { date: "2026-10-27", start: 0, end: 45 },
    ]);
    expect(splitSession(at(26, 9), at(26, 9) + 30_000)).toEqual([]);
  });
  it("jumlah per tugas hanya dari blok tercatat", () => {
    const m = trackedByTask([
      { id: "a", updatedAt: 0, date: "x", start: 0, end: 30, title: "", taskId: "t", tracked: true },
      { id: "b", updatedAt: 0, date: "x", start: 60, end: 100, title: "", taskId: "t", tracked: true },
      { id: "c", updatedAt: 0, date: "x", start: 0, end: 60, title: "", taskId: "t" },
    ]);
    expect(m.get("t")).toBe(70);
  });
  it("format jam timer", () => {
    expect(fmtClock(65_000)).toBe("1:05");
    expect(fmtClock(3_725_000)).toBe("1:02:05");
  });
});
