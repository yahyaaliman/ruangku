const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-26" dalam zona waktu lokal. */
export function dateKey(d: Date | number = new Date()): string {
  const x = typeof d === "number" ? new Date(d) : d;
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
}

export function parseDateKey(k: string): Date {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfDay(d: Date | number = new Date()): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

export function sameDay(a: number, b: number): boolean {
  return dateKey(a) === dateKey(b);
}

const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", o);
const fTime = fmt({ hour: "2-digit", minute: "2-digit", hour12: false });
const fDayLong = fmt({ weekday: "long", day: "numeric", month: "long" });
const fDayShort = fmt({ weekday: "short", day: "numeric", month: "short" });
const fDate = fmt({ day: "numeric", month: "short", year: "numeric" });
const fWeekday = fmt({ weekday: "long" });

export const time = (ms: number) => fTime.format(ms).replace(".", ":");
export const dayLong = (ms: number) => fDayLong.format(ms);
export const dayShort = (ms: number) => fDayShort.format(ms);
export const dateShort = (ms: number) => fDate.format(ms);
export const weekday = (ms: number) => fWeekday.format(ms);

/** "Hari ini", "Besok", "Kemarin", atau tanggal pendek. */
export function relativeDay(ms: number, now = Date.now()): string {
  const diff = Math.round((startOfDay(ms) - startOfDay(now)) / 86400000);
  if (diff === 0) return "Hari ini";
  if (diff === 1) return "Besok";
  if (diff === -1) return "Kemarin";
  if (diff > 1 && diff < 7) return weekday(ms);
  return dateShort(ms);
}

export function relativeAgo(ms: number, now = Date.now()): string {
  const s = Math.round((now - ms) / 1000);
  if (s < 60) return "baru saja";
  if (s < 3600) return `${Math.floor(s / 60)} menit lalu`;
  if (s < 86400) return `${Math.floor(s / 3600)} jam lalu`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} hari lalu`;
  return dateShort(ms);
}

/** Nilai untuk <input type="datetime-local">. */
export function toInputDateTime(ms: number): string {
  const d = new Date(ms);
  return `${dateKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputDateTime(v: string): number {
  return new Date(v).getTime();
}

/** Periode kuartal, contoh "2026-Q4". */
export function quarterOf(d: Date = new Date()): string {
  return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
}

export function quarterLabel(p: string): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(p);
  return m ? `Kuartal ${m[2]} ${m[1]}` : p;
}

export function shiftQuarter(p: string, n: number): string {
  const m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (!m) return p;
  const idx = Number(m[1]) * 4 + Number(m[2]) - 1 + n;
  return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
}

/** Fraksi waktu kuartal yang sudah berlalu (0..1). */
export function quarterElapsed(p: string, now = new Date()): number {
  const m = /^(\d{4})-Q([1-4])$/.exec(p);
  if (!m) return 0;
  const start = new Date(Number(m[1]), (Number(m[2]) - 1) * 3, 1).getTime();
  const end = new Date(Number(m[1]), Number(m[2]) * 3, 1).getTime();
  return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}
