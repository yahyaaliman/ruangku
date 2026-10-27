// Model data ibadah: definisi amalan, target default (sempurna), konfigurasi,
// log harian, dan perhitungan skor/konsistensi.
import type { Item } from "./types";
import { fastingKinds, FastKind, isRamadan, Offsets, NO_OFFSETS } from "./prayer";
import { addDays, dateKey, parseDateKey } from "./date";

export const IBADAH_CONFIG_ID = "ibadah-config";
export const logId = (date: string) => `ibadah:${date}`;

export type PrayerKey = "subuh" | "dzuhur" | "ashar" | "maghrib" | "isya";
export const PRAYERS: { id: PrayerKey; label: string }[] = [
  { id: "subuh", label: "Subuh" },
  { id: "dzuhur", label: "Dzuhur" },
  { id: "ashar", label: "Ashar" },
  { id: "maghrib", label: "Maghrib" },
  { id: "isya", label: "Isya" },
];

export type PrayerStatus = "masjid" | "jamaah" | "awal" | "sendiri" | "qadha" | "terlewat";
export const STATUS: { id: PrayerStatus; label: string; short: string; level: number }[] = [
  { id: "masjid", label: "Berjamaah di masjid", short: "Masjid", level: 5 },
  { id: "jamaah", label: "Berjamaah", short: "Jamaah", level: 4 },
  { id: "awal", label: "Sendiri, awal waktu", short: "Awal waktu", level: 3 },
  { id: "sendiri", label: "Sendiri, dalam waktu", short: "Sendiri", level: 2 },
  { id: "qadha", label: "Qadha", short: "Qadha", level: 1 },
  { id: "terlewat", label: "Terlewat", short: "Terlewat", level: 0 },
];
export const statusLevel = (s?: PrayerStatus) => STATUS.find((x) => x.id === s)?.level ?? 0;

/** "masjid" = sempurna bila berjamaah di masjid; "awal" = sempurna bila awal waktu (sendiri/berjamaah). */
export type PrayerTarget = "masjid" | "awal";
export const targetLevel = (t: PrayerTarget) => (t === "awal" ? 3 : 5);

export type Group = "rawatib" | "sholat" | "dzikir" | "quran" | "puasa" | "amal" | "ramadan";
export const GROUP_LABEL: Record<Group, string> = {
  rawatib: "Sholat rawatib",
  sholat: "Sholat sunnah",
  dzikir: "Dzikir",
  quran: "Al-Qur'an",
  puasa: "Puasa",
  amal: "Amal & ilmu",
  ramadan: "Ramadan",
};

export interface ItemDef {
  id: string;
  label: string;
  group: Group;
  /** check = dikerjakan/tidak; count = jumlah dengan target */
  kind: "check" | "count";
  unit?: string;
  target: number; // target default = sempurna
  step?: number;
  hint?: string;
  /** Termasuk sholat/puasa yang gugur saat udzur haid/nifas. */
  udzur?: boolean;
  /** Hanya berlaku pada hari tertentu. */
  fast?: FastKind;
  ramadanOnly?: boolean;
}

