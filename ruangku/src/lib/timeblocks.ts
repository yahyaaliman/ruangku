import type { Item, KeyResult, KpiEntry, Note, Reminder, TimeBlock } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { nextOccurrence } from "./repeat";

export const DAY_MIN = 0;
export const DAY_MAX = 24 * 60;
export const STEP = 15;
export const MIN_DURATION = 15;

export const snap = (m: number, step = STEP) => Math.round(m / step) * step;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** "08:30" -> 510. Mengembalikan null bila tidak valid. */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi > 0)) return null;
  return h * 60 + mi;
}

export function durationLabel(start: number, end: number): string {
  const d = end - start;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h && m ? `${h} j ${m} m` : h ? `${h} jam` : `${m} menit`;
}

/** Rapikan rentang: dibulatkan ke 15 menit, di dalam hari, minimal 15 menit. */
export function normalizeRange(start: number, end: number): { start: number; end: number } {
  let s = clamp(snap(Math.min(start, end)), DAY_MIN, DAY_MAX - MIN_DURATION);
  let e = clamp(snap(Math.max(start, end)), DAY_MIN + MIN_DURATION, DAY_MAX);
  if (e - s < MIN_DURATION) {
    e = s + MIN_DURATION;
    if (e > DAY_MAX) {
      e = DAY_MAX;
      s = DAY_MAX - MIN_DURATION;
    }
  }
  return { start: s, end: e };
}

/** Geser blok, durasi tetap, tidak keluar dari hari. */
export function moveRange(start: number, end: number, delta: number): { start: number; end: number } {
  const dur = end - start;
  const s = clamp(snap(start + delta), DAY_MIN, DAY_MAX - dur);
  return { start: s, end: s + dur };
}

/** Ubah tepi atas atau bawah blok. */
export function resizeRange(start: number, end: number, edge: "start" | "end", to: number): { start: number; end: number } {
  if (edge === "end") return { start, end: clamp(snap(to), start + MIN_DURATION, DAY_MAX) };
  return { start: clamp(snap(to), DAY_MIN, end - MIN_DURATION), end };
}

export interface Placed<T> {
  item: T;
  col: number;
  cols: number;
}

/** Susun blok yang tumpang tindih berdampingan (kolom), seperti kalender pada umumnya. */
export function layout<T extends { start: number; end: number }>(items: T[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = -1;
  let colEnds: number[] = [];
  const flush = () => {
    const n = colEnds.length;
    cluster.forEach((p) => (p.cols = n));
    out.push(...cluster);
    cluster = [];
    colEnds = [];
  };
  for (const it of sorted) {
    if (it.start >= clusterEnd && cluster.length) flush();
    let col = colEnds.findIndex((e) => e <= it.start);
    if (col < 0) {
      col = colEnds.length;
      colEnds.push(it.end);
    } else colEnds[col] = it.end;
    cluster.push({ item: it, col, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Rentang jam yang ditampilkan: default 06–22, melebar bila ada isi di luarnya. */
export function visibleHours(minutes: number[], from = 6, to = 22): { from: number; to: number } {
  let f = from;
  let t = to;
  for (const m of minutes) {
    f = Math.min(f, Math.floor(m / 60));
    t = Math.max(t, Math.ceil(m / 60));
  }
  return { from: clamp(f, 0, 23), to: clamp(t, 1, 24) };
}

/** Waktu kemunculan reminder pada tanggal tertentu (termasuk yang berulang). */
export function reminderTimesOn(r: Reminder, date: string): number[] {
  const dayStart = parseDateKey(date).getTime();
  const dayEnd = addDays(parseDateKey(date), 1).getTime();
  if (r.dueAt >= dayEnd) return [];
  if (r.dueAt >= dayStart) return [r.dueAt];
  if (r.repeat === "none" || r.done) return [];
  // Reminder berulang yang jadwal saat ini sebelum tanggal ini.
  const n = nextOccurrence(r.dueAt, r.repeat, dayStart - 1, r.anchorDay);
  return n !== null && n < dayEnd ? [n] : [];
}

export interface DayMarks {
  blocks: number;
  reminders: number;
  notes: number;
  kpiFilled: number;
}

/** Penanda kalender untuk deretan tanggal. */
export function dayMarks(
  dates: string[],
  data: { blocks: Item<TimeBlock>[]; reminders: Item<Reminder>[]; notes: Item<Note>[]; entries: Item<KpiEntry>[] },
): Map<string, DayMarks> {
  const m = new Map<string, DayMarks>(dates.map((d) => [d, { blocks: 0, reminders: 0, notes: 0, kpiFilled: 0 }]));
  for (const b of data.blocks) m.get(b.date) && m.get(b.date)!.blocks++;
  for (const n of data.notes) n.date && m.get(n.date) && m.get(n.date)!.notes++;
  for (const e of data.entries) m.get(e.date) && m.get(e.date)!.kpiFilled++;
  for (const r of data.reminders) {
    if (r.done && r.repeat === "none") {
      const k = dateKey(r.dueAt);
      if (m.has(k)) m.get(k)!.reminders++;
      continue;
    }
    for (const d of dates) if (reminderTimesOn(r, d).length) m.get(d)!.reminders++;
  }
  return m;
}

/** Grid kalender 6 minggu, mulai Senin. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Senin = 0
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => dateKey(addDays(start, i)));
}

/** Check-in key result yang terjadi pada tanggal tertentu. */
export function checkInsOn(krs: Item<KeyResult>[], date: string) {
  const out: { kr: Item<KeyResult>; at: number; value: number; note?: string }[] = [];
  for (const kr of krs) for (const h of kr.history ?? []) if (dateKey(h.at) === date) out.push({ kr, ...h });
  return out.sort((a, b) => a.at - b.at);
}

/** Judul otomatis untuk catatan harian dari baris pertama isinya. */
export function noteTitleFrom(body: string, fallback: string): string {
  const first = body.split("\n").map((l) => l.replace(/^#+\s*/, "").trim()).find(Boolean);
  return first ? first.slice(0, 80) : fallback;
}
