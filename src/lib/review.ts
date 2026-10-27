// Evaluasi harian, mingguan, bulanan: ringkasan otomatis dari data yang ada.
import type { BlockColor, Item, KeyResult, Kpi, KpiEntry, Objective, Reminder, TimeBlock } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";
import { kpiMet, krProgress } from "./metrics";
import { dayScore, IbadahConfig, IbadahLog, rangeSummary } from "./ibadah";

export type ReviewType = "day" | "week" | "month";

export interface Review {
  type: ReviewType;
  key: string; // day: YYYY-MM-DD, week: tanggal Senin, month: YYYY-MM
  energy?: number; // 1..5
  mood?: number; // 1..5
  answers: Record<string, string>;
  targets?: string[];
}

export const reviewId = (type: ReviewType, key: string) => `${type}:${key}`;

export const QUESTIONS: Record<ReviewType, { id: string; label: string; placeholder: string }[]> = {
  day: [
    { id: "good", label: "Apa yang berjalan baik hari ini?", placeholder: "Satu atau dua hal yang disyukuri atau berhasil" },
    { id: "obstacle", label: "Apa yang menghambat?", placeholder: "Gangguan, rapat mendadak, kurang tidur…" },
    { id: "tomorrow", label: "Satu prioritas utama besok", placeholder: "Contoh: selesaikan draf proposal" },
  ],
  week: [
    { id: "wins", label: "Pencapaian terbesar minggu ini", placeholder: "Apa yang paling membanggakan?" },
    { id: "lesson", label: "Pelajaran dan yang perlu diperbaiki", placeholder: "Pola yang terlihat dari hambatan harian" },
  ],
  month: [
    { id: "wins", label: "Pencapaian bulan ini", placeholder: "Hasil yang paling berarti" },
    { id: "lesson", label: "Pelajaran utama", placeholder: "Apa yang ingin dibawa ke bulan depan?" },
    { id: "focus", label: "Fokus utama bulan depan", placeholder: "Satu tema besar" },
  ],
};

// ---------- Periode ----------

export function weekStart(date: string): string {
  const d = parseDateKey(date);
  return dateKey(addDays(d, -((d.getDay() + 6) % 7)));
}

export function periodDates(type: ReviewType, key: string): string[] {
  if (type === "day") return [key];
  if (type === "week") return Array.from({ length: 7 }, (_, i) => dateKey(addDays(parseDateKey(key), i)));
  const [y, m] = key.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => dateKey(new Date(y, m - 1, i + 1)));
}

export function periodKey(type: ReviewType, date: string): string {
  return type === "day" ? date : type === "week" ? weekStart(date) : date.slice(0, 7);
}