export const ITEMS: ItemDef[] = [
  { id: "qabliyah_subuh", label: "Qabliyah Subuh", group: "rawatib", kind: "check", target: 1, hint: "2 rakaat", udzur: true },
  { id: "qabliyah_dzuhur", label: "Qabliyah Dzuhur", group: "rawatib", kind: "check", target: 1, hint: "4 rakaat", udzur: true },
  { id: "badiyah_dzuhur", label: "Ba'diyah Dzuhur", group: "rawatib", kind: "check", target: 1, hint: "2 rakaat", udzur: true },
  { id: "badiyah_maghrib", label: "Ba'diyah Maghrib", group: "rawatib", kind: "check", target: 1, hint: "2 rakaat", udzur: true },
  { id: "badiyah_isya", label: "Ba'diyah Isya", group: "rawatib", kind: "check", target: 1, hint: "2 rakaat", udzur: true },
  { id: "dhuha", label: "Dhuha", group: "sholat", kind: "count", unit: "rakaat", target: 8, step: 2, udzur: true },
  { id: "tahajud", label: "Tahajud", group: "sholat", kind: "count", unit: "rakaat", target: 8, step: 2, udzur: true },
  { id: "witir", label: "Witir", group: "sholat", kind: "count", unit: "rakaat", target: 3, step: 1, udzur: true },
  { id: "dzikir_pagi", label: "Dzikir pagi", group: "dzikir", kind: "check", target: 1 },
  { id: "dzikir_petang", label: "Dzikir petang", group: "dzikir", kind: "check", target: 1 },
  { id: "istighfar", label: "Istighfar", group: "dzikir", kind: "count", unit: "kali", target: 100, step: 33 },
  { id: "sholawat", label: "Sholawat", group: "dzikir", kind: "count", unit: "kali", target: 100, step: 33 },
  { id: "tilawah", label: "Tilawah", group: "quran", kind: "count", unit: "halaman", target: 20, step: 1, hint: "20 halaman = 1 juz" },
  { id: "puasa_senin_kamis", label: "Puasa Senin-Kamis", group: "puasa", kind: "check", target: 1, fast: "puasa_senin_kamis", udzur: true },
  { id: "puasa_ayyamul_bidh", label: "Puasa Ayyamul Bidh", group: "puasa", kind: "check", target: 1, fast: "puasa_ayyamul_bidh", hint: "13, 14, 15 Hijriah", udzur: true },
  { id: "puasa_arafah", label: "Puasa Arafah", group: "puasa", kind: "check", target: 1, fast: "puasa_arafah", udzur: true },
  { id: "puasa_asyura", label: "Puasa Tasu'a/Asyura", group: "puasa", kind: "check", target: 1, fast: "puasa_asyura", udzur: true },
  { id: "puasa_ramadan", label: "Puasa Ramadan", group: "ramadan", kind: "check", target: 1, fast: "puasa_ramadan", udzur: true },
  { id: "tarawih", label: "Tarawih", group: "ramadan", kind: "count", unit: "rakaat", target: 8, step: 2, ramadanOnly: true, udzur: true },
  { id: "sedekah", label: "Sedekah", group: "amal", kind: "check", target: 1 },
  { id: "kajian", label: "Kajian / belajar ilmu", group: "amal", kind: "check", target: 1 },
];
export const itemDef = (id: string) => ITEMS.find((i) => i.id === id);

export interface IbadahReminders {
  enabled: boolean;
  prayerBefore: number;
  prayerAtTime: boolean;
  fasting: boolean;
  sahurBeforeImsak: number;
  dhuha: boolean;
  tahajud: boolean;
  dzikir: boolean;
  tilawah: boolean;
  muteDuringUdzur: boolean;
}

export interface IbadahConfig {
  setup: boolean;
  city: string;
  lat: number;
  lng: number;
  tz: number;
  elevation: number;
  offsets: Offsets;
  hijriOffset: number;
  prayerTarget: PrayerTarget;
  items: Record<string, { on: boolean; target?: number }>;
  reminders: IbadahReminders;
  udzurActive: boolean;
  udzurSince?: string;
}

export const DEFAULT_CONFIG: IbadahConfig = {
  setup: false,
  city: "",
  lat: 0,
  lng: 0,
  tz: 7,
  elevation: 0,
  offsets: NO_OFFSETS,
  hijriOffset: 0,
  prayerTarget: "masjid",
  items: {},
  reminders: {
    enabled: true,
    prayerBefore: 10,
    prayerAtTime: true,
    fasting: true,
    sahurBeforeImsak: 45,
    dhuha: true,
    tahajud: true,
    dzikir: true,
    tilawah: true,
    muteDuringUdzur: true,
  },
  udzurActive: false,
};

export function normalizeConfig(raw: unknown): IbadahConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<IbadahConfig>;
  return {
    ...DEFAULT_CONFIG,
    ...r,
    offsets: { ...NO_OFFSETS, ...(r.offsets ?? {}) },
    reminders: { ...DEFAULT_CONFIG.reminders, ...(r.reminders ?? {}) },
    items: { ...(r.items ?? {}) },
    prayerTarget: r.prayerTarget === "awal" ? "awal" : "masjid",
  };
}

export const itemOn = (c: IbadahConfig, id: string) => c.items[id]?.on ?? true;
export const itemTarget = (c: IbadahConfig, d: ItemDef) => c.items[d.id]?.target ?? d.target;

export interface IbadahLog {
  date: string;
  prayers: Partial<Record<PrayerKey, PrayerStatus>>;
  items: Record<string, number>;
  udzur?: boolean;
  muhasabah?: string;
}

export const emptyLog = (date: string): IbadahLog => ({ date, prayers: {}, items: {} });

/** Apakah tanggal ini termasuk masa udzur (dari log, atau sedang aktif sejak tanggal tertentu). */
export function isUdzur(c: IbadahConfig, log: IbadahLog | undefined, date: string): boolean {
  if (log?.udzur !== undefined) return log.udzur;
  return c.udzurActive && !!c.udzurSince && date >= c.udzurSince && date <= dateKey();
}

