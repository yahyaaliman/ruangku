// Diagram keuangan: arus kas bulanan (kolom berpasangan masuk/keluar) dan pengeluaran per
// kategori (batang horizontal satu warna). Mengikuti aturan diagram aplikasi: kolom ≤ 24 px
// berujung bulat 4 px, celah 2 px, grid tipis, teks memakai warna tinta, legenda + tooltip,
// dan tampilan tabel.
import { useLayoutEffect, useRef, useState } from "react";
import { useDark } from "../lib/theme";
import { niceScale } from "../charts/Charts";
import { rupiah } from "../lib/ledger";

const C_IN: [string, string] = ["#2a78d6", "#3987e5"];
const C_OUT: [string, string] = ["#eb6834", "#d95926"];
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const fMonthShort = (ym: string) => `${BLN[Number(ym.slice(5, 7)) - 1]}${ym.slice(5, 7) === "01" ? ` ${ym.slice(2, 4)}` : ""}`;

/** 1.250.000 → "1,3 jt"; 45.000 → "45 rb". */
export function compactRp(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1e9) return `${s}${(a / 1e9).toFixed(a >= 1e10 ? 0 : 1).replace(".", ",")} M`;
  if (a >= 1e6) return `${s}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",")} jt`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)} rb`;
  return `${s}${Math.round(a)}`;
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
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

/** Jalur kolom dengan ujung atas bulat 4 px dan dasar persegi. */
function colPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return "";
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

export function CashflowChart({ data, onPick }: { data: { month: string; masuk: number; keluar: number; net: number }[]; onPick?: (ym: string) => void }) {
  const dark = useDark();
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const cin = C_IN[dark ? 1 : 0];
  const cout = C_OUT[dark ? 1 : 0];
  const H = 220;
  const pad = { l: 48, r: 8, t: 14, b: 26 };
  const iw = Math.max(120, w - pad.l - pad.r);
  const ih = H - pad.t - pad.b;
  const scale = niceScale(Math.max(1, ...data.map((d) => Math.max(d.masuk, d.keluar))));
  const band = iw / Math.max(1, data.length);
  const bw = Math.min(24, Math.max(6, (band - 18) / 2));
  const y = (v: number) => pad.t + ih - (v / scale.max) * ih;
  const best = data.reduce((b, d, i) => (d.net > (data[b]?.net ?? -Infinity) ? i : b), 0);

  if (table)
    return (
      <div className="fin-chart">
        <div className="fin-chart-bar">
          <Legend cin={cin} cout={cout} />
          <button className="btn btn-sm btn-ghost" onClick={() => setTable(false)}>
            Lihat diagram
          </button>
        </div>
        <div className="ch-table-wrap">
          <table className="ch-table fin-ctable">
            <thead>
              <tr>
                <th>Bulan</th>
                <th>Masuk</th>
                <th>Keluar</th>
                <th>Bersih</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.month}>
                  <th scope="row">{new Date(`${d.month}-01T00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</th>
                  <td>{rupiah(d.masuk)}</td>
                  <td>{rupiah(d.keluar)}</td>
                  <td className={d.net < 0 ? "neg" : ""}>{rupiah(d.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );

  return (
    <div className="fin-chart">
      <div className="fin-chart-bar">
        <Legend cin={cin} cout={cout} />
        <button className="btn btn-sm btn-ghost" onClick={() => setTable(true)}>
          Lihat tabel
        </button>
      </div>
      <div className="ch" ref={ref} onMouseLeave={() => setHover(null)}>
        <svg width={w} height={H} role="img" aria-label="Arus kas per bulan: pemasukan dan pengeluaran">
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={pad.l + iw} y1={y(t)} y2={y(t)} className="ch-grid" />
              <text x={pad.l - 6} y={y(t)} className="ch-ytick" textAnchor="end" dominantBaseline="middle">
                {compactRp(t)}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const cx = pad.l + band * i + band / 2;
            const x1 = cx - bw - 1;
            const x2 = cx + 1;
            return (
              <g key={d.month} opacity={hover === null || hover === i ? 1 : 0.45}>
                {hover === i && <rect x={pad.l + band * i + 2} y={pad.t} width={band - 4} height={ih} className="fin-band" rx={6} />}
                <path d={colPath(x1, y(d.masuk), bw, pad.t + ih - y(d.masuk))} fill={cin} />
                <path d={colPath(x2, y(d.keluar), bw, pad.t + ih - y(d.keluar))} fill={cout} />
                <text x={cx} y={H - 8} className="ch-xtick" textAnchor="middle">
                  {fMonthShort(d.month)}
                </text>
                {i === best && d.net > 0 && data.length > 1 && hover === null && (
                  <text x={cx} y={Math.min(y(d.masuk), y(d.keluar)) - 6} className="ch-endlabel" textAnchor="middle">
                    +{compactRp(d.net)}
                  </text>
                )}
              </g>
            );
          })}
          <line x1={pad.l} x2={pad.l + iw} y1={pad.t + ih} y2={pad.t + ih} className="fin-base" />
          {data.map((d, i) => (
            <rect
              key={d.month}
              x={pad.l + band * i}
              y={pad.t}
              width={band}
              height={ih + pad.b}
              fill="transparent"
              style={{ cursor: onPick ? "pointer" : undefined }}
              onMouseEnter={() => setHover(i)}
              onClick={() => onPick?.(d.month)}
            />
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div className="ch-tip" style={{ left: Math.min(pad.l + band * hover + band / 2 + 14, w - 200), top: 6 }}>
            <b>{new Date(`${data[hover].month}-01T00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}</b>
            <span className="ch-tiprow">
              <i style={{ background: cin }} /> Masuk <em>{rupiah(data[hover].masuk)}</em>
            </span>
            <span className="ch-tiprow">
              <i style={{ background: cout }} /> Keluar <em>{rupiah(data[hover].keluar)}</em>
            </span>
            <span className="ch-tiprow">
              <i style={{ background: "transparent" }} /> Bersih <em>{rupiah(data[hover].net)}</em>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ cin, cout }: { cin: string; cout: string }) {
  return (
    <ul className="ch-legend">
      <li>
        <i style={{ background: cin }} /> Pemasukan
      </li>
      <li>
        <i style={{ background: cout }} /> Pengeluaran
      </li>
    </ul>
  );
}

/** Pengeluaran per kategori: batang horizontal satu warna, ekor dilipat ke "Lainnya". */
export function CategoryBars({ data, max = 6, onPick }: { data: { category: string; total: number }[]; max?: number; onPick?: (c: string) => void }) {
  const dark = useDark();
  const [hover, setHover] = useState<string | null>(null);
  const color = C_OUT[dark ? 1 : 0];
  const head = data.slice(0, max);
  const tail = data.slice(max);
  const rows = tail.length ? [...head, { category: `${tail.length} kategori lain`, total: tail.reduce((s, x) => s + x.total, 0) }] : head;
  const sum = data.reduce((s, x) => s + x.total, 0);
  const top = Math.max(1, ...rows.map((r) => r.total));
  if (!rows.length) return <p className="muted small">Belum ada pengeluaran pada periode ini.</p>;
  return (
    <ul className="fin-cats">
      {rows.map((r, i) => {
        const pct = (r.total / top) * 100;
        const isTail = tail.length > 0 && i === rows.length - 1;
        return (
          <li key={r.category} className={hover === r.category ? "on" : ""} onMouseEnter={() => setHover(r.category)} onMouseLeave={() => setHover(null)}>
            <button className="fin-cat-name" onClick={() => !isTail && onPick?.(r.category)} disabled={isTail || !onPick} title={r.category}>
              {r.category}
            </button>
            <span className="fin-cat-track">
              <span className="fin-cat-bar" style={{ width: `${Math.max(pct, 1)}%`, background: isTail ? "var(--ink-3)" : color }} />
            </span>
            <b>{compactRp(r.total)}</b>
            <em>{sum ? Math.round((r.total / sum) * 100) : 0}%</em>
          </li>
        );
      })}
    </ul>
  );
}
