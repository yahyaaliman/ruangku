import type { Item, KeyResult, Kpi, KpiEntry } from "./types";
import { addDays, dateKey, parseDateKey } from "./date";

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Progres key result 0..1. Bekerja untuk target naik maupun turun (start > target). */
export function krProgress(kr: Pick<KeyResult, "start" | "target" | "current">): number {
  const span = kr.target - kr.start;
  if (span === 0) return kr.current === kr.target ? 1 : 0;
  return clamp01((kr.current - kr.start) / span);
}

/** Progres objective = rata-rata progres key result-nya. */
export function objectiveProgress(krs: Pick<KeyResult, "start" | "target" | "current">[]): number {
  if (krs.length === 0) return 0;
  return krs.reduce((s, k) => s + krProgress(k), 0) / krs.length;
}

export type Health = "aman" | "waspada" | "tertinggal";

/** Bandingkan progres dengan waktu kuartal yang sudah berjalan. */
export function okrHealth(progress: number, elapsed: number): Health {
  if (elapsed < 0.1 || progress >= elapsed - 0.1) return "aman";
  if (progress >= elapsed - 0.25) return "waspada";
  return "tertinggal";
}

/** Capaian KPI untuk satu nilai: 1 = tepat target. Bisa > 1 untuk KPI naik. */
export function kpiAchievement(kpi: Pick<Kpi, "target" | "direction">, value: number): number {
  if (kpi.direction === "naik") return kpi.target === 0 ? 1 : value / kpi.target;
  // KPI turun: di bawah atau sama dengan target berarti tercapai.
  if (value <= kpi.target) return 1;
  return value === 0 ? 1 : kpi.target / value;
}

export function kpiMet(kpi: Pick<Kpi, "target" | "direction">, value: number): boolean {
  return kpi.direction === "naik" ? value >= kpi.target : value <= kpi.target;
}

/** Peta tanggal -> nilai untuk satu KPI. */
export function entriesByDate(entries: Item<KpiEntry>[], kpiId: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) if (e.kpiId === kpiId) m.set(e.date, e.value);
  return m;
}

/** Deret nilai `days` hari terakhir sampai `end` (null jika belum diisi). */
export function series(map: Map<string, number>, days: number, end: string = dateKey()): { date: string; value: number | null }[] {
  const endD = parseDateKey(end);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dateKey(addDays(endD, -i));
    out.push({ date: k, value: map.has(k) ? map.get(k)! : null });
  }
  return out;
}

/** Berapa hari berturut-turut target tercapai, dihitung mundur dari `end`.
 *  Hari ini yang belum diisi tidak memutus streak. */
export function streak(kpi: Pick<Kpi, "target" | "direction">, map: Map<string, number>, end: string = dateKey()): number {
  let d = parseDateKey(end);
  if (!map.has(end)) d = addDays(d, -1);
  let n = 0;
  for (;;) {
    const v = map.get(dateKey(d));
    if (v === undefined || !kpiMet(kpi, v)) return n;
    n++;
    d = addDays(d, -1);
  }
}

/** Persentase hari tercapai dari hari yang terisi di jendela waktu. */
export function hitRate(kpi: Pick<Kpi, "target" | "direction">, values: (number | null)[]): number | null {
  const filled = values.filter((v): v is number => v !== null);
  if (filled.length === 0) return null;
  return filled.filter((v) => kpiMet(kpi, v)).length / filled.length;
}

export function average(values: (number | null)[]): number | null {
  const filled = values.filter((v): v is number => v !== null);
  return filled.length ? filled.reduce((a, b) => a + b, 0) / filled.length : null;
}

export function formatNumber(n: number, maxFrac = 1): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: maxFrac }).format(n);
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let v = b / 1024;
  let i = 0;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${formatNumber(v, v < 10 ? 1 : 0)} ${u[i]}`;
}
