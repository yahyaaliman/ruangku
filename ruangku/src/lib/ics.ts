// iCalendar (ICS): baca langganan kalender (mis. Google Calendar, libur nasional)
// dan ekspor jadwal Ruangku ke berkas .ics.
import { addDays, dateKey, parseDateKey } from "./date";

export interface IcsEvent {
  uid: string;
  title: string;
  /** Tanggal mulai lokal YYYY-MM-DD */
  date: string;
  /** Menit sejak 00:00 (tidak ada bila sepanjang hari) */
  start?: number;
  end?: number;
  /** Tanggal selesai inklusif untuk acara beberapa hari */
  endDate?: string;
  allDay: boolean;
  location?: string;
  description?: string;
  rrule?: string;
  exdates?: string[];
  /** Untuk acara berulang: tanggal kejadian ini diganti (RECURRENCE-ID) */
  recurrenceOf?: string;
}

/** Gabungkan baris terlipat dan pecah menjadi [nama, parameter, nilai]. */
function lines(text: string): { name: string; params: Record<string, string>; value: string }[] {
  const raw = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: { name: string; params: Record<string, string>; value: string }[] = [];
  for (const l of raw) {
    const i = l.indexOf(":");
    if (i < 0) continue;
    const head = l.slice(0, i);
    const value = l.slice(i + 1);
    const [name, ...ps] = head.split(";");
    const params: Record<string, string> = {};
    for (const p of ps) {
      const [k, v] = p.split("=");
      if (k) params[k.toUpperCase()] = (v ?? "").replace(/^"|"$/g, "");
    }
    out.push({ name: name.toUpperCase(), params, value });
  }
  return out;
}

const unescape = (s: string) => s.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");

/** Offset (menit) zona waktu IANA pada saat tertentu, relatif ke UTC. */
function tzOffset(tz: string, utcMs: number): number {
  try {
    const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - utcMs) / 60000);
  } catch {
    return -new Date(utcMs).getTimezoneOffset();
  }
}

/** Waktu ICS → Date lokal. Mendukung ...Z (UTC), TZID=..., dan waktu mengambang. */
export function icsTime(value: string, tzid?: string): { date: Date; allDay: boolean } {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return { date: new Date(NaN), allDay: false };
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0))), allDay: false };
  if (tzid) {
    const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0));
    const off = tzOffset(tzid, guess);
    const utc = guess - off * 60000;
    const off2 = tzOffset(tzid, utc);
    return { date: new Date(guess - off2 * 60000), allDay: false };
  }
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)), allDay: false };
}

const minutesOf = (d: Date) => d.getHours() * 60 + d.getMinutes();

export function parseIcs(text: string): IcsEvent[] {
  const out: IcsEvent[] = [];
  let cur: Record<string, { params: Record<string, string>; value: string }[]> | null = null;
  for (const l of lines(text)) {
    if (l.name === "BEGIN" && l.value.toUpperCase() === "VEVENT") cur = {};
    else if (l.name === "END" && l.value.toUpperCase() === "VEVENT" && cur) {
      const get = (k: string) => cur![k]?.[0];
      const st = get("DTSTART");
      if (st && (get("STATUS")?.value ?? "").toUpperCase() !== "CANCELLED") {
        const s = icsTime(st.value, st.params.TZID);
        const allDay = s.allDay || st.params.VALUE === "DATE";
        const en = get("DTEND");
        let e = en ? icsTime(en.value, en.params.TZID) : null;
        const dur = get("DURATION")?.value;
        if (!e && dur) {
          const dm = /P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/.exec(dur);
          if (dm) e = { date: new Date(s.date.getTime() + ((+(dm[1] ?? 0) * 24 + +(dm[2] ?? 0)) * 60 + +(dm[3] ?? 0)) * 60000), allDay };
        }
        if (!Number.isNaN(s.date.getTime())) {
          const ev: IcsEvent = {
            uid: get("UID")?.value ?? `${st.value}-${get("SUMMARY")?.value ?? ""}`,
            title: unescape(get("SUMMARY")?.value ?? "(tanpa judul)"),
            date: dateKey(s.date),
            allDay,
            location: get("LOCATION") ? unescape(get("LOCATION")!.value) : undefined,
            description: get("DESCRIPTION") ? unescape(get("DESCRIPTION")!.value).slice(0, 2000) : undefined,
            rrule: get("RRULE")?.value,
            exdates: (cur["EXDATE"] ?? []).flatMap((x) => x.value.split(",").map((v) => dateKey(icsTime(v, x.params.TZID).date))),
          };
          if (allDay) {
            // DTEND tanggal bersifat eksklusif.
            if (e && !Number.isNaN(e.date.getTime())) {
              const last = dateKey(addDays(e.date, -1));
              if (last > ev.date) ev.endDate = last;
            }
          } else {
            ev.start = minutesOf(s.date);
            const endDate = e && !Number.isNaN(e.date.getTime()) ? e.date : new Date(s.date.getTime() + 3600000);
            ev.end = dateKey(endDate) === ev.date ? Math.max(ev.start + 15, minutesOf(endDate)) : 1440;
            if (dateKey(endDate) > ev.date && minutesOf(endDate) > 0) ev.endDate = dateKey(endDate);
          }
          const rid = get("RECURRENCE-ID");
          if (rid) ev.recurrenceOf = dateKey(icsTime(rid.value, rid.params.TZID).date);
          out.push(ev);
        }
      }
      cur = null;
    } else if (cur) (cur[l.name] ??= []).push({ params: l.params, value: l.value });
  }
  return out;
}

