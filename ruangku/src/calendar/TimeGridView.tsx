// Tampilan minggu / hari: baris "sepanjang hari" + grid jam dengan geser, ubah durasi,
// dan seret di area kosong untuk membuat blok baru.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { isAllDay, weekLanes, type CalEvent } from "../lib/calendar";
import { parseDateKey } from "../lib/date";
import { fmtMin, layout, snap } from "../lib/timeblocks";
import { anchorOf } from "./Popover";
import { DRAG_TYPE, EvIcon, evLabel, timeRange, useCal } from "./shared";

const fWd = new Intl.DateTimeFormat("id-ID", { weekday: "short" });

type Drag =
  | { kind: "create"; day: number; from: number; to: number; x: number; y: number }
  | { kind: "move"; ev: CalEvent; day0: number; min0: number; day: number; start: number; dur: number; moved: boolean }
  | { kind: "resize"; ev: CalEvent; end: number };

export default function TimeGridView({ days, events, now, hourH = 46 }: { days: string[]; events: CalEvent[]; now: number; hourH?: number }) {
  const cal = useCal();
  const scroller = useRef<HTMLDivElement>(null);
  const cols = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  dragRef.current = drag;
  const [allOpen, setAllOpen] = useState(false);
  const [dropDay, setDropDay] = useState<number | null>(null);
  const n = days.length;

  const allDay = useMemo(() => events.filter((e) => isAllDay(e) || (e.endDate && e.endDate > e.date)), [events]);
  const lanes = useMemo(() => weekLanes(allDay, days), [allDay, days]);
  const laneRows = lanes.reduce((m, l) => Math.max(m, l.row + 1), 0);
  const capRows = allOpen ? laneRows : Math.min(laneRows, 3);

  const timed = useMemo(() => events.filter((e) => !isAllDay(e) && !(e.endDate && e.endDate > e.date) && e.layer !== "sholat"), [events]);
  const prayers = useMemo(() => events.filter((e) => e.layer === "sholat"), [events]);
  const byDay = useMemo(() => days.map((d) => layout(timed.filter((e) => e.date === d).map((e) => ({ ...e, start: e.start!, end: Math.max(e.end ?? e.start! + 15, e.start! + 15) })))), [timed, days]);

  const nowDate = new Date(now);
  const todayIdx = days.indexOf(cal.today);
  const nowMin = nowDate.getHours() * 60 + nowDate.getMinutes();

  // Gulir awal: sekitar jam sekarang (bila hari ini tampil) atau 07:00.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = todayIdx >= 0 ? Math.max(0, nowMin - 90) : 7 * 60;
    el.scrollTop = (target / 60) * hourH;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days[0], n]);

  const at = (clientX: number, clientY: number) => {
    const r = cols.current!.getBoundingClientRect();
    const day = Math.max(0, Math.min(n - 1, Math.floor(((clientX - r.left) / r.width) * n)));
    const min = Math.max(0, Math.min(1440, ((clientY - r.top) / hourH) * 60));
    return { day, min };
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const p = at(e.clientX, e.clientY);
      if (d.kind === "create") setDrag({ ...d, to: snap(p.min), x: e.clientX, y: e.clientY });
      else if (d.kind === "move") {
        const moved = d.moved || Math.abs(p.min - d.min0) > 6 || p.day !== d.day0;
        const start = Math.max(0, Math.min(1440 - d.dur, snap((d.ev.start ?? 0) + (p.min - d.min0))));
        setDrag({ ...d, day: moved ? p.day : d.day, start: moved ? start : d.start, moved });
      } else setDrag({ ...d, end: Math.max((d.ev.start ?? 0) + 15, Math.min(1440, snap(p.min))) });
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (!d) return;
      if (d.kind === "create") {
        let a = Math.min(d.from, d.to);
        let b = Math.max(d.from, d.to);
        if (b - a < 15) {
          a = Math.min(snap(d.from - 7, 30), 1380);
          b = a + 60;
        }
        cal.create({ date: days[d.day], start: a, end: b }, { x: e.clientX, y: e.clientY - 20 });
      } else if (d.kind === "move") {
        if (!d.moved) {
          const el = document.querySelector(`[data-evkey="${CSS.escape(d.ev.key)}"]`);
          cal.open(d.ev, el ? anchorOf(el) : { x: e.clientX, y: e.clientY });
        } else if (days[d.day] !== d.ev.date || d.start !== d.ev.start) cal.move(d.ev, days[d.day], d.start);
      } else if (d.end !== d.ev.end) cal.resize(d.ev, d.end);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const startCreate = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = at(e.clientX, e.clientY);
    const m = snap(p.min);
    setDrag({ kind: "create", day: p.day, from: m, to: m, x: e.clientX, y: e.clientY });
  };

  const startMove = (e: React.PointerEvent, ev: CalEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const p = at(e.clientX, e.clientY);
    if (!ev.movable) {
      const el = e.currentTarget;
      cal.open(ev, anchorOf(el));
      return;
    }
    setDrag({ kind: "move", ev, day0: p.day, min0: p.min, day: days.indexOf(ev.date), start: ev.start ?? 0, dur: Math.max(15, (ev.end ?? (ev.start ?? 0) + 30) - (ev.start ?? 0)), moved: false });
  };

  const startResize = (e: React.PointerEvent, ev: CalEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setDrag({ kind: "resize", ev, end: ev.end ?? (ev.start ?? 0) + 30 });
  };

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const top = (m: number) => (m / 60) * hourH;

  return (
    <div className={`cw ${n === 1 ? "cw-day" : ""} ${drag ? "cw-dragging" : ""}`}>
      {/* Kepala hari */}
      <div className="cw-head" style={{ gridTemplateColumns: `56px repeat(${n}, 1fr)` }}>
        <div className="cw-gutter-h" />
        {days.map((d) => {
          const dt = parseDateKey(d);
          const hol = cal.holidays.get(d);
          const hj = cal.hijriDay(d);
          return (
            <button key={d} className={`cw-dayh ${d === cal.today ? "today" : ""} ${hol || dt.getDay() === 0 ? "red" : ""}`} onClick={() => cal.pickDay(d)} title={hol?.join(" · ")}>
              <span className="cw-wd">{fWd.format(dt)}</span>
              <span className="cw-dn">{dt.getDate()}</span>
              <span className="cw-hj">{hj.day} {hj.month.split(" ")[0].slice(0, 3)}</span>
            </button>
          );
        })}
      </div>

      {/* Sepanjang hari */}
      <div className="cw-all" style={{ gridTemplateColumns: `56px 1fr` }}>
        <div className="cw-all-label">
          {laneRows > 3 ? (
            <button className="icon-btn sm" onClick={() => setAllOpen(!allOpen)} aria-label={allOpen ? "Ringkas" : "Tampilkan semua"}>
              {allOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          ) : (
            <span>seharian</span>
          )}
        </div>
        <div className="cw-all-body" style={{ height: Math.max(1, capRows) * 22 + 6 }}>
          {days.map((d, i) => (
            <div
              key={d}
              className={`cw-all-cell ${dropDay === i ? "drop" : ""}`}
              style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}
              onClick={(e) => e.target === e.currentTarget && cal.create({ date: d }, anchorOf(e.currentTarget))}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                setDropDay(i);
              }}
              onDragLeave={() => setDropDay(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropDay(null);
                const ev = events.find((x) => x.key === e.dataTransfer.getData(DRAG_TYPE));
                if (ev && ev.date !== d) cal.move(ev, d, ev.layer === "tugas" ? null : undefined);
              }}
            />
          ))}
          {lanes
            .filter((l) => l.row < capRows)
            .map((l) => (
              <button
                key={l.event.key}
                className={`cw-bar cc-${l.event.color} ${l.event.done ? "done" : ""} ${l.contL ? "cl" : ""} ${l.contR ? "cr" : ""} ${cal.selected === l.event.key ? "sel" : ""}`}
                style={{ left: `calc(${(l.from / n) * 100}% + 2px)`, width: `calc(${((l.to - l.from + 1) / n) * 100}% - 4px)`, top: 3 + l.row * 22 }}
                draggable={l.event.movable}
                onDragStart={(e) => {
                  e.dataTransfer.setData(DRAG_TYPE, l.event.key);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onClick={(e) => cal.open(l.event, anchorOf(e.currentTarget))}
                aria-label={evLabel(l.event)}
              >
                <EvIcon ev={l.event} size={11} />
                <span>{l.event.title}</span>
              </button>
            ))}
          {!allOpen && laneRows > 3 && <span className="cw-all-more">+{lanes.filter((l) => l.row >= 3).length}</span>}
        </div>
      </div>

      {/* Grid jam */}
      <div className="cw-scroll" ref={scroller}>
        <div className="cw-grid" style={{ height: 24 * hourH, gridTemplateColumns: `56px 1fr` }}>
          <div className="cw-gutter">
            {hours.map((h) => (
              <span key={h} style={{ top: top(h * 60) }}>
                {h === 0 ? "" : `${String(h).padStart(2, "0")}.00`}
              </span>
            ))}
          </div>
          <div
            className="cw-cols"
            ref={cols}
            onPointerDown={startCreate}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_TYPE)) e.preventDefault();
            }}
            onDrop={(e) => {
              // Bar sepanjang hari dijatuhkan ke jam tertentu → jadi berjam.
              e.preventDefault();
              const ev = events.find((x) => x.key === e.dataTransfer.getData(DRAG_TYPE));
              if (!ev) return;
              const p = at(e.clientX, e.clientY);
              cal.move(ev, days[p.day], snap(p.min, 15));
            }}
          >
            {hours.map((h) => (
              <i key={h} className="cw-line" style={{ top: top(h * 60) }} />
            ))}
            {days.map((d, i) => (
              <div key={d} className={`cw-col ${d === cal.today ? "today" : ""} ${cal.holidays.has(d) ? "hol" : ""}`} style={{ left: `${(i / n) * 100}%`, width: `${100 / n}%` }}>
                {cal.bands(d).map((b) => (
                  <div key={b.id} className="cw-band" style={{ top: top(b.start), height: Math.max(3, top(b.end - b.start)) }} title={`${b.name} ${fmtMin(b.start)}–${fmtMin(b.end)} (dilindungi)`} />
                ))}
                {prayers
                  .filter((p) => p.date === d)
                  .map((p) => (
                    <div key={p.key} className="cw-prayer" style={{ top: top(p.start!) }} title={`${p.title} ${fmtMin(p.start!)}`}>
                      <span>
                        {p.title} {fmtMin(p.start!)}
                      </span>
                    </div>
                  ))}
                {byDay[i].map(({ item, col, cols: cc }) => {
                  const ev = events.find((x) => x.key === item.key)!;
                  const isDragged = drag && drag.kind !== "create" && drag.ev.key === ev.key;
                  const h = Math.max(18, top(item.end - item.start) - 2);
                  return (
                    <div
                      key={ev.key}
                      data-evkey={ev.key}
                      role="button"
                      tabIndex={0}
                      aria-label={evLabel(ev)}
                      className={`cw-ev cc-${ev.color} l-${ev.layer} ${ev.done ? "done" : ""} ${isDragged ? "ghosted" : ""} ${cal.selected === ev.key ? "sel" : ""} ${h < 34 ? "short" : ""}`}
                      style={{ top: top(item.start) + 1, height: h, left: `calc(${(col / cc) * 100}% + 2px)`, width: `calc(${(1 / cc) * 100}% - 4px)` }}
                      onPointerDown={(e) => startMove(e, ev)}
                      onKeyDown={(e) => e.key === "Enter" && cal.open(ev, anchorOf(e.currentTarget))}
                    >
                      <span className="cw-ev-title">
                        <EvIcon ev={ev} size={11} />
                        {ev.title}
                      </span>
                      <span className="cw-ev-time">{timeRange(ev)}</span>
                      {ev.resizable && <span className="cw-resize" onPointerDown={(e) => startResize(e, ev)} aria-hidden="true" />}
                    </div>
                  );
                })}
              </div>
            ))}
            {todayIdx >= 0 && (
              <div className="cw-now" style={{ top: top(nowMin), left: `${(todayIdx / n) * 100}%`, width: `${100 / n}%` }}>
                <i />
              </div>
            )}
            {/* Bayangan saat menyeret */}
            {drag?.kind === "create" && (
              <div className="cw-ghost" style={{ top: top(Math.min(drag.from, drag.to)), height: Math.max(4, top(Math.abs(drag.to - drag.from))), left: `${(drag.day / n) * 100}%`, width: `${100 / n}%` }}>
                {Math.abs(drag.to - drag.from) >= 15 && (
                  <span>
                    {fmtMin(Math.min(drag.from, drag.to))}–{fmtMin(Math.max(drag.from, drag.to))}
                  </span>
                )}
              </div>
            )}
            {drag?.kind === "move" && drag.moved && (
              <div className={`cw-ev cc-${drag.ev.color} dragging`} style={{ top: top(drag.start) + 1, height: Math.max(18, top(drag.dur) - 2), left: `calc(${(drag.day / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                <span className="cw-ev-title">{drag.ev.title}</span>
                <span className="cw-ev-time">
                  {fmtMin(drag.start)}–{fmtMin(drag.start + drag.dur)}
                </span>
              </div>
            )}
            {drag?.kind === "resize" && (
              <div className={`cw-ev cc-${drag.ev.color} dragging`} style={{ top: top(drag.ev.start!) + 1, height: Math.max(18, top(drag.end - drag.ev.start!) - 2), left: `calc(${(days.indexOf(drag.ev.date) / n) * 100}% + 2px)`, width: `calc(${100 / n}% - 4px)` }}>
                <span className="cw-ev-title">{drag.ev.title}</span>
                <span className="cw-ev-time">
                  {fmtMin(drag.ev.start!)}–{fmtMin(drag.end)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
