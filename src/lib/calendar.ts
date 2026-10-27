// Kalender terpadu: blok waktu, tugas, pengingat, milestone, periode proyek,
// waktu sholat, libur nasional, dan kalender luar (ICS / Google) jadi satu daftar acara.
import { addDays, dateKey, parseDateKey } from "./date";
import type { BlockColor, Item, Reminder, TimeBlock } from "./types";
import type { Project, Task } from "./tasks";
import { isTaskDone, projectOf } from "./tasks";
import { reminderTimesOn } from "./timeblocks";
import type { Times } from "./prayer";
import { occurrences, type IcsEvent } from "./ics";

export type Layer = "blok" | "rapat" | "kuliah" | "tercatat" | "tugas" | "pengingat" | "milestone" | "proyek" | "sholat" | "luar";

export const LAYERS: { id: Layer; label: string; hint: string; on: boolean }[] = [
  { id: "blok", label: "Blok jadwal", hint: "Rencana waktu dari halaman Jadwal", on: true },
  { id: "rapat", label: "Rapat", hint: "Rapat dari halaman Rapat, termasuk rapat berulang", on: true },
  { id: "kuliah", label: "Kuliah & ujian", hint: "Pertemuan dan ujian mata kuliah", on: true },
  { id: "tugas", label: "Tugas", hint: "Tugas pada tanggal tenggatnya", on: true },
  { id: "pengingat", label: "Pengingat", hint: "Reminder, termasuk yang berulang", on: true },
  { id: "milestone", label: "Milestone", hint: "Milestone proyek", on: true },
  { id: "luar", label: "Kalender luar", hint: "Libur nasional, Google Calendar, dan langganan ICS", on: true },
  { id: "sholat", label: "Waktu sholat", hint: "Garis waktu sholat di tampilan hari/minggu", on: true },
  { id: "proyek", label: "Periode proyek", hint: "Rentang mulai–selesai tiap proyek", on: false },
  { id: "tercatat", label: "Waktu tercatat", hint: "Sesi timer yang sudah berjalan", on: false },
];

export interface CalEvent {
  /** Unik per kemunculan */
  key: string;
  layer: Layer;
  title: string;
  date: string;
  /** Tanggal terakhir (inklusif) untuk acara beberapa hari */
  endDate?: string;
  /** Menit sejak 00:00; tidak ada = sepanjang hari */
  start?: number;
  end?: number;
  color: BlockColor;
  projectId?: string;
  done?: boolean;
  sub?: string;
  /** Sumber data, untuk membuka / mengubah */
  ref: { kind: "timeblock" | "task" | "reminder" | "milestone" | "project" | "external" | "prayer"; id: string; extra?: string };
  /** Bisa digeser ke tanggal/jam lain */
  movable: boolean;
  /** Bisa diubah durasinya */
  resizable?: boolean;
  /** Hari libur (tanggal merah) */
  holiday?: boolean;
  /** Kemunculan dari aturan berulang */
  recurring?: boolean;
  /** Rapat / kelas: tempat dan tautan daring */
  location?: string;
  link?: string;
  /** Kelas batal (tidak dihitung presensi) */
  cancelled?: boolean;
  /** Rapat / mata kuliah sumbernya */
  meetingId?: string;
  courseId?: string;
  attendance?: TimeBlock["attendance"];
}

export interface ExternalCal {
  id: string;
  name: string;
  color: BlockColor;
  holiday?: boolean;
  events: IcsEvent[];
}

export interface CalData {
  blocks: Item<TimeBlock>[];
  tasks: Item<Task>[];
  reminders: Item<Reminder>[];
  projects: Item<Project>[];
  external: ExternalCal[];
  prayerTimes?: (date: string) => Times | null;
}

export interface CalOptions {
  layers: Set<Layer>;
  /** Filter proyek (lingkup global); acara tanpa proyek selalu tampil */
  match: (projectId?: string) => boolean;
  /** Sembunyikan tugas yang sudah selesai */
  hideDone?: boolean;
}

export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = parseDateKey(from); dateKey(d) <= to; d = addDays(d, 1)) out.push(dateKey(d));
  return out;
}

const overlaps = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;

const PRAYER_LABEL: [keyof Times, string][] = [
  ["subuh", "Subuh"],
  ["dzuhur", "Dzuhur"],
  ["ashar", "Ashar"],
  ["maghrib", "Maghrib"],
  ["isya", "Isya"],
];

