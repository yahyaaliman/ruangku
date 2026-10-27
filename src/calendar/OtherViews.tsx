import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { lastDate, onDate, type CalEvent } from "../lib/calendar";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { monthGrid } from "../lib/timeblocks";
import { anchorOf } from "./Popover";
import { EvIcon, timeRange, useCal } from "./shared";

const fAgenda = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" });
const fMonthName = new Intl.DateTimeFormat("id-ID", { month: "long" });
const fMonthYear = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric" });
const WD = ["S", "S", "R", "K", "J", "S", "M"];

export function AgendaView({ days, events }: { days: string[]; events: CalEvent[] }) {
  const cal = useCal();
  const groups = useMemo(() => days.map((d) => ({ d, list: onDate(events, d).filter((e) => e.layer !== "sholat" && (e.date === d || d === days[0])) })).filter((g) => g.list.length), [days, events]);
  if (!groups.length)
    return (
      <div className="empty cal-empty">
        <p className="empty-title">Tidak ada acara 30 hari ke depan</p>
        <p className="empty-text">Klik tanggal di tampilan Bulan atau seret di tampilan Minggu untuk membuat blok, tugas, atau pengingat.</p>
      </div>
    );
  return (
    <div className="ag">
      {groups.map(({ d, list }) => {
        const hol = cal.holidays.get(d);
        return (
          <section key={d} className={`ag-day ${d === cal.today ? "today" : ""}`}>
            <header>
              <button className="ag-date" onClick={() => cal.pickDay(d)}>
                <b>{parseDateKey(d).getDate()}</b>
                <span>{fAgenda.format(parseDateKey(d))}</span>
              </button>
              {hol && <span className="ag-hol">{hol.join(" · ")}</span>}
            </header>
            <ul>
              {list.map((ev) => (
                <li key={ev.key}>
                  <button className={`ag-row cc-${ev.color} ${ev.done ? "done" : ""}`} onClick={(e) => cal.open(ev, anchorOf(e.currentTarget))}>
                    <span className="ag-time">{ev.endDate && lastDate(ev) !== ev.date ? `s.d. ${parseDateKey(lastDate(ev)).getDate()}/${parseDateKey(lastDate(ev)).getMonth() + 1}` : timeRange(ev)}</span>
                    <i className="cal-swatch" />
                    <span className="ag-title">
                      <EvIcon ev={ev} />
                      {ev.title}
                    </span>
                    {ev.sub && <span className="ag-sub">{ev.sub}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/** Tahun: 12 bulan kecil, kepadatan acara per hari (satu warna, terang → gelap). */
export function YearView({ year, events }: { year: number; events: CalEvent[] }) {
  const cal = useCal();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of events) {
      // Acara berulang (mis. pengingat harian) tidak dihitung supaya pola kesibukan tetap terlihat.
      if (e.layer === "sholat" || e.holiday || e.recurring) continue;
      for (let d = parseDateKey(e.date); dateKey(d) <= lastDate(e); d = addDays(d, 1)) m.set(dateKey(d), (m.get(dateKey(d)) ?? 0) + 1);
    }
    return m;
  }, [events]);
  const max = Math.max(1, ...counts.values());
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  return (
    <div className="yr">
      <div className="yr-grid">
        {Array.from({ length: 12 }, (_, m) => (
          <section key={m} className="yr-month" aria-label={fMonthYear.format(new Date(year, m, 1))}>
            <button className="yr-title" onClick={() => cal.pickDay(dateKey(new Date(year, m, 1)), "bulan")}>
              {fMonthName.format(new Date(year, m, 1))}
            </button>
            <div className="yr-wd">
              {WD.map((w, i) => (
                <span key={i}>{w}</span>
              ))}
            </div>
            <div className="yr-days">
              {monthGrid(year, m).map((d) => {
                const out = parseDateKey(d).getMonth() !== m;
                const n = counts.get(d) ?? 0;
                const hol = cal.holidays.get(d);
                return out ? (
                  <span key={d} className="yr-d out" />
                ) : (
                  <button
                    key={d}
                    className={`yr-d lv${level(n)} ${d === cal.today ? "today" : ""} ${hol || parseDateKey(d).getDay() === 0 ? "red" : ""}`}
                    title={`${d}: ${n} acara${hol ? ` · ${hol.join(", ")}` : ""}`}
                    onClick={() => cal.pickDay(d)}
                  >
                    {parseDateKey(d).getDate()}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <p className="yr-legend">
        <span>Lebih sedikit</span>
        {[0, 1, 2, 3, 4].map((l) => (
          <i key={l} className={`yr-d lv${l}`} />
        ))}
        <span>Lebih banyak acara (tanpa yang berulang)</span>
        <span className="yr-legend-red">Angka merah = Minggu / libur nasional</span>
      </p>
    </div>
  );
}

/** Bulan kecil di panel samping untuk lompat tanggal. */
export function MiniMonth({ anchor, onPick, onShift, marks }: { anchor: string; onPick: (d: string) => void; onShift: (dir: -1 | 1) => void; marks: Set<string> }) {
  const cal = useCal();
  const a = parseDateKey(anchor);
  const grid = monthGrid(a.getFullYear(), a.getMonth());
  return (
    <div className="mini">
      <div className="mini-head">
        <b>{fMonthYear.format(a)}</b>
        <button className="icon-btn sm" onClick={() => onShift(-1)} aria-label="Bulan sebelumnya">
          <ChevronLeft size={15} />
        </button>
        <button className="icon-btn sm" onClick={() => onShift(1)} aria-label="Bulan berikutnya">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="mini-grid">
        {WD.map((w, i) => (
          <span key={i} className="mini-wd">
            {w}
          </span>
        ))}
        {grid.map((d) => {
          const dt = parseDateKey(d);
          return (
            <button
              key={d}
              className={`mini-d ${dt.getMonth() !== a.getMonth() ? "out" : ""} ${d === cal.today ? "today" : ""} ${d === anchor ? "sel" : ""} ${cal.holidays.has(d) || dt.getDay() === 0 ? "red" : ""}`}
              onClick={() => onPick(d)}
              aria-label={d}
            >
              {dt.getDate()}
              {marks.has(d) && <i />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
