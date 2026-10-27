// Skala waktu timeline proyek: tahun → triwulan → bulan → minggu → hari.
import { addDays, dateKey, parseDateKey } from "./date";

export type Zoom = "tahun" | "triwulan" | "bulan" | "minggu" | "hari";
export const ZOOMS: { id: Zoom; label: string }[] = [
  { id: "tahun", label: "Tahun" },
  { id: "triwulan", label: "Triwulan" },
  { id: "bulan", label: "Bulan" },
  { id: "minggu", label: "Minggu" },
  { id: "hari", label: "Hari" },
];

export interface Cell {
  label: string;
  title?: string;
  start: string;
  days: number;
  today?: boolean;
  weekend?: boolean;
}

export interface Scale {
  zoom: Zoom;
  from: string; // inklusif
  to: string; // inklusif
  days: number;
  dayWidth: number;
  width: number;
  tiers: [Cell[], Cell[]];
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const HARI_PANJANG = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

export const daysBetween = (a: string, b: string) => Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);

export function mondayOf(d: string): string {
  const x = parseDateKey(d);
  return dateKey(addDays(x, -((x.getDay() + 6) % 7)));
}

/** Nomor minggu ISO-8601. */
export function isoWeek(d: string): number {
  const x = parseDateKey(d);
  const t = new Date(x.getFullYear(), x.getMonth(), x.getDate() + 3 - ((x.getDay() + 6) % 7));
  const w1 = new Date(t.getFullYear(), 0, 4);
  return 1 + Math.round(((t.getTime() - w1.getTime()) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7);
}

function range(zoom: Zoom, anchor: string): [string, string] {
  const a = parseDateKey(anchor);
  const y = a.getFullYear();
  const m = a.getMonth();
  switch (zoom) {
    case "tahun":
      return [`${y}-01-01`, `${y}-12-31`];
    case "triwulan": {
      const q = Math.floor(m / 3) * 3;
      return [dateKey(new Date(y, q, 1)), dateKey(new Date(y, q + 3, 0))];
    }
    case "bulan":
      return [dateKey(new Date(y, m, 1)), dateKey(new Date(y, m + 1, 0))];
    case "minggu": {
      const mon = mondayOf(anchor);
      return [mon, dateKey(addDays(parseDateKey(mon), 6))];
    }
    case "hari":
      return [anchor, anchor];
  }
}

const DAY_WIDTH: Record<Zoom, number> = { tahun: 3, triwulan: 13, bulan: 36, minggu: 128, hari: 960 };

function cellsBy(from: string, to: string, key: (d: string) => string, label: (d: string) => Cell["label"], title?: (d: string) => string): Cell[] {
  const out: Cell[] = [];
  for (let d = from; d <= to; d = dateKey(addDays(parseDateKey(d), 1))) {
    const k = key(d);
    const last = out[out.length - 1];
    if (last && key(last.start) === k) last.days++;
    else out.push({ label: label(d), title: title?.(d), start: d, days: 1 });
  }
  return out;
}

export function makeScale(zoom: Zoom, anchor: string, today = dateKey()): Scale {
  const [from, to] = range(zoom, anchor);
  const days = daysBetween(from, to) + 1;
  const dayWidth = DAY_WIDTH[zoom];
  const monthKey = (d: string) => d.slice(0, 7);
  const quarterKey = (d: string) => `${d.slice(0, 4)}-${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`;
  const weekKey = (d: string) => mondayOf(d);
  const dayCells = () =>
    cellsBy(from, to, (d) => d, (d) => {
      const x = parseDateKey(d);
      return zoom === "minggu" ? `${HARI[x.getDay()]} ${x.getDate()}` : String(x.getDate());
    }).map((c) => {
      const wd = parseDateKey(c.start).getDay();
      return { ...c, today: c.start === today, weekend: wd === 0 || wd === 6, title: `${HARI_PANJANG[wd]}, ${Number(c.start.slice(8))} ${BULAN[Number(c.start.slice(5, 7)) - 1]}` };
    });
  const monthCells = (long: boolean) => cellsBy(from, to, monthKey, (d) => (long ? `${BULAN[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}` : BLN[Number(d.slice(5, 7)) - 1]));
  const weekCells = () => cellsBy(from, to, weekKey, (d) => `M${isoWeek(d)}`, (d) => `Minggu ke-${isoWeek(d)} (mulai ${mondayOf(d)})`);
  let tiers: [Cell[], Cell[]];
  switch (zoom) {
    case "tahun":
      tiers = [cellsBy(from, to, quarterKey, (d) => `Triwulan ${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`), monthCells(false)];
      break;
    case "triwulan":
      tiers = [monthCells(true), weekCells()];
      break;
    case "bulan":
      tiers = [weekCells(), dayCells()];
      break;
    case "minggu":
      tiers = [monthCells(true), dayCells()];
      break;
    case "hari": {
      const hours: Cell[] = Array.from({ length: 24 }, (_, h) => ({ label: `${String(h).padStart(2, "0")}`, start: from, days: 1 / 24 }));
      tiers = [[{ label: dayTitle(from), start: from, days: 1, today: from === today }], hours];
      break;
    }
  }
  return { zoom, from, to, days, dayWidth, width: Math.round(days * dayWidth), tiers };
}

function dayTitle(d: string): string {
  const x = parseDateKey(d);
  return `${HARI_PANJANG[x.getDay()]}, ${x.getDate()} ${BULAN[x.getMonth()]} ${x.getFullYear()}`;
}

export function periodLabel(zoom: Zoom, anchor: string): string {
  const [from, to] = range(zoom, anchor);
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  switch (zoom) {
    case "tahun":
      return String(a.getFullYear());
    case "triwulan":
      return `Triwulan ${Math.floor(a.getMonth() / 3) + 1} ${a.getFullYear()} · ${BLN[a.getMonth()]}–${BLN[b.getMonth()]}`;
    case "bulan":
      return `${BULAN[a.getMonth()]} ${a.getFullYear()}`;
    case "minggu":
      return `${a.getDate()} ${BLN[a.getMonth()]} – ${b.getDate()} ${BLN[b.getMonth()]} ${b.getFullYear()} · M${isoWeek(from)}`;
    case "hari":
      return dayTitle(from);
  }
}

/** Geser jangkar satu periode maju/mundur. */
export function shiftAnchor(zoom: Zoom, anchor: string, dir: number): string {
  const a = parseDateKey(anchor);
  switch (zoom) {
    case "tahun":
      return dateKey(new Date(a.getFullYear() + dir, a.getMonth(), 1));
    case "triwulan":
      return dateKey(new Date(a.getFullYear(), a.getMonth() + 3 * dir, 1));
    case "bulan":
      return dateKey(new Date(a.getFullYear(), a.getMonth() + dir, 1));
    case "minggu":
      return dateKey(addDays(a, 7 * dir));
    case "hari":
      return dateKey(addDays(a, dir));
  }
}

/** Posisi batang untuk rentang tanggal inklusif. null bila di luar skala. */
export function barGeom(s: Scale, start: string, end: string): { left: number; width: number; cutStart: boolean; cutEnd: boolean } | null {
  if (end < s.from || start > s.to) return null;
  const a = start < s.from ? s.from : start;
  const b = end > s.to ? s.to : end;
  const left = daysBetween(s.from, a) * s.dayWidth;
  const width = Math.max(s.dayWidth, (daysBetween(a, b) + 1) * s.dayWidth);
  return { left, width, cutStart: start < s.from, cutEnd: end > s.to };
}

export function xOfDate(s: Scale, d: string): number {
  return daysBetween(s.from, d) * s.dayWidth;
}

/** Tanggal di posisi x (dibulatkan ke hari). */
export function dateAtX(s: Scale, x: number): string {
  const n = Math.max(0, Math.min(s.days - 1, Math.floor(x / s.dayWidth)));
  return dateKey(addDays(parseDateKey(s.from), n));
}

export const shiftDate = (d: string, n: number) => dateKey(addDays(parseDateKey(d), n));