/** Semua acara yang (sebagian) jatuh dalam [from, to]. */
export function eventsInRange(data: CalData, from: string, to: string, opt: CalOptions): CalEvent[] {
  const L = opt.layers;
  const out: CalEvent[] = [];
  const projColor = (id?: string): BlockColor => (id ? (projectOf(data.projects, id).color ?? "nila") : "abu");

  if (L.has("blok") || L.has("tercatat")) {
    const taskById = new Map(data.tasks.map((t) => [t.id, t]));
    for (const b of data.blocks) {
      if (b.date < from || b.date > to) continue;
      const layer: Layer = b.tracked ? "tercatat" : b.kind === "rapat" ? "rapat" : b.kind === "kuliah" ? "kuliah" : "blok";
      if (!L.has(layer)) continue;
      const projectId = b.projectId ?? (b.taskId ? taskById.get(b.taskId)?.projectId : undefined);
      if (!opt.match(projectId)) continue;
      out.push({
        key: `b:${b.id}`,
        layer,
        title: b.title || "(tanpa judul)",
        date: b.date,
        start: b.start,
        end: b.end,
        color: b.color ?? projColor(projectId),
        projectId,
        done: b.done,
        ref: { kind: "timeblock", id: b.id },
        movable: !b.tracked,
        resizable: !b.tracked,
        location: b.location,
        link: b.link,
        cancelled: b.attendance === "batal",
        meetingId: b.meetingId,
        courseId: b.courseId,
        attendance: b.attendance,
        sub: b.location,
      });
    }
  }

  if (L.has("tugas")) {
    for (const t of data.tasks) {
      if (!t.due) continue;
      const done = isTaskDone(t, data.projects);
      if (done && opt.hideDone) continue;
      if (!opt.match(t.projectId)) continue;
      // Tugas tampil pada tanggal tenggatnya saja; rentang kerja mulai–tenggat ada di Timeline proyek.
      if (t.due < from || t.due > to) continue;
      const p = projectOf(data.projects, t.projectId);
      out.push({
        key: `t:${t.id}`,
        layer: "tugas",
        title: t.title,
        date: t.due,
        start: t.dueTime,
        end: t.dueTime !== undefined ? Math.min(1440, t.dueTime + Math.max(15, t.estimate ?? 30)) : undefined,
        color: p.color ?? "nila",
        projectId: t.projectId,
        done,
        sub: p.name,
        ref: { kind: "task", id: t.id },
        movable: true,
        resizable: t.dueTime !== undefined,
      });
    }
  }

  if (L.has("pengingat")) {
    const dates = datesBetween(from, to);
    for (const r of data.reminders) {
      if (!opt.match(r.projectId)) continue;
      const times: number[] = [];
      if (r.done && r.repeat === "none") {
        const k = dateKey(r.dueAt);
        if (k >= from && k <= to) times.push(r.dueAt);
      } else for (const d of dates) times.push(...reminderTimesOn(r, d));
      for (const at of times) {
        const d = new Date(at);
        const m = d.getHours() * 60 + d.getMinutes();
        out.push({
          key: `r:${r.id}:${at}`,
          layer: "pengingat",
          title: r.title,
          date: dateKey(at),
          start: m,
          end: Math.min(1440, m + 15),
          color: "kunyit",
          projectId: r.projectId,
          done: r.done && r.repeat === "none",
          sub: r.repeat !== "none" ? "berulang" : undefined,
          recurring: r.repeat !== "none",
          ref: { kind: "reminder", id: r.id, extra: String(at) },
          movable: r.repeat === "none" && !r.done,
        });
      }
    }
  }

  if (L.has("milestone") || L.has("proyek")) {
    for (const p of data.projects) {
      if (p.archived || !opt.match(p.id)) continue;
      if (L.has("milestone"))
        for (const m of p.milestones ?? [])
          if (m.date >= from && m.date <= to)
            out.push({ key: `m:${p.id}:${m.id}`, layer: "milestone", title: m.title, date: m.date, color: p.color, projectId: p.id, done: m.done, sub: p.name, ref: { kind: "milestone", id: p.id, extra: m.id }, movable: true });
      if (L.has("proyek") && p.start && p.end && overlaps(p.start, p.end, from, to))
        out.push({ key: `p:${p.id}`, layer: "proyek", title: p.name, date: p.start, endDate: p.end > p.start ? p.end : undefined, color: p.color, projectId: p.id, ref: { kind: "project", id: p.id }, movable: false });
    }
  }

  if (L.has("luar")) {
    for (const cal of data.external) {
      // Kejadian yang diganti (RECURRENCE-ID) menggantikan kejadian dari aturan berulang.
      const overrides = new Set(cal.events.filter((e) => e.recurrenceOf).map((e) => `${e.uid}|${e.recurrenceOf}`));
      for (const e of cal.events) {
        const lenDays = e.endDate ? datesBetween(e.date, e.endDate).length - 1 : 0;
        const starts = e.recurrenceOf ? (overlaps(e.date, e.endDate ?? e.date, from, to) ? [e.date] : []) : occurrences(e, dateKey(addDays(parseDateKey(from), -lenDays)), to);
        for (const d of starts) {
          if (!e.recurrenceOf && e.rrule && overrides.has(`${e.uid}|${d}`)) continue;
          const endDate = lenDays ? dateKey(addDays(parseDateKey(d), lenDays)) : undefined;
          out.push({
            key: `x:${cal.id}:${e.uid}:${d}`,
            layer: "luar",
            title: e.title,
            date: d,
            endDate,
            start: e.allDay ? undefined : e.start,
            end: e.allDay ? undefined : e.end,
            color: cal.color,
            sub: [cal.name, e.location].filter(Boolean).join(" · "),
            ref: { kind: "external", id: e.uid, extra: cal.id },
            movable: false,
            holiday: cal.holiday,
            recurring: Boolean(e.rrule),
          });
        }
      }
    }
  }

  if (L.has("sholat") && data.prayerTimes) {
    for (const d of datesBetween(from, to)) {
      const t = data.prayerTimes(d);
      if (!t) continue;
      for (const [k, label] of PRAYER_LABEL) out.push({ key: `s:${d}:${k}`, layer: "sholat", title: label, date: d, start: t[k], end: t[k], color: "laut", ref: { kind: "prayer", id: k, extra: d }, movable: false });
    }
  }
  return out;
}

