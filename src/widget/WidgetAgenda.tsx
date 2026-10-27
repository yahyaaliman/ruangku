// Agenda hari ini di widget: blok jadwal, pengingat, tugas berjam, milestone, dan kalender
// luar (libur, Google, ICS) dalam satu daftar, dengan kartu "Sekarang" dan "Berikutnya".
import { useMemo } from "react";
import { Diamond, Globe, GraduationCap, Handshake, MapPin, Video } from "lucide-react";
import { api } from "../lib/api";
import type { Reminder, TimeBlock } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { useTasks } from "../lib/useTasks";
import { useScope } from "../lib/scope";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { eventsInRange, isAllDay, onDate, type CalEvent, type Layer } from "../lib/calendar";
import { firstDoneStatus, projectOf } from "../lib/tasks";
import { completeReminder } from "../pages/reminderActions";
import { useExternalCalendars } from "../calendar/sources";
import { requestOpenRemote } from "../lib/deeplink";

const LAYERS = new Set<Layer>(["blok", "rapat", "kuliah", "tugas", "pengingat", "milestone", "luar"]);

export const inText = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} j${min % 60 ? ` ${min % 60} m` : ""}` : `${Math.max(1, Math.round(min))} m`);

/** Acara hari ini & besok (dipakai juga oleh mode mini). */
export function useTodayEvents(now: number) {
  const scope = useScope();
  const blocks = useRecords<TimeBlock>("timeblock");
  const reminders = useRecords<Reminder>("reminder");
  const tk = useTasks();
  const ext = useExternalCalendars();
  const today = dateKey(now);
  const tomorrow = dateKey(addDays(parseDateKey(today), 1));
  const events = useMemo(
    () => eventsInRange({ blocks: blocks.items, tasks: tk.tasks, reminders: reminders.items, projects: tk.projects, external: ext.external }, today, tomorrow, { layers: LAYERS, match: scope.match, hideDone: true }),
    [blocks.items, tk.tasks, reminders.items, tk.projects, ext.external, today, tomorrow, scope.match],
  );
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const todayEv = onDate(events, today);
  const timed = todayEv.filter((e) => !isAllDay(e) && !e.cancelled);
  const current = timed.find((e) => (e.layer === "blok" || e.layer === "rapat" || e.layer === "kuliah" || e.layer === "luar") && !e.done && e.start! <= nowMin && (e.end ?? e.start!) > nowMin);
  const upcoming = timed.filter((e) => e !== current && e.start! > nowMin);
  const late = timed.filter((e) => e.layer === "pengingat" && !e.done && e.start! <= nowMin);
  const allDay = todayEv.filter((e) => isAllDay(e) && e.layer !== "tugas");
  const firstTomorrow = onDate(events, tomorrow).find((e) => !isAllDay(e));
  return { current, upcoming, late, allDay, firstTomorrow, nowMin, blocks, reminders, tk, today };
}

export function AgendaToday({ now, count, title }: { now: number; count: number; title: React.ReactNode }) {
  const a = useTodayEvents(now);

  const done = async (ev: CalEvent) => {
    if (ev.ref.kind === "reminder") {
      const r = a.reminders.items.find((x) => x.id === ev.ref.id);
      if (r) await a.reminders.save(completeReminder(r), r.id);
    } else if (ev.ref.kind === "timeblock") {
      const b = a.blocks.items.find((x) => x.id === ev.ref.id);
      if (b) await a.blocks.save({ ...strip(b), done: !b.done }, b.id);
    } else if (ev.ref.kind === "task") {
      const t = a.tk.tasks.find((x) => x.id === ev.ref.id);
      if (t) await a.tk.update(t.id, { status: firstDoneStatus(projectOf(a.tk.projects, t.projectId)) });
    }
  };
  const openCal = () => requestOpenRemote("date", a.today, "calendar");

  const rows = [...a.late, ...a.upcoming];
  const total = rows.length + (a.current ? 1 : 0);
  return (
    <section className="w-sec">
      {title}
      {a.allDay.length > 0 && (
        <div className="w-chips">
          {a.allDay.map((e) => (
            <span key={e.key} className={`w-chip c-${e.color} ${e.holiday ? "hol" : ""}`} title={e.sub}>
              {e.layer === "milestone" ? <Diamond size={11} /> : <Globe size={11} />}
              {e.title}
            </span>
          ))}
        </div>
      )}
      {a.current && (
        <div className={`w-now c-${a.current.color}`}>
          <div className="w-now-top">
            <span className="w-now-kicker">Sekarang · sisa {inText((a.current.end ?? a.nowMin) - a.nowMin)}</span>
            {a.current.ref.kind === "timeblock" && <button className="w-check" onClick={() => done(a.current!)} aria-label={`Tandai selesai: ${a.current.title}`} />}
          </div>
          <b className="w-now-title">
            {a.current.layer === "rapat" ? <Handshake size={13} /> : a.current.layer === "kuliah" ? <GraduationCap size={13} /> : null} {a.current.title}
          </b>
          {(a.current.location || a.current.link) && (
            <span className="w-now-where">
              {a.current.location && (
                <>
                  <MapPin size={11} /> {a.current.location}
                </>
              )}
              {a.current.link && (
                <button className="w-join" onClick={() => api.openUrl(a.current!.link!)}>
                  <Video size={11} /> Gabung
                </button>
              )}
            </span>
          )}
          <div className="w-now-bar">
            <i style={{ width: `${Math.min(100, ((a.nowMin - a.current.start!) / Math.max(1, (a.current.end ?? a.current.start!) - a.current.start!)) * 100)}%` }} />
          </div>
          <span className="w-now-range">
            {fmtMin(a.current.start!)}–{fmtMin(a.current.end ?? a.current.start!)}
          </span>
        </div>
      )}
      {rows.length === 0 && !a.current ? (
        <p className="w-empty">
          Tidak ada agenda tersisa hari ini.
          {a.firstTomorrow ? ` Besok ${fmtMin(a.firstTomorrow.start!)}: ${a.firstTomorrow.title}.` : ""}
        </p>
      ) : (
        <ul className="w-agenda w-nodrag">
          {rows.slice(0, count).map((e) => {
            const isLate = e.start! <= a.nowMin;
            const checkable = e.ref.kind === "reminder" || e.ref.kind === "timeblock" || e.ref.kind === "task";
            return (
              <li key={e.key} className={`w-rem w-ev c-${e.color} ${isLate ? "late" : ""}`}>
                {checkable ? <button className="w-check" onClick={() => done(e)} aria-label={`Tandai selesai: ${e.title}`} /> : <i className="w-evdot" />}
                <span className="w-rem-time">{isLate ? "Telat" : fmtMin(e.start!)}</span>
                <span className="w-rem-title">
                  <i className="w-evbar" />
                  {e.layer === "rapat" ? <Handshake size={12} className="w-evkind" /> : e.layer === "kuliah" ? <GraduationCap size={12} className="w-evkind" /> : null}
                  <span className="w-ev-name" title={e.location ? `${e.title} · ${e.location}` : e.title}>
                    {e.title}
                    {e.location && <small className="w-ev-loc"> · {e.location}</small>}
                  </span>
                  {e.link && e.start! - a.nowMin <= 15 && (
                    <button className="w-join" onClick={() => api.openUrl(e.link!)} title="Gabung rapat/kelas daring">
                      <Video size={11} /> Gabung
                    </button>
                  )}
                  {e === a.upcoming[0] && !a.current && !(e.link && e.start! - a.nowMin <= 15) && <small className="w-in">{inText(e.start! - a.nowMin)} lagi</small>}
                </span>
              </li>
            );
          })}
          {total > count + (a.current ? 1 : 0) && (
            <li className="w-more">
              <button className="w-link" onClick={openCal}>
                +{rows.length - count} lainnya di Kalender
              </button>
            </li>
          )}
        </ul>
      )}
      <button className="w-link w-agenda-open" onClick={openCal}>
        Buka kalender
      </button>
    </section>
  );
}

