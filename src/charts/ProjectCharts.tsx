// Bagian "Diagram per proyek" di halaman Evaluasi.
import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, LineChart, PieChart, Table2 } from "lucide-react";
import type { Data } from "../lib/review";
import { useScope } from "../lib/scope";
import { flatTree } from "../lib/projects";
import { chartColors, groupsFor, Metric, METRICS, seriesFor } from "../lib/projectStats";
import { DataTable, Donut, fmtVal, Heat, HBars, Legend, Lines } from "./Charts";

type Kind = "batang" | "garis" | "donat" | "heatmap" | "tabel";
const KINDS: { id: Kind; label: string; icon: typeof BarChart3 }[] = [
  { id: "batang", label: "Batang", icon: BarChart3 },
  { id: "garis", label: "Garis", icon: LineChart },
  { id: "donat", label: "Donat", icon: PieChart },
  { id: "heatmap", label: "Heatmap", icon: CalendarDays },
  { id: "tabel", label: "Tabel", icon: Table2 },
];

function load<T extends string>(k: string, d: T): T {
  try {
    return (localStorage.getItem(k) as T) || d;
  } catch {
    return d;
  }
}

export default function ProjectCharts({ dates, data, periodText }: { dates: string[]; data: Data; periodText: string }) {
  const scope = useScope();
  const [sel, setSel] = useState<string>(scope.scope);
  const [metric, setMetric] = useState<Metric>(() => load("ruangku-chart-metric", "waktu" as Metric));
  const [kind, setKind] = useState<Kind>(() => load("ruangku-chart-kind", "batang" as Kind));
  useEffect(() => setSel(scope.scope), [scope.scope]);
  useEffect(() => {
    try {
      localStorage.setItem("ruangku-chart-metric", metric);
      localStorage.setItem("ruangku-chart-kind", kind);
    } catch {
      /* abaikan */
    }
  }, [metric, kind]);

  const m = METRICS.find((x) => x.id === metric)!;
  const groups = useMemo(() => groupsFor(scope.allProjects, sel), [scope.allProjects, sel]);
  const series = useMemo(() => seriesFor(metric, groups, dates, data), [metric, groups, dates, data]);
  const colors = useMemo(() => chartColors(series), [series]);
  const donutOk = m.sum;
  const effKind: Kind = kind === "donat" && !donutOk ? "batang" : kind;
  const daily = dates.map((_, i) => {
    const vs = series.map((s) => s.values[i]).filter((v): v is number => v !== null);
    if (!vs.length) return null;
    return m.sum ? Math.round(vs.reduce((a, b) => a + b, 0) * 10) / 10 : Math.round(vs.reduce((a, b) => a + b, 0) / vs.length);
  });
  const sum = series.reduce((s, x) => s + (x.total ?? 0), 0);
  const top = [...series].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))[0];
  const selName = sel === "all" ? "semua proyek" : scope.byId(sel)?.name ?? "";
  const headline = !top
    ? null
    : m.sum
      ? `${top.label} ${metric === "waktu" ? "menyita" : "menyumbang"} ${Math.round(((top.total ?? 0) / (sum || 1)) * 100)}% ${m.label.toLowerCase()} (${fmtVal(top.total, m.unit)} dari ${fmtVal(Math.round(sum * 10) / 10, m.unit)}).`
      : `Tertinggi: ${top.label}, ${fmtVal(top.total, m.unit)}.`;

  return (
    <section className="rv-card pc">
      <header className="pc-head">
        <div>
          <h2>Diagram per proyek</h2>
          <p className="muted small">{periodText} · membandingkan {sel === "all" ? "proyek utama" : `subproyek ${selName}`}</p>
        </div>
        <select className="pc-select" value={sel} onChange={(e) => setSel(e.target.value)} aria-label="Proyek yang dibandingkan">
          <option value="all">Semua proyek</option>
          {flatTree(scope.projects).map(({ p, depth }) => (
            <option key={p.id} value={p.id}>{"   ".repeat(depth)}{p.icon ? `${p.icon} ` : ""}{p.name}</option>
          ))}
        </select>
      </header>
      <div className="pc-controls">
        <div className="seg" role="tablist" aria-label="Ukuran">
          {METRICS.map((x) => (
            <button key={x.id} role="tab" aria-selected={metric === x.id} className={metric === x.id ? "active" : ""} onClick={() => setMetric(x.id)}>{x.label}</button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Jenis diagram">
          {KINDS.map((k) => (
            <button key={k.id} role="tab" aria-selected={effKind === k.id} className={effKind === k.id ? "active" : ""} disabled={k.id === "donat" && !donutOk} title={k.id === "donat" && !donutOk ? "Donat hanya untuk ukuran yang bisa dijumlah" : undefined} onClick={() => setKind(k.id)}>
              <k.icon size={14} /> {k.label}
            </button>
          ))}
        </div>
      </div>
      {series.length === 0 ? (
        <p className="pc-empty muted">
          Belum ada data {m.label.toLowerCase()} untuk {selName} pada periode ini.
          {metric === "waktu" && " Jalankan timer pada tugas untuk mencatat waktu."}
          {metric === "kpi" && " Hubungkan KPI ke proyek dan isi nilainya setiap hari."}
          {metric === "okr" && " Buat objective untuk proyek ini di halaman OKR."}
        </p>
      ) : (
        <>
          {headline && <p className="pc-headline">{headline}</p>}
          {effKind === "garis" && <Legend series={series} colors={colors} />}
          {effKind === "batang" && <HBars series={series} colors={colors} unit={m.unit} />}
          {effKind === "garis" && <Lines series={series} colors={colors} dates={dates} unit={m.unit} />}
          {effKind === "donat" && <Donut series={series} colors={colors} unit={m.unit} />}
          {effKind === "heatmap" && (
            <>
              <p className="muted small">{m.sum ? "Total" : "Rata-rata"} {m.label.toLowerCase()} per hari untuk {selName}.</p>
              <Heat dates={dates} values={daily} unit={m.unit} />
            </>
          )}
          {effKind === "tabel" && <DataTable series={series} dates={dates} unit={m.unit} />}
        </>
      )}
    </section>
  );
}