/** Amalan yang berlaku pada tanggal ini (sudah memperhitungkan puasa, Ramadan, udzur, dan pilihan aktif). */
export function applicableItems(c: IbadahConfig, date: string, udzur: boolean): ItemDef[] {
  const fasts = fastingKinds(date, c.hijriOffset);
  const ramadan = isRamadan(date, c.hijriOffset);
  return ITEMS.filter((d) => {
    if (!itemOn(c, d.id)) return false;
    if (d.fast && !fasts.includes(d.fast)) return false;
    if (d.ramadanOnly && !ramadan) return false;
    if (udzur && d.udzur) return false;
    return true;
  });
}

export interface DayScore {
  wajib: number | null; // 0..1, null saat udzur
  sunnah: number | null; // 0..1, null bila tidak ada amalan sunnah
  total: number | null;
  prayersLogged: number;
  perfectPrayers: number;
  sunnahDone: number;
  sunnahTotal: number;
}

export function dayScore(c: IbadahConfig, log: IbadahLog | undefined, date: string): DayScore {
  const udzur = isUdzur(c, log, date);
  const tl = targetLevel(c.prayerTarget);
  const lv = PRAYERS.map((p) => statusLevel(log?.prayers[p.id]));
  const logged = PRAYERS.filter((p) => log?.prayers[p.id]).length;
  const wajib = udzur ? null : lv.reduce((s, l) => s + Math.min(1, l / tl), 0) / PRAYERS.length;
  const items = applicableItems(c, date, udzur).filter((d) => d.group !== "ramadan" || d.id !== "puasa_ramadan");
  const ramadanFast = applicableItems(c, date, udzur).find((d) => d.id === "puasa_ramadan");
  const ach = items.map((d) => Math.min(1, (log?.items[d.id] ?? 0) / itemTarget(c, d)));
  const sunnah = ach.length ? ach.reduce((a, b) => a + b, 0) / ach.length : null;
  // Puasa Ramadan wajib: digabung ke porsi wajib.
  let w = wajib;
  if (w !== null && ramadanFast) w = (w * 5 + Math.min(1, (log?.items.puasa_ramadan ?? 0) / 1)) / 6;
  const total = w === null ? sunnah : sunnah === null ? w : w * 0.6 + sunnah * 0.4;
  return {
    wajib: w,
    sunnah,
    total,
    prayersLogged: logged,
    perfectPrayers: lv.filter((l) => l >= tl).length,
    sunnahDone: ach.filter((a) => a >= 1).length,
    sunnahTotal: ach.length,
  };
}

/** Ringkasan konsistensi untuk rentang tanggal (evaluasi mingguan/bulanan). */
export function rangeSummary(c: IbadahConfig, logs: Item<IbadahLog>[], dates: string[]) {
  const byDate = new Map(logs.map((l) => [l.date, l]));
  const perPrayer = PRAYERS.map((p) => {
    let perfect = 0;
    let done = 0;
    let days = 0;
    for (const d of dates) {
      const log = byDate.get(d);
      if (isUdzur(c, log, d)) continue;
      days++;
      const l = statusLevel(log?.prayers[p.id]);
      if (l >= targetLevel(c.prayerTarget)) perfect++;
      if (l >= 2) done++;
    }
    return { id: p.id, label: p.label, perfect, done, days };
  });
  const perItem = new Map<string, { done: number; days: number }>();
  const scores: { date: string; score: number | null }[] = [];
  for (const d of dates) {
    const log = byDate.get(d);
    const udz = isUdzur(c, log, d);
    for (const it of applicableItems(c, d, udz)) {
      const e = perItem.get(it.id) ?? { done: 0, days: 0 };
      e.days++;
      if ((log?.items[it.id] ?? 0) >= itemTarget(c, it)) e.done++;
      perItem.set(it.id, e);
    }
    scores.push({ date: d, score: log ? dayScore(c, log, d).total : null });
  }
  const filled = scores.filter((s) => s.score !== null) as { date: string; score: number }[];
  return {
    perPrayer,
    perItem: [...perItem.entries()].map(([id, v]) => ({ id, label: itemDef(id)?.label ?? id, ...v })),
    scores,
    average: filled.length ? filled.reduce((s, x) => s + x.score, 0) / filled.length : null,
    loggedDays: filled.length,
  };
}

export function datesBetween(start: string, days: number): string[] {
  const s = parseDateKey(start);
  return Array.from({ length: days }, (_, i) => dateKey(addDays(s, i)));
}
