// Statistik per proyek untuk diagram evaluasi: waktu tercatat, tugas selesai,
// KPI tercapai, dan progres OKR per hari, dikelompokkan per proyek/subproyek.
import type { BlockColor, Item, KeyResult, Kpi, KpiEntry, Objective, TimeBlock } from "./types";
import { dateKey } from "./date";
import { INBOX_ID, Project, Task } from "./tasks";
import { blockProject, childrenOf, subtreeIds } from "./projects";
import { kpiMet, krProgress } from "./metrics";
import type { Data } from "./review";

export type Metric = "waktu" | "tugas" | "kpi" | "okr";
export const METRICS: { id: Metric; label: string; unit: string; sum: boolean }[] = [
  { id: "waktu", label: "Waktu tercatat", unit: "jam", sum: true },
  { id: "tugas", label: "Tugas selesai", unit: "tugas", sum: true },
  { id: "kpi", label: "KPI tercapai", unit: "%", sum: false },
  { id: "okr", label: "Progres OKR", unit: "%", sum: false },
];

export interface Group {
  id: string;
  label: string;
  icon?: string;
  color: BlockColor;
  ids: Set<string>;
}

export interface Series {
  id: string;
  label: string;
  icon?: string;
  color: BlockColor;
  /** Nilai per tanggal; null = tidak ada data hari itu. */
  values: (number | null)[];
  /** Total (jumlah) atau rata-rata periode, sesuai metrik. */
  total: number | null;
}

/** Kelompok yang dibandingkan: semua proyek utama, atau subproyek dari proyek terpilih. */
export function groupsFor(projects: Item<Project>[], selected: string): Group[] {
  const live = projects.filter((p) => !p.archived && p.id !== INBOX_ID);
  if (selected === "all") {
    return childrenOf(live, undefined).map((p) => ({ id: p.id, label: p.name, icon: p.icon, color: p.color, ids: subtreeIds(live, p.id) }));
  }
  const root = live.find((p) => p.id === selected);
  if (!root) return [];
  const kids = childrenOf(live, root.id);
  if (!kids.length) return [{ id: root.id, label: root.name, icon: root.icon, color: root.color, ids: new Set([root.id]) }];
  return [
    ...kids.map((p) => ({ id: p.id, label: p.name, icon: p.icon, color: p.color, ids: subtreeIds(live, p.id) })),
    { id: `${root.id}:langsung`, label: `${root.name} (umum)`, icon: root.icon, color: root.color, ids: new Set([root.id]) },
  ];
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nilai KR pada akhir tanggal tertentu dari riwayat check-in. */
export function krValueAt(kr: Pick<KeyResult, "start" | "current" | "history">, date: string): number {
  const hist = [...(kr.history ?? [])].sort((a, b) => a.at - b.at);
  if (!hist.length) return kr.current;
  let v = kr.start;
  for (const h of hist) if (dateKey(h.at) <= date) v = h.value;
  return v;
}

export function seriesFor(metric: Metric, groups: Group[], dates: string[], data: Pick<Data, "blocks" | "kpis" | "entries" | "objectives" | "krs" | "tasks" | "projects">, today = dateKey()): Series[] {
  const tasks = (data.tasks ?? []) as Item<Task>[];
  return groups
    .map((g) => {
      let values: (number | null)[] = [];
      let total: number | null = null;
      if (metric === "waktu") {
        values = dates.map((d) => {
          const m = data.blocks.filter((b: Item<TimeBlock>) => b.tracked && b.date === d && g.ids.has(blockProject(b, tasks) ?? "")).reduce((s, b) => s + b.end - b.start, 0);
          return d > today ? null : round1(m / 60);
        });
        total = round1(values.reduce<number>((s, v) => s + (v ?? 0), 0));
      } else if (metric === "tugas") {
        values = dates.map((d) => (d > today ? null : tasks.filter((t) => g.ids.has(t.projectId) && t.completedAt && dateKey(t.completedAt) === d).length));
        total = values.reduce<number>((s, v) => s + (v ?? 0), 0);
      } else if (metric === "kpi") {
        const kpis = data.kpis.filter((k: Item<Kpi>) => !k.archived && k.projectId && g.ids.has(k.projectId));
        let met = 0;
        let filled = 0;
        values = dates.map((d) => {
          const es = kpis.map((k) => ({ k, e: data.entries.find((e: Item<KpiEntry>) => e.kpiId === k.id && e.date === d) })).filter((x) => x.e);
          if (!es.length) return null;
          const m = es.filter((x) => kpiMet(x.k, x.e!.value)).length;
          met += m;
          filled += es.length;
          return Math.round((m / es.length) * 100);
        });
        total = filled ? Math.round((met / filled) * 100) : null;
      } else {
        const objs = data.objectives.filter((o: Item<Objective>) => !o.archived && o.projectId && g.ids.has(o.projectId));
        const krs = data.krs.filter((k: Item<KeyResult>) => objs.some((o) => o.id === k.objectiveId));
        values = dates.map((d) => {
          if (d > today || !krs.length) return null;
          const avg = krs.reduce((s, k) => s + krProgress({ ...k, current: krValueAt(k, d) }), 0) / krs.length;
          return Math.round(avg * 100);
        });
        total = krs.length ? Math.round((krs.reduce((s, k) => s + krProgress(k), 0) / krs.length) * 100) : null;
      }
      return { id: g.id, label: g.label, icon: g.icon, color: g.color, values, total };
    })
    .filter((s) => s.total !== null && (METRICS.find((m) => m.id === metric)!.sum ? s.total > 0 : true));
}

// ---------- Warna diagram ----------
// Warna proyek aplikasi dipetakan ke palet kategorikal yang lolos uji buta warna
// (keluarga warnanya sama, sehingga identitas proyek tetap terbaca).
const CHART: Record<BlockColor, [string, string]> = {
  nila: ["#2a78d6", "#3987e5"],
  kopi: ["#eb6834", "#d95926"],
  laut: ["#1baf7a", "#199e70"],
  kunyit: ["#eda100", "#c98500"],
  jambu: ["#e87ba4", "#d55181"],
  daun: ["#008300", "#008300"],
  ungu: ["#6250d6", "#9085e9"],
  bata: ["#e34948", "#e66767"],
  abu: ["#8a93a6", "#828ba0"],
};
const ORDER: BlockColor[] = ["nila", "kopi", "laut", "kunyit", "jambu", "daun", "ungu", "bata"];

/** Warna kunci per seri. Seri dengan warna proyek sama mendapat slot berikutnya (urutan tetap, bukan peringkat nilai). */
export function chartColors(series: Pick<Series, "id" | "color">[]): Map<string, BlockColor> {
  const used = new Set<BlockColor>();
  const out = new Map<string, BlockColor>();
  // Tahap 1: warna asli proyek bila belum dipakai seri lain.
  for (const s of series) {
    if (s.color !== "abu" && !used.has(s.color)) {
      used.add(s.color);
      out.set(s.id, s.color);
    }
  }
  // Tahap 2: sisanya mendapat slot kosong berikutnya dalam urutan tetap.
  for (const s of series) {
    if (out.has(s.id)) continue;
    const c = ORDER.find((x) => !used.has(x)) ?? "abu";
    used.add(c);
    out.set(s.id, c);
  }
  return out;
}

export const chartHex = (c: BlockColor, dark: boolean) => CHART[c]?.[dark ? 1 : 0] ?? CHART.abu[dark ? 1 : 0];
