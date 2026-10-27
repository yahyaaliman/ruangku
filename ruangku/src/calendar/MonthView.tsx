import { useEffect, useMemo, useRef, useState } from "react";
import { onDate, weekLanes, type CalEvent, shiftDays, daysDiff } from "../lib/calendar";
import { parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { anchorOf } from "./Popover";
import { DRAG_TYPE, EvIcon, evLabel, useCal } from "./shared";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const LANE = 21;
const HEAD = 26;

export default function MonthView({ days, month, events }: { days: string[]; month: number; events: CalEvent[] }) {
  const cal = useCal();
  const box = useRef<HTMLDivElement>(null);
  const [rowH, setRowH] = useState(110);
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const grab = useRef<{ key: string; offset: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRowH(el.clientHeight / 6));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const visible = useMemo(() => events.filter((e) => e.layer !== "sholat"), [events]);
  const weeks = useMemo(() => Array.from({ length: 6 }, (_, w) => days.slice(w * 7, w * 7 + 7)), [days]);
  const fit = Math.max(1, Math.floor((rowH - HEAD - 2) / LANE));
  const byKey = useMemo(() => new Map(visible.map((e) => [e.key, e])), [visible]);

  const drop = (date: string, e: React.DragEvent) => {
    e.preventDefault();
    setDropOn(null);
    const key = e.dataTransfer.getData(DRAG_TYPE);
    const ev = byKey.get(key);
    if (!ev || !grab.current) return;
    const target = shiftDays(date, -grab.current.offset);
    if (target !== ev.date) cal.move(ev, target);
    grab.current = null;
  };

  return (
    <div className={`cm ${dragging ? "dragging" : ""}`} role="grid" aria-label="Kalender bulan">
      <div className="cm-head" role="row">
        {WEEKDAYS.map((d, i) => (
          <div key={d} role="columnheader" className={i === 6 ? "sun" : ""}>
            {d}
          </div>
        ))}
      </div>
      <div className="cm-body" ref={box}>
        {weeks.map((week) => {
          const lanes = weekLanes(visible, week);
          // Sisakan satu baris untuk "+N lagi" bila tidak semua muat.
          const cap = lanes.some((l) => l.row >= fit) ? Math.max(1, fit - 1) : fit;
          const shown = lanes.filter((l) => l.row < cap);
          return (
            <div key={week[0]} className="cm-week" role="row">
              {week.map((d) => {
                const dt = parseDateKey(d);
                const out = dt.getMonth() !== month;
                const hol = cal.holidays.get(d);
                const hidden = lanes.filter((l) => l.row >= cap && l.from <= week.indexOf(d) && l.to >= week.indexOf(d)).length;
                const hj = cal.hijriDay(d);
                return (
                  <div
                    key={d}
                    role="gridcell"
                    className={`cm-cell ${out ? "out" : ""} ${d === cal.today ? "today" : ""} ${hol ? "hol" : ""} ${dt.getDay() === 0 ? "sun" : ""} ${dropOn === d ? "drop" : ""}`}
                    onClick={(e) => e.target === e.currentTarget && cal.create({ date: d }, anchorOf(e.currentTarget))}
                    onDragOver={(e) => {
                      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropOn !== d) setDropOn(d);
                    }}
                    onDragLeave={() => dropOn === d && setDropOn(null)}
                    onDrop={(e) => drop(d, e)}
                    title={hol?.join(" · ")}
                  >
                    <div className="cm-date">
                      <button className="cm-num" onClick={() => cal.pickDay(d)} aria-label={`Buka ${d}${hol ? `, ${hol.join(", ")}` : ""}`}>
                        {dt.getDate() === 1 ? `${dt.getDate()} ${new Intl.DateTimeFormat("id-ID", { month: "short" }).format(dt)}` : dt.getDate()}
                      </button>
                      <span className="cm-hijri" title={`${hj.day} ${hj.month}`}>
                        {hj.day === 1 ? `1 ${hj.month}` : hj.day}
                      </span>
                    </div>
                    {hidden > 0 && (
                      <button className="cm-more" style={{ top: HEAD + cap * LANE }} onClick={() => cal.pickDay(d)}>
                        +{hidden} lagi
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="cm-lanes">
                {shown.map((l) => {
                  const ev = l.event;
                  const span = ev.start === undefined || l.to > l.from;
                  return (
                    <button
                      key={`${ev.key}:${week[0]}`}
                      className={`cm-ev cc-${ev.color} ${span ? "is-bar" : "is-dot"} ${ev.done ? "done" : ""} ${l.contL ? "cl" : ""} ${l.contR ? "cr" : ""} ${ev.holiday ? "holiday" : ""} ${cal.selected === ev.key ? "sel" : ""}`}
                      style={{ left: `calc(${(l.from / 7) * 100}% + 3px)`, width: `calc(${((l.to - l.from + 1) / 7) * 100}% - 6px)`, top: HEAD + l.row * LANE }}
                      draggable={ev.movable}
                      onDragStart={(e) => {
                        const r = e.currentTarget.parentElement!.getBoundingClientRect();
                        const col = Math.max(0, Math.min(6, Math.floor(((e.clientX - r.left) / r.width) * 7)));
                        grab.current = { key: ev.key, offset: daysDiff(ev.date, week[col]) };
                        e.dataTransfer.setData(DRAG_TYPE, ev.key);
                        e.dataTransfer.effectAllowed = "move";
                        window.setTimeout(() => setDragging(true), 0);
                      }}
                      onDragEnd={() => {
                        setDragging(false);
                        setDropOn(null);
                      }}
                      onClick={(e) => cal.open(ev, anchorOf(e.currentTarget))}
                      aria-label={evLabel(ev)}
                    >
                      {!span && <i className="cm-dot" />}
                      <EvIcon ev={ev} size={11} />
                      {ev.start !== undefined && !span && <span className="cm-time">{fmtMin(ev.start)}</span>}
                      <span className="cm-title">{ev.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Daftar acara satu tanggal (dipakai panel samping & popover hari). */
export function DayList({ date, events }: { date: string; events: CalEvent[] }) {
  const cal = useCal();
  const list = onDate(events, date).filter((e) => e.layer !== "sholat");
  if (!list.length) return <p className="muted small">Tidak ada acara.</p>;
  return (
    <ul className="cal-daylist">
      {list.map((ev) => (
        <li key={ev.key}>
          <button className={`cal-dl-row cc-${ev.color} ${ev.done ? "done" : ""}`} onClick={(e) => cal.open(ev, anchorOf(e.currentTarget))}>
            <span className="cal-dl-time">{ev.start === undefined ? "Seharian" : fmtMin(ev.start)}</span>
            <i className="cal-swatch" />
            <span className="cal-dl-title">{ev.title}</span>
            <EvIcon ev={ev} />
          </button>
        </li>
      ))}
    </ul>
  );
}
