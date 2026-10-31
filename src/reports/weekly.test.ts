import { describe, it, expect } from "vitest";
import { reportExcel, reportPdf, valueAt, weeklyReport, weekRange } from "./weekly";
import type { Item, KeyResult } from "../lib/types";

describe("weekly reports", () => {
  const kr: Item<KeyResult> = { id: "kr", objectiveId: "o", updatedAt: +new Date(2026, 10, 4), title: "Hasil", start: 0, target: 100, current: 90, history: [{ at: +new Date(2026, 9, 25), value: 10 }, { at: +new Date(2026, 9, 28), value: 40 }, { at: +new Date(2026, 10, 3), value: 90 }] };
  it("uses local Monday/Sunday and does not include future check-ins", () => {
    expect(weekRange("2026-11-01").dates).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(valueAt(kr, +new Date(2026, 10, 2))).toBe(40);
    expect(valueAt({ ...kr, history: [] }, +new Date(2026, 10, 2))).toBeNull();
    expect(() => weekRange("2026-02-30")).toThrow();
  });
  const report = () => weeklyReport("2026-10-29", "Proyek A", [{ id: "o", title: "=unsafe", period: "2026-Q4", updatedAt: 1 }], [kr, { ...kr, id: "hidden", objectiveId: "other" }], [{ id: "k", name: "KPI", target: 0, direction: "turun", updatedAt: 1 }], [{ id: "e", kpiId: "k", date: "2026-10-26", value: 0, updatedAt: 1 }]);
  it("preserves zero vs missing and filters objectives by the supplied scope", () => {
    const r = report();
    expect(r.tables[0].rows).toHaveLength(1);
    expect(r.tables[0].rows[0].slice(5, 9)).toEqual([10, 40, 30, 40]);
    expect(r.tables[1].rows[0].slice(4, 8)).toEqual([0, null, null, null]);
    expect(r.tables[1].rows[0].slice(-3)).toEqual([0, 1, 1]);
  });
  it("writes real PDF and XLSX files with safe string cells", async () => {
    const pdf = await reportPdf(report());
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
    const bytes = await reportExcel(report());
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes as any);
    expect(workbook.getWorksheet("OKR")!.getCell("A2").value).toBe("=unsafe");
    expect(workbook.getWorksheet("KPI")!.getCell("E2").value).toBe(0);
    expect(workbook.getWorksheet("KPI")!.getCell("F2").value).toBeNull();
  }, 60000);
});
