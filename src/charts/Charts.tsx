// Diagram ringan berbasis SVG untuk evaluasi per proyek.
// Mengikuti aturan: garis 2 px, batang ≤ 24 px berujung bulat 4 px, celah 2 px
// warna permukaan, grid tipis, label teks memakai warna tinta (bukan warna seri),
// legenda untuk ≥ 2 seri, tooltip saat disorot, dan tampilan tabel.
import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { useDark } from "../lib/theme";
import type { BlockColor } from "../lib/types";
import { chartHex, Series } from "../lib/projectStats";
import { parseDateKey } from "../lib/date";

const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const fmtDay = (d: string) => {
  const x = parseDateKey(d);
  return `${HARI[x.getDay()]} ${x.getDate()} ${BLN[x.getMonth()]}`;
};
const fmtNum = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",")}rb` : Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));
export const fmtVal = (n: number | null, unit: string) => (n === null ? "–" : unit === "%" ? `${fmtNum(n)}%` : `${fmtNum(n)} ${unit}`);

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceStep(v: number): number {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
/** Skala sumbu bersih: 4 langkah bulat (0, 1, 2, 3, 4 atau 0, 5, 10, 15, 20). */
export function niceScale(max: number, steps = 4): { max: number; ticks: number[] } {
  const step = niceStep(Math.max(max, 1e-9) / steps);
  const top = Math.max(step, Math.ceil(max / step - 1e-9) * step);
  const ticks: number[] = [];
  for (let t = 0; t <= top + 1e-9; t += step) ticks.push(Math.round(t * 1000) / 1000);
  return { max: top, ticks };
}

type Tip = { x: number; y: number; body: ReactNode } | null;
function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className="ch-tip" style={{ left: tip.x, top: tip.y }} role="status">
      {tip.body}
    </div>
  );
}

export function Legend({ series, colors }: { series: Series[]; colors: Map<string, BlockColor> }) {
  const dark = useDark();
  if (series.length < 2) return null;
  return (
    <ul className="ch-legend">
      {series.map((s) => (
        <li key={s.id}>
          <i style={{ background: chartHex(colors.get(s.id)!, dark) }} />
          {s.icon ? `${s.icon} ` : ""}
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Batang horizontal: membandingkan total per proyek. */
export function HBars({ series, colors, unit }: { series: Series[]; colors: Map<string, BlockColor>; unit: string }) {
  const dark = useDark();
  const [tip, setTip] = useState<Tip>(null);
  const hs = niceScale(Math.max(...series.map((s) => s.total ?? 0), unit === "%" ? 100 : 0));
  const max = hs.max;
  return (
    <div className="ch ch-hbars" onMouseLeave={() => setTip(null)}>
      {series.map((s) => {
        const pct = ((s.total ?? 0) / max) * 100;
        return (
          <div
            key={s.id}
            className="ch-hrow"
            onMouseMove={(e) => {
              const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
              setTip({ x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, body: <><b>{s.label}</b><span>{fmtVal(s.total, unit)}{unit === "%" ? " rata-rata" : " dalam periode"}</span></> });
            }}
          >
            <span className="ch-hlabel" title={s.label}>
              <i style={{ background: chartHex(colors.get(s.id)!, dark) }} />
              {s.icon ? `${s.icon} ` : ""}
              {s.label}
            </span>
            <span className="ch-htrack">
              <span className="ch-hbar" style={{ width: `${Math.max(pct, 0.6)}%`, background: chartHex(colors.get(s.id)!, dark) }} />
              <span className="ch-hval" style={{ left: `calc(${pct}% + 6px)` }}>{fmtVal(s.total, unit)}</span>
            </span>
          </div>
        );
      })}
      <div className="ch-haxis" aria-hidden="true">
        {hs.ticks.map((t) => (
          <span key={t} style={{ left: `${(t / max) * 100}%` }}>{fmtNum(t)}</span>
        ))}
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Garis per hari, satu garis per proyek. */
export function Lines({ series, colors, dates, unit }: { series: Series[]; colors: Map<string, BlockColor>; dates: string[]; unit: string }) {
  const dark = useDark();
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 230;
  const pad = { l: 40, r: series.length <= 4 ? 120 : 16, t: 12, b: 26 };
  const iw = Math.max(80, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const scale = niceScale(Math.max(...all, unit === "%" ? 100 : 1));
  const max = scale.max;
  const x = (i: number) => pad.l + (dates.length <= 1 ? iw / 2 : (i / (dates.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = scale.ticks;
  const every = Math.ceil(dates.length / Math.max(2, Math.floor(iw / 70)));
  const paths = series.map((s) => {
    let d = "";
    let pen = false;
    s.values.forEach((v, i) => {
      if (v === null) return (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  const lastIdx = (s: Series) => s.values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop();
  // Label ujung: hanya bila tidak terlalu berdempet.
  const ends = series.map((s) => ({ s, i: lastIdx(s) })).filter((e) => e.i !== undefined).map((e) => ({ ...e, y: y(e.s.values[e.i!]!) }));
  ends.sort((a, b) => a.y - b.y);
  const crowded = ends.some((e, k) => k > 0 && e.y - ends[k - 1].y < 13);
  const surface = dark ? "#1b212e" : "#ffffff";

  return (
    <div className="ch ch-lines" ref={ref} onMouseLeave={() => setHover(null)}>
      <svg width={w} height={H} role="img" aria-label="Diagram garis per hari">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="ch-grid" />
            <text x={pad.l - 6} y={y(t)} className="ch-ytick" textAnchor="end" dominantBaseline="middle">{fmtNum(t)}</text>
          </g>
        ))}
        {dates.map((d, i) =>
          i % every === 0 || i === dates.length - 1 ? (
            <text key={d} x={x(i)} y={H - 8} className="ch-xtick" textAnchor="middle">{dates.length > 10 ? String(parseDateKey(d).getDate()) : fmtDay(d).split(" ").slice(0, 2).join(" ")}</text>
          ) : null,
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} className="ch-cross" />}
        {series.map((s, k) => (
          <path key={s.id} d={paths[k]} fill="none" stroke={chartHex(colors.get(s.id)!, dark)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {series.map((s) => {
          const i = hover ?? lastIdx(s);
          if (i === undefined || s.values[i] === null) return null;
          return <circle key={s.id} cx={x(i)} cy={y(s.values[i]!)} r={4.5} fill={chartHex(colors.get(s.id)!, dark)} stroke={surface} strokeWidth={2} />;
        })}
        {series.length <= 4 && !crowded &&
          ends.map((e) => (
            <text key={e.s.id} x={x(e.i!) + 10} y={e.y} className="ch-endlabel" dominantBaseline="middle">
              {e.s.label.length > 14 ? `${e.s.label.slice(0, 13)}…` : e.s.label} · {fmtVal(e.s.values[e.i!], unit)}
            </text>
          ))}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={(ev) => {
            const r = (ev.currentTarget as SVGRectElement).getBoundingClientRect();
            const i = Math.round(((ev.clientX - r.left) / r.width) * (dates.length - 1));
            setHover(Math.max(0, Math.min(dates.length - 1, i)));
          }}
        />
      </svg>
      {hover !== null && (
        <div className="ch-tip" style={{ left: Math.min(x(hover) + 12, w - 200), top: 8 }}>
          <b>{fmtDay(dates[hover])}</b>
          {series.map((s) => (
            <span key={s.id} className="ch-tiprow">
              <i style={{ background: chartHex(colors.get(s.id)!, dark) }} />
              {s.label}
              <em>{fmtVal(s.values[hover], unit)}</em>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Donat: porsi tiap proyek dari total (hanya untuk metrik yang bisa dijumlah). */
export function Donut({ series, colors, unit }: { series: Series[]; colors: Map<string, BlockColor>; unit: string }) {
  const dark = useDark();
  const [hover, setHover] = useState<string | null>(null);
  const total = series.reduce((s, x) => s + (x.total ?? 0), 0);
  const R = 82;
  const T = 26;
  const C = 2 * Math.PI * R;
  const gap = series.length > 1 ? 2 : 0;
  let acc = 0;
  const surface = dark ? "#1b212e" : "#ffffff";
  const hov = series.find((s) => s.id === hover);
  return (
    <div className="ch ch-donut">
      <svg width={200} height={200} viewBox="0 0 200 200" role="img" aria-label="Diagram donat porsi per proyek">
        <circle cx={100} cy={100} r={R} fill="none" stroke={dark ? "#2a3242" : "#eef1f5"} strokeWidth={T} />
        {series.map((s) => {
          const len = total ? ((s.total ?? 0) / total) * C : 0;
          const el = (
            <circle
              key={s.id}
              cx={100}
              cy={100}
              r={R}
              fill="none"
              stroke={chartHex(colors.get(s.id)!, dark)}
              strokeWidth={hover === s.id ? T + 6 : T}
              strokeDasharray={`${Math.max(0, len - gap)} ${C}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 100 100)"
              onMouseEnter={() => setHover(s.id)}
              onMouseLeave={() => setHover(null)}
              style={{ transition: "stroke-width .12s" }}
            />
          );
          acc += len;
          return el;
        })}
        <circle cx={100} cy={100} r={R - T / 2 - 1} fill={surface} pointerEvents="none" />
        <text x={100} y={94} textAnchor="middle" className="ch-donut-num">{fmtNum(hov ? hov.total ?? 0 : total)}</text>
        <text x={100} y={116} textAnchor="middle" className="ch-donut-sub">{hov ? `${hov.label.slice(0, 18)}` : unit === "jam" ? "jam total" : `${unit} total`}</text>
      </svg>
      <ul className="ch-donut-list">
        {[...series].map((s) => (
          <li key={s.id} className={hover === s.id ? "on" : ""} onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}>
            <i style={{ background: chartHex(colors.get(s.id)!, dark) }} />
            <span>{s.icon ? `${s.icon} ` : ""}{s.label}</span>
            <b>{fmtVal(s.total, unit)}</b>
            <em>{total ? Math.round(((s.total ?? 0) / total) * 100) : 0}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

const RAMP_L = ["#e8f0fb", "#b7d3f6", "#86b6ef", "#5598e7", "#2a78d6", "#1c5cab"];
const RAMP_D = ["#232b3a", "#184f95", "#1c5cab", "#256abf", "#3987e5", "#6da7ec"];

/** Heatmap kalender: total semua proyek terpilih per hari (satu warna, makin gelap makin banyak). */
export function Heat({ dates, values, unit }: { dates: string[]; values: (number | null)[]; unit: string }) {
  const dark = useDark();
  const [tip, setTip] = useState<Tip>(null);
  const ramp = dark ? RAMP_D : RAMP_L;
  const max = Math.max(...values.map((v) => v ?? 0), 0);
  const level = (v: number | null) => (v === null ? -1 : v <= 0 || !max ? 0 : Math.min(5, Math.ceil((v / max) * 5)));
  // Kolom = minggu (Senin di atas), baris = hari.
  const first = parseDateKey(dates[0]);
  const offset = (first.getDay() + 6) % 7;
  const cells = [...Array(offset).fill(null), ...dates.map((d, i) => ({ d, v: values[i] }))];
  const weeks = Math.ceil(cells.length / 7);
  return (
    <div className="ch ch-heat" onMouseLeave={() => setTip(null)}>
      <div className="ch-heat-days" aria-hidden="true">{["Sen", "", "Rab", "", "Jum", "", "Min"].map((d, i) => <span key={i}>{d}</span>)}</div>
      <div className="ch-heat-grid" style={{ gridTemplateColumns: `repeat(${weeks}, 22px)` }}>
        {Array.from({ length: weeks * 7 }, (_, k) => {
          const col = Math.floor(k / 7);
          const row = k % 7;
          const c = cells[col * 7 + row];
          if (!c) return <span key={k} className="ch-cell empty" style={{ gridColumn: col + 1, gridRow: row + 1 }} />;
          const lv = level(c.v);
          return (
            <span
              key={k}
              className={`ch-cell ${lv < 0 ? "none" : ""}`}
              style={{ gridColumn: col + 1, gridRow: row + 1, background: lv < 0 ? undefined : ramp[lv] }}
              onMouseMove={(e) => {
                const r = (e.currentTarget.closest(".ch-heat") as HTMLElement).getBoundingClientRect();
                setTip({ x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, body: <><b>{fmtDay(c.d)}</b><span>{fmtVal(c.v, unit)}</span></> });
              }}
              aria-label={`${fmtDay(c.d)}: ${fmtVal(c.v, unit)}`}
            />
          );
        })}
      </div>
      <div className="ch-heat-legend" aria-hidden="true">
        <span>Sedikit</span>
        {ramp.map((c) => <i key={c} style={{ background: c }} />)}
        <span>Banyak</span>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

export function DataTable({ series, dates, unit }: { series: Series[]; dates: string[]; unit: string }) {
  return (
    <div className="ch-table-wrap">
      <table className="ch-table">
        <thead>
          <tr>
            <th>Proyek</th>
            <th>{unit === "%" ? "Rata-rata" : "Total"}</th>
            {dates.map((d) => <th key={d}>{fmtDay(d).split(" ").slice(1).join(" ")}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map((s) => (
            <tr key={s.id}>
              <th scope="row">{s.icon ? `${s.icon} ` : ""}{s.label}</th>
              <td><b>{fmtVal(s.total, unit)}</b></td>
              {s.values.map((v, i) => <td key={i}>{v === null ? "–" : fmtNum(v)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
