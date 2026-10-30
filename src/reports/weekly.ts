import { addDays, dateKey, parseDateKey } from "../lib/date";
import { kpiMet, krProgress } from "../lib/metrics";
import type { Item, KeyResult, Kpi, KpiEntry, Objective } from "../lib/types";

export function weekRange(day: string) {
  const d = parseDateKey(day);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || dateKey(d) !== day) throw new Error("Tanggal tidak valid.");
  const start = addDays(d, -((d.getDay() + 6) % 7));
  const end = addDays(start, 7);
  return { start, end, dates: Array.from({ length: 7 }, (_, i) => dateKey(addDays(start, i))) };
}

export function valueAt(kr: Item<KeyResult>, before: number): number | null {
  const history = (kr.history ?? []).filter(h => h.at < before && Number.isFinite(h.value)).sort((a, b) => b.at - a.at);
  // A current value is historical evidence only if the record predates the cutoff.
  if (kr.updatedAt < before && Number.isFinite(kr.current)) return kr.current;
  return history[0]?.value ?? null;
}

export type ReportTable = { name: string; headers: string[]; rows: (string | number | null)[][] };
export interface WeeklyReport { title: string; subtitle: string; note: string; tables: ReportTable[] }
export function weeklyReport(day: string, scope: string, objectives: Item<Objective>[], krs: Item<KeyResult>[], kpis: Item<Kpi>[], entries: Item<KpiEntry>[]): WeeklyReport {
  const { start, end, dates } = weekRange(day);
  const objectivesById = new Map(objectives.map(o => [o.id, o]));
  const okr: ReportTable = { name: "OKR", headers: ["Objective", "Periode", "Key result", "Satuan", "Target", "Awal minggu", "Akhir minggu", "Perubahan", "Progres (%)", "Check-in minggu ini"], rows: [] };
  for (const kr of krs) {
    const o = objectivesById.get(kr.objectiveId);
    if (!o) continue;
    const a = valueAt(kr, +start), b = valueAt(kr, +end);
    okr.rows.push([o.title, o.period, kr.title, kr.unit || "", kr.target, a, b, a === null || b === null ? null : b - a, b === null ? null : Math.round(krProgress({ ...kr, current: b }) * 1000) / 10, (kr.history ?? []).filter(h => h.at >= +start && h.at < +end).length]);
  }
  const kpi: ReportTable = { name: "KPI", headers: ["KPI", "Satuan", "Target harian", "Arah", ...dates, "Rata-rata terisi", "Hari terisi", "Hari tercapai"], rows: [] };
  const detail: ReportTable = { name: "Catatan KPI", headers: ["KPI", "Tanggal", "Nilai", "Catatan"], rows: [] };
  for (const k of kpis) {
    const byDate = new Map<string, Item<KpiEntry>>();
    for (const e of entries) if (e.kpiId === k.id && dates.includes(e.date) && Number.isFinite(e.value) && (!byDate.has(e.date) || byDate.get(e.date)!.updatedAt < e.updatedAt)) byDate.set(e.date, e);
    const values = dates.map(d => byDate.get(d)?.value ?? null);
    const filled = values.filter((v): v is number => v !== null);
    kpi.rows.push([k.name, k.unit || "", k.target, k.direction === "naik" ? ">=" : "<=", ...values, filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null, filled.length, filled.filter(v => kpiMet(k, v)).length]);
    for (const d of dates) { const e = byDate.get(d); if (e) detail.rows.push([k.name, e.date, e.value, e.note || ""]); }
  }
  return { title: "Laporan mingguan OKR & KPI", subtitle: `${dates[0]} — ${dates[6]} · ${scope}`, note: "Senin–Minggu, zona waktu perangkat. Nama dan target mengikuti definisi saat ekspor. Nilai OKR memakai riwayat yang tersedia; kosong berarti belum diketahui. KPI kosong tidak dihitung sebagai nol. Data arsip ikut disertakan.", tables: [okr, kpi, detail] };
}

export async function reportPdf(report: WeeklyReport): Promise<Uint8Array> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: "landscape" });
  const clean = (v: string) => v.replace(/[—–]/g, "-").replace(/[≥]/g, ">=").replace(/[≤]/g, "<=").replace(/[^\u0020-\u00ff\n]/g, "");
  for (const [index, table] of report.tables.entries()) {
    if (index) doc.addPage();
    doc.setFontSize(17); doc.text(clean(report.title), 14, 17);
    doc.setFontSize(10); doc.text(clean(report.subtitle), 14, 25);
    doc.setFontSize(13); doc.text(table.name, 14, 35);
    autoTable(doc, { startY: 40, head: [table.headers.map(clean)], body: table.rows.length ? table.rows.map(r => r.map(v => v === null ? "-" : typeof v === "number" ? Number(v.toFixed(3)).toString() : clean(v))) : [[{ content: "Belum ada data dalam lingkup ini.", colSpan: table.headers.length }]], styles: { fontSize: 7, cellPadding: 2, overflow: "linebreak" }, headStyles: { fillColor: [62, 69, 127] }, margin: { bottom: 24 } });
  }
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i); doc.setFontSize(7);
    doc.text(doc.splitTextToSize(clean(report.note), 263), 14, 193);
    doc.text(`${i} / ${doc.getNumberOfPages()}`, 280, 203, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}

export async function reportExcel(report: WeeklyReport): Promise<Uint8Array> {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Ruangku";
  const info = book.addWorksheet("Informasi");
  info.addRows([[report.title], [report.subtitle], [report.note]]);
  info.getColumn(1).width = 110; info.getRow(3).alignment = { wrapText: true }; info.getRow(3).height = 48;
  for (const table of report.tables) {
    const sheet = book.addWorksheet(table.name, { views: [{ state: "frozen", ySplit: 1 }] });
    // Strings remain string cells, including names beginning with =, +, - or @.
    sheet.addRows([table.headers, ...table.rows]);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3E457F" } };
    sheet.columns.forEach((c, i) => { c.width = i === 0 ? 36 : 19; c.alignment = { vertical: "top", wrapText: true }; });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, sheet.rowCount), column: table.headers.length } };
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