export function shiftPeriod(type: ReviewType, key: string, n: number): string {
  if (type === "day") return dateKey(addDays(parseDateKey(key), n));
  if (type === "week") return dateKey(addDays(parseDateKey(key), 7 * n));
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

export function periodLabel(type: ReviewType, key: string): string {
  if (type === "month") {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }
  const d = parseDateKey(key);
  if (type === "day") return `${d.getDate()} ${SHORT[d.getMonth()]} ${d.getFullYear()}`;
  const e = addDays(d, 6);
  return `${d.getDate()} ${SHORT[d.getMonth()]} – ${e.getDate()} ${SHORT[e.getMonth()]} ${e.getFullYear()}`;
}

// ---------- Ringkasan ----------

export interface Data {
  blocks: Item<TimeBlock>[];
  reminders: Item<Reminder>[];
  kpis: Item<Kpi>[];
  entries: Item<KpiEntry>[];
  objectives: Item<Objective>[];
  krs: Item<KeyResult>[];
  ibadahConfig: IbadahConfig;
  ibadahLogs: Item<IbadahLog>[];
  reviews: Item<Review>[];
  tasks?: Item<import("./tasks").Task>[];
  projects?: Item<import("./tasks").Project>[];
}

export interface DayRow {
  date: string;
  planned: number;
  done: number;
  activity: number | null; // done/planned
  kpi: number | null; // bagian KPI tercapai dari yang diisi
  ibadah: number | null;
  energy?: number;
}

export interface Stats {
  days: DayRow[];
  planned: number;
  done: number;
  byColor: { color: BlockColor; minutes: number }[];
  remindersDue: number;
  remindersDone: number;
  kpi: { id: string; name: string; filled: number; met: number; days: number }[];
  kpiRate: number | null;
  checkIns: number;
  okr: { id: string; title: string; delta: number; progress: number }[];
  ibadah: ReturnType<typeof rangeSummary>;
  energyAvg: number | null;
  moodAvg: number | null;
  notes: { date: string; good?: string; obstacle?: string; tomorrow?: string }[];
  tracked: number;
  trackedByProject: { id: string; name: string; color: BlockColor; minutes: number }[];
  tasksDone: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Nilai key result pada akhir tanggal `date` menurut riwayat check-in. */
function krValueAt(kr: KeyResult, endMs: number): number {
  const hist = (kr.history ?? []).filter((h) => h.at <= endMs).sort((a, b) => a.at - b.at);
  if (hist.length) return hist[hist.length - 1].value;
  // Tanpa riwayat sebelum tanggal ini: nilai awal bila ada check-in sesudahnya, nilai saat ini bila tidak ada riwayat sama sekali.
  return kr.history?.length ? kr.start : kr.current;
}

/** `today`: hari setelah tanggal ini belum terjadi, jadi tidak dihitung (tampil kosong). */
export function computeStats(allDates: string[], d: Data, today: string = dateKey()): Stats {
  const dates = allDates.filter((x) => x <= today);
  if (dates.length === 0) dates.push(allDates[0]);
  const set = new Set(dates);
  const first = dates[0];
  const startMs = parseDateKey(first).getTime();
  const endMs = addDays(parseDateKey(dates[dates.length - 1]), 1).getTime() - 1;

  const blocks = d.blocks.filter((b) => set.has(b.date));
  const colorMin = new Map<BlockColor, number>();
  for (const b of blocks) colorMin.set(b.color ?? "nila", (colorMin.get(b.color ?? "nila") ?? 0) + (b.end - b.start));

  const remDue = d.reminders.filter((r) => r.repeat === "none" && r.dueAt >= startMs && r.dueAt <= endMs);

  const activeKpis = d.kpis.filter((k) => !k.archived);
  const kpi = activeKpis.map((k) => {
    const es = d.entries.filter((e) => e.kpiId === k.id && set.has(e.date));
    return { id: k.id, name: k.name, filled: es.length, met: es.filter((e) => kpiMet(k, e.value)).length, days: dates.length };
  });
  const filledTotal = kpi.reduce((s, k) => s + k.filled, 0);

  const checkIns = d.krs.reduce((s, kr) => s + (kr.history ?? []).filter((h) => h.at >= startMs && h.at <= endMs).length, 0);
  const okr = d.objectives
    .filter((o) => !o.archived)
    .map((o) => {
      const ks = d.krs.filter((k) => k.objectiveId === o.id);
      if (!ks.length) return null;
      const before = ks.reduce((s, k) => s + krProgress({ ...k, current: krValueAt(k, startMs - 1) }), 0) / ks.length;
      const after = ks.reduce((s, k) => s + krProgress({ ...k, current: krValueAt(k, endMs) }), 0) / ks.length;
      return { id: o.id, title: o.title, delta: after - before, progress: after };
    })
    .filter((x): x is { id: string; title: string; delta: number; progress: number } => !!x && (x.delta !== 0 || dates.length > 1));

  const dayReviews = new Map(d.reviews.filter((r) => r.type === "day" && set.has(r.key)).map((r) => [r.key, r]));
  const ibLogs = new Map(d.ibadahLogs.map((l) => [l.date, l]));

  const days: DayRow[] = allDates.map((date) => {
    if (date > today) return { date, planned: 0, done: 0, activity: null, kpi: null, ibadah: null };
    const bs = blocks.filter((b) => b.date === date);
    const planned = bs.reduce((s, b) => s + b.end - b.start, 0);
    const done = bs.filter((b) => b.done).reduce((s, b) => s + b.end - b.start, 0);
    const es = d.entries.filter((e) => e.date === date);
    const met = es.filter((e) => {
      const k = activeKpis.find((x) => x.id === e.kpiId);
      return k && kpiMet(k, e.value);
    }).length;
    const log = ibLogs.get(date);
    return {
      date,
      planned,
      done,
      activity: planned ? done / planned : null,
      kpi: es.length ? met / es.length : null,
      ibadah: d.ibadahConfig.setup && log ? dayScore(d.ibadahConfig, log, date).total : null,
      energy: dayReviews.get(date)?.energy,
    };
  });

  const revs = [...dayReviews.values()].sort((a, b) => a.key.localeCompare(b.key));
  const trackedBlocks = blocks.filter((b) => b.tracked);
  const byProj = new Map<string, number>();
  for (const b of trackedBlocks) {
    const task = d.tasks?.find((t) => t.id === b.taskId);
    const pid = task?.projectId ?? "lain";
    byProj.set(pid, (byProj.get(pid) ?? 0) + b.end - b.start);
  }
  const trackedByProject = [...byProj.entries()]
    .map(([id, minutes]) => {
      const p = d.projects?.find((x) => x.id === id);
      return { id, name: p?.name ?? (id === "inbox" ? "Inbox" : "Tanpa tugas"), color: (p?.color ?? "abu") as BlockColor, minutes };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const tasksDone = (d.tasks ?? []).filter((t) => t.completedAt && t.completedAt >= startMs && t.completedAt <= endMs).length;
  return {
    days,
    planned: days.reduce((s, x) => s + x.planned, 0),
    done: days.reduce((s, x) => s + x.done, 0),
    byColor: [...colorMin.entries()].map(([color, minutes]) => ({ color, minutes })).sort((a, b) => b.minutes - a.minutes),
    remindersDue: remDue.length,
    remindersDone: remDue.filter((r) => r.done).length,
    kpi,
    kpiRate: filledTotal ? kpi.reduce((s, k) => s + k.met, 0) / filledTotal : null,
    checkIns,
    okr,
    ibadah: rangeSummary(d.ibadahConfig, d.ibadahLogs, dates),
    energyAvg: avg(revs.map((r) => r.energy).filter((x): x is number => !!x)),
    moodAvg: avg(revs.map((r) => r.mood).filter((x): x is number => !!x)),
    notes: revs
      .filter((r) => r.answers.good || r.answers.obstacle || r.answers.tomorrow)
      .map((r) => ({ date: r.key, good: r.answers.good, obstacle: r.answers.obstacle, tomorrow: r.answers.tomorrow })),
    tracked: trackedBlocks.reduce((s, b) => s + b.end - b.start, 0),
    trackedByProject,
    tasksDone,
  };
}