export const isAllDay = (e: CalEvent) => e.start === undefined;
export const lastDate = (e: CalEvent) => e.endDate ?? e.date;

/** Acara sepanjang hari & acara berjam yang jatuh pada tanggal tertentu, urut waktu. */
export function onDate(events: CalEvent[], date: string): CalEvent[] {
  return events
    .filter((e) => e.date <= date && lastDate(e) >= date)
    .sort((a, b) => Number(!isAllDay(a)) - Number(!isAllDay(b)) || (a.start ?? 0) - (b.start ?? 0) || order(a) - order(b) || a.title.localeCompare(b.title));
}

const LAYER_ORDER: Layer[] = ["luar", "milestone", "proyek", "tugas", "blok", "pengingat", "tercatat", "sholat"];
const order = (e: CalEvent) => LAYER_ORDER.indexOf(e.layer);

export interface Lane {
  event: CalEvent;
  /** Kolom awal & akhir (0..days-1) dalam satu baris minggu */
  from: number;
  to: number;
  row: number;
  /** Bersambung dari minggu sebelumnya / ke minggu berikutnya */
  contL: boolean;
  contR: boolean;
}

/**
 * Susun acara sepanjang hari (dan beberapa hari) dalam satu baris minggu menjadi lajur,
 * supaya batang yang membentang beberapa hari tidak bertumpuk.
 */
export function weekLanes(events: CalEvent[], week: string[]): Lane[] {
  const first = week[0];
  const last = week[week.length - 1];
  const items = events
    .filter((e) => e.date <= last && lastDate(e) >= first)
    .map((e) => {
      const from = e.date < first ? 0 : week.indexOf(e.date);
      const to = lastDate(e) > last ? week.length - 1 : week.indexOf(lastDate(e));
      return { e, from, to };
    })
    .filter((x) => x.from >= 0 && x.to >= 0)
    .sort((a, b) => a.from - b.from || b.to - b.from - (a.to - a.from) || order(a.e) - order(b.e) || (a.e.start ?? -1) - (b.e.start ?? -1));
  const rows: number[] = []; // kolom terakhir terpakai per baris
  return items.map(({ e, from, to }) => {
    let row = rows.findIndex((end) => end < from);
    if (row < 0) {
      row = rows.length;
      rows.push(to);
    } else rows[row] = to;
    return { event: e, from, to, row, contL: e.date < first, contR: lastDate(e) > last };
  });
}

/** Tanggal libur (tanggal merah) dalam rentang. */
export function holidaysIn(events: CalEvent[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of events)
    if (e.holiday) for (const d of datesBetween(e.date, lastDate(e))) m.set(d, [...(m.get(d) ?? []), e.title]);
  return m;
}