const DAY: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/** Tanggal-tanggal kejadian sebuah acara dalam rentang [from, to] (inklusif). */
export function occurrences(ev: Pick<IcsEvent, "date" | "rrule" | "exdates">, from: string, to: string, limit = 500): string[] {
  if (!ev.rrule) return ev.date >= from && ev.date <= to ? [ev.date] : [];
  const r = Object.fromEntries(ev.rrule.split(";").map((p) => p.split("=") as [string, string]));
  const freq = r.FREQ;
  const interval = Math.max(1, Number(r.INTERVAL ?? 1));
  const count = r.COUNT ? Number(r.COUNT) : Infinity;
  const until = r.UNTIL ? dateKey(icsTime(r.UNTIL).date) : "9999-12-31";
  const byday = r.BYDAY ? r.BYDAY.split(",").map((x) => DAY[x.slice(-2)]).filter((x) => x !== undefined) : null;
  const ex = new Set(ev.exdates ?? []);
  const out: string[] = [];
  const start = parseDateKey(ev.date);
  let n = 0;
  const push = (d: string) => {
    n++;
    if (d >= from && d <= to && !ex.has(d)) out.push(d);
  };
  for (let i = 0; out.length < limit && n < count; i++) {
    let d: Date;
    if (freq === "DAILY") d = addDays(start, i * interval);
    else if (freq === "WEEKLY") {
      if (byday?.length) {
        // Minggu ke-(i) sejak minggu mulai; setiap BYDAY di minggu itu.
        const weekStart = addDays(start, -start.getDay() + i * 7 * interval);
        const days = byday.map((b) => addDays(weekStart, b)).filter((x) => x >= start).sort((a, b) => a.getTime() - b.getTime());
        for (const x of days) {
          const k = dateKey(x);
          if (k > until || n >= count) break;
          push(k);
        }
        if (dateKey(weekStart) > to || dateKey(weekStart) > until) break;
        continue;
      }
      d = addDays(start, i * 7 * interval);
    } else if (freq === "MONTHLY") d = new Date(start.getFullYear(), start.getMonth() + i * interval, start.getDate());
    else if (freq === "YEARLY") d = new Date(start.getFullYear() + i * interval, start.getMonth(), start.getDate());
    else break;
    const k = dateKey(d);
    if (k > until || k > to) break;
    if (freq === "MONTHLY" && d.getDate() !== start.getDate()) continue; // mis. tanggal 31 di bulan pendek
    push(k);
  }
  return out;
}

// ---------- Ekspor ----------

const pad = (n: number) => String(n).padStart(2, "0");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const local = (date: string, min: number) => {
  const d = parseDateKey(date);
  d.setMinutes(min);
  return stamp(d);
};
const dval = (date: string) => date.replace(/-/g, "");

/** Lipat baris > 75 oktet sesuai RFC 5545. */
function fold(line: string): string {
  const out: string[] = [];
  let s = line;
  while (s.length > 74) {
    out.push(s.slice(0, 74));
    s = " " + s.slice(74);
  }
  out.push(s);
  return out.join("\r\n");
}

export interface ExportItem {
  uid: string;
  title: string;
  date: string;
  start?: number;
  end?: number;
  description?: string;
  location?: string;
}

export function toIcs(items: ExportItem[], calName = "Ruangku"): string {
  const now = stamp(new Date());
  const body = items.flatMap((it) => [
    "BEGIN:VEVENT",
    `UID:${it.uid}@ruangku`,
    `DTSTAMP:${now}`,
    ...(it.start === undefined ? [`DTSTART;VALUE=DATE:${dval(it.date)}`, `DTEND;VALUE=DATE:${dval(dateKey(addDays(parseDateKey(it.date), 1)))}`] : [`DTSTART:${local(it.date, it.start)}`, `DTEND:${local(it.date, it.end ?? it.start + 30)}`]),
    `SUMMARY:${esc(it.title)}`,
    ...(it.description ? [`DESCRIPTION:${esc(it.description)}`] : []),
    ...(it.location ? [`LOCATION:${esc(it.location)}`] : []),
    "END:VEVENT",
  ]);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ruangku//ID", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(calName)}`, ...body, "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}

/** URL langganan libur nasional Indonesia (kalender publik Google). */
export const HOLIDAY_ICS = "https://calendar.google.com/calendar/ical/id.indonesian%23holiday%40group.v.calendar.google.com/public/basic.ics";