/** Geser acara ke tanggal/jam baru: menghasilkan perubahan untuk sumbernya. */
export function shiftDays(date: string, days: number): string {
  return dateKey(addDays(parseDateKey(date), days));
}

export function daysDiff(a: string, b: string): number {
  return Math.round((parseDateKey(b).getTime() - parseDateKey(a).getTime()) / 86400000);
}

export type CalView = "hari" | "minggu" | "bulan" | "agenda" | "tahun";

/** Rentang tanggal yang ditampilkan untuk sebuah tampilan. */
export function viewRange(view: CalView, anchor: string, weekDays = 7): { from: string; to: string; days: string[] } {
  const d = parseDateKey(anchor);
  if (view === "hari") return { from: anchor, to: anchor, days: [anchor] };
  if (view === "minggu") {
    const mon = addDays(d, -((d.getDay() + 6) % 7));
    const days = Array.from({ length: weekDays }, (_, i) => dateKey(addDays(mon, i)));
    return { from: days[0], to: days[days.length - 1], days };
  }
  if (view === "bulan") {
    const first = new Date(d.getFullYear(), d.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, i) => dateKey(addDays(start, i)));
    return { from: days[0], to: days[41], days };
  }
  if (view === "agenda") {
    const days = Array.from({ length: 30 }, (_, i) => dateKey(addDays(d, i)));
    return { from: days[0], to: days[29], days };
  }
  const from = `${d.getFullYear()}-01-01`;
  const to = `${d.getFullYear()}-12-31`;
  return { from, to, days: datesBetween(from, to) };
}

export function shiftAnchor(view: CalView, anchor: string, dir: -1 | 1): string {
  const d = parseDateKey(anchor);
  if (view === "hari") return dateKey(addDays(d, dir));
  if (view === "minggu") return dateKey(addDays(d, 7 * dir));
  if (view === "agenda") return dateKey(addDays(d, 30 * dir));
  if (view === "bulan") return dateKey(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  return dateKey(new Date(d.getFullYear() + dir, d.getMonth(), 1));
}

const fMonth = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const fDayMonth = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });
const fFull = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function viewTitle(view: CalView, anchor: string): string {
  const d = parseDateKey(anchor);
  if (view === "hari") return fFull.format(d);
  if (view === "bulan") return fMonth.format(d);
  if (view === "tahun") return String(d.getFullYear());
  const r = viewRange(view, anchor);
  const a = parseDateKey(r.from);
  const b = parseDateKey(r.to);
  return `${fDayMonth.format(a)} – ${fDayMonth.format(b)} ${b.getFullYear()}`;
}

// ---------- Menggeser acara ----------

/** Blok digeser ke tanggal (dan jam mulai) baru; durasi tetap. */
export function moveBlock(b: Pick<TimeBlock, "date" | "start" | "end">, date: string, start?: number): Pick<TimeBlock, "date" | "start" | "end"> {
  if (start === undefined) return { date, start: b.start, end: b.end };
  const dur = b.end - b.start;
  const s = Math.max(0, Math.min(1440 - dur, start));
  return { date, start: s, end: s + dur };
}

/**
 * Tugas digeser: tenggat pindah ke `date`. Rentang mulai–tenggat ikut bergeser.
 * `start` angka = jadi tugas berjam, `null` = jadi sepanjang hari, undefined = tetap.
 */
export function moveTask(t: Pick<Task, "start" | "due" | "dueTime">, eventDate: string, date: string, start?: number | null): Pick<Task, "start" | "due" | "dueTime"> {
  const delta = daysDiff(eventDate, date);
  const due = t.due ? shiftDays(t.due, delta) : date;
  const out: Pick<Task, "start" | "due" | "dueTime"> = { start: t.start ? shiftDays(t.start, delta) : undefined, due, dueTime: t.dueTime };
  if (start === null) out.dueTime = undefined;
  else if (start !== undefined) {
    out.dueTime = start;
    // Tugas berjam tidak membentang: mulai disamakan dengan tenggat.
    if (out.start && out.start < due) out.start = undefined;
  }
  return out;
}

/** Pengingat sekali jalan pindah tanggal/jam. */
export function moveReminder(dueAt: number, date: string, start?: number): number {
  const old = new Date(dueAt);
  const d = parseDateKey(date);
  const m = start ?? old.getHours() * 60 + old.getMinutes();
  d.setHours(Math.floor(m / 60), m % 60, 0, 0);
  return d.getTime();
}
