import { useMemo, useState } from "react";
import { removeBlockSmart } from "../lib/agendaSync";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import type { Item, KeyResult, Kpi, KpiEntry, Note, Objective, Reminder, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { addDays, dateKey, dateShort, dayLong, parseDateKey, quarterElapsed, quarterOf, time } from "../lib/date";
import { checkInsOn, durationLabel, monthGrid, dayMarks, noteTitleFrom, reminderTimesOn } from "../lib/timeblocks";
import { entriesByDate, formatNumber, kpiMet, objectiveProgress, okrHealth } from "../lib/metrics";
import { completeReminder } from "../pages/reminderActions";
import { entryId } from "../pages/Kpi";
import TimeGrid from "./TimeGrid";
import { useTasks } from "../lib/useTasks";
import { boxTask, TaskTray } from "../tasks/TimeTracking";
import { DayIbadah } from "./IbadahWidget";
import { ReviewForm } from "../pages/Review";
import { useIbadah } from "../lib/useIbadah";
import { hijriLabel } from "../lib/prayer";
import { useScope } from "../lib/scope";
import { blockProject } from "../lib/projects";
import { eventsInRange, holidaysIn, onDate, type Layer } from "../lib/calendar";
import { useExternalCalendars } from "../calendar/sources";
import { fmtMin } from "../lib/timeblocks";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// ---------- Kalender bulanan ----------

export function Calendar({ selected, onPick, now }: { selected: string; onPick: (d: string) => void; now: number }) {
  const sel = parseDateKey(selected);
  const [ym, setYm] = useState({ y: sel.getFullYear(), m: sel.getMonth() });
  const blocks = useRecords<TimeBlock>("timeblock");
  const reminders = useRecords<Reminder>("reminder");
  const notes = useRecords<Note>("note");
  const entries = useRecords<KpiEntry>("kpientry");
  const dates = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const marks = useMemo(
    () => dayMarks(dates, { blocks: blocks.items, reminders: reminders.items, notes: notes.items, entries: entries.items }),
    [dates, blocks.items, reminders.items, notes.items, entries.items],
  );
  const today = dateKey(now);
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const selMarks = marks.get(selected);
  // Libur, kalender luar, dan tugas bertenggat dari kalender terpadu.
  const scope = useScope();
  const tk = useTasks();
  const ext = useExternalCalendars();
  const calEvents = useMemo(
    () => eventsInRange({ blocks: blocks.items, tasks: tk.tasks, reminders: reminders.items, projects: tk.projects, external: ext.external }, dates[0], dates[41], { layers: new Set<Layer>(["blok", "rapat", "kuliah", "tugas", "pengingat", "milestone", "luar"]), match: scope.match, hideDone: true }),
    [blocks.items, tk.tasks, reminders.items, tk.projects, ext.external, dates, scope.match],
  );
  const holidays = useMemo(() => holidaysIn(calEvents), [calEvents]);
  const extDays = useMemo(() => new Set(calEvents.filter((e) => (e.layer === "luar" && !e.holiday) || e.layer === "tugas" || e.layer === "milestone").map((e) => e.date)), [calEvents]);
  const selList = onDate(calEvents, selected).slice(0, 6);

  return (
    <section className="w-cal w-nodrag">
      <header className="w-cal-head">
        <button className="w-icon" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={16} /></button>
        <strong>{MONTHS[ym.m]} {ym.y}</strong>
        <button className="w-icon" onClick={() => shift(1)} aria-label="Bulan berikutnya"><ChevronRight size={16} /></button>
      </header>
      <div className="w-cal-grid" role="grid" aria-label={`${MONTHS[ym.m]} ${ym.y}`}>
        {WEEKDAYS.map((d) => (
          <span key={d} className="w-cal-wd" role="columnheader">{d}</span>
        ))}
        {dates.map((d) => {
          const dt = parseDateKey(d);
          const mk = marks.get(d)!;
          const other = dt.getMonth() !== ym.m;
          const desc = [mk.blocks && `${mk.blocks} blok`, mk.reminders && `${mk.reminders} reminder`, mk.notes && `${mk.notes} catatan`, mk.kpiFilled && `${mk.kpiFilled} KPI terisi`].filter(Boolean).join(", ");
          return (
            <button
              key={d}
              role="gridcell"
              className={`w-cal-day ${other ? "other" : ""} ${d === today ? "today" : ""} ${d === selected ? "sel" : ""} ${dt.getDay() === 0 || holidays.has(d) ? "sun" : ""}`}
              onClick={() => onPick(d)}
              aria-label={`${dayLong(dt.getTime())}${holidays.has(d) ? `, ${holidays.get(d)!.join(", ")}` : ""}${desc ? `: ${desc}` : ""}`}
              title={[holidays.get(d)?.join(" · "), desc].filter(Boolean).join(" — ") || undefined}
            >
              <span className="w-cal-num">{dt.getDate()}</span>
              <span className="w-cal-dots" aria-hidden="true">
                {mk.blocks > 0 && <i className="d-block" />}
                {mk.reminders > 0 && <i className="d-rem" />}
                {mk.notes > 0 && <i className="d-note" />}
                {mk.kpiFilled > 0 && <i className="d-kpi" />}
                {extDays.has(d) && <i className="d-ext" />}
              </span>
            </button>
          );
        })}
      </div>
      <div className="w-cal-legend" aria-hidden="true">
        <span><i className="d-block" /> Blok</span>
        <span><i className="d-rem" /> Reminder</span>
        <span><i className="d-note" /> Catatan</span>
        <span><i className="d-kpi" /> KPI</span>
        <span><i className="d-ext" /> Tugas & kalender</span>
      </div>
      {(ym.y !== new Date(now).getFullYear() || ym.m !== new Date(now).getMonth()) && (
        <button className="w-btn sm" onClick={() => setYm({ y: new Date(now).getFullYear(), m: new Date(now).getMonth() })}>Ke bulan ini</button>
      )}
      {(holidays.get(selected) || selList.length > 0) && (
        <ul className="w-cal-list">
          {holidays.get(selected) && <li className="hol">{holidays.get(selected)!.join(" · ")}</li>}
          {selList
            .filter((e) => !e.holiday)
            .map((e) => (
              <li key={e.key} className={`c-${e.color} ${e.done ? "done" : ""}`}>
                <i />
                <span className="t">{e.start === undefined ? "Seharian" : fmtMin(e.start)}</span>
                <span className="n">{e.title}</span>
              </li>
            ))}
        </ul>
      )}
      <button className="w-cal-open" onClick={() => onPick(selected)}>
        <span>{dayLong(sel.getTime())}</span>
        <small>
          {selMarks && (selMarks.blocks || selMarks.reminders || selMarks.notes)
            ? [selMarks.blocks && `${selMarks.blocks} blok`, selMarks.reminders && `${selMarks.reminders} reminder`, selMarks.notes && `${selMarks.notes} catatan`].filter(Boolean).join(" · ")
            : "Belum ada aktivitas"}
        </small>
      </button>
    </section>
  );
}

// ---------- Detail hari ----------

function DayKpis({ date }: { date: string }) {
  const kpis = useRecords<Kpi>("kpi");
  const entries = useRecords<KpiEntry>("kpientry");
  const list = kpis.items.filter((k) => !k.archived).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  if (list.length === 0) return <p className="w-empty">Belum ada KPI. Tambahkan di aplikasi utama.</p>;
  const isFuture = date > dateKey();
  return (
    <ul className="w-kpis">
      {list.map((k) => {
        const v = entriesByDate(entries.items, k.id).get(date);
        return (
          <li key={k.id}>
            <span className="w-kpi-name">{k.name}</span>
            <input
              key={`${k.id}-${date}-${v ?? ""}`}
              className={`w-kpi-input ${v === undefined ? "" : kpiMet(k, v) ? "met" : "miss"}`}
              defaultValue={v ?? ""}
              disabled={isFuture}
              inputMode="decimal"
              placeholder={isFuture ? "–" : `${k.direction === "naik" ? "≥" : "≤"}${formatNumber(k.target)}`}
              aria-label={`Nilai ${k.name} tanggal ${date}`}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => {
                const t = e.target.value.trim().replace(",", ".");
                const id = entryId(k.id, date);
                if (t === "" && v !== undefined) return entries.remove(id);
                const n = Number(t);
                if (t !== "" && !Number.isNaN(n) && n !== v) entries.save({ kpiId: k.id, date, value: n }, id);
              }}
            />
          </li>
        );
      })}
    </ul>
  );
}

function DayOkr({ date }: { date: string }) {
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const checkIns = checkInsOn(krs.items, date);
  const d = parseDateKey(date);
  const period = quarterOf(d);
  const elapsed = quarterElapsed(period, new Date(Math.min(Date.now(), d.getTime() + 86399999)));
  const objs = objectives.items.filter((o) => o.period === period && !o.archived);
  return (
    <>
      {checkIns.length > 0 ? (
        <ul className="w-checkins">
          {checkIns.map((c) => (
            <li key={`${c.kr.id}-${c.at}`}>
              <span className="w-checkin-time">{time(c.at)}</span>
              <span>
                {c.kr.title}: <b>{formatNumber(c.value)} {c.kr.unit}</b>
                {c.note && <small>{c.note}</small>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="w-empty">Tidak ada check-in key result pada hari ini.</p>
      )}
      {objs.length > 0 && (
        <ul className="w-okr">
          {objs.map((o) => {
            const p = objectiveProgress(krs.items.filter((k) => k.objectiveId === o.id));
            return (
              <li key={o.id}>
                <div className="w-okr-top">
                  <span>{o.title}</span>
                  <b>{Math.round(p * 100)}%</b>
                </div>
                <div className={`w-bar ${okrHealth(p, elapsed)}`}>
                  <i style={{ width: `${Math.round(p * 100)}%` }} />
                  <em style={{ left: `${elapsed * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DayNotes({ date }: { date: string }) {
  const { items, save, remove } = useRecords<Note>("note");
  const list = items.filter((n) => n.date === date).sort((a, b) => a.updatedAt - b.updatedAt);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const label = `Catatan ${dateShort(parseDateKey(date).getTime())}`;

  const add = () => {
    const body = draft.trim();
    if (!body) return;
    save({ title: noteTitleFrom(body, label), body, tags: ["harian"], date });
    setDraft("");
  };

  return (
    <div className="w-daynotes">
      {list.map((n) => (
        <DayNote
          key={n.id}
          note={n}
          editing={editing === n.id}
          onEdit={() => setEditing(n.id)}
          onDone={(body) => {
            setEditing(null);
            if (!body.trim()) remove(n.id);
            else if (body !== n.body) save({ ...strip(n), body, title: noteTitleFrom(body, label) }, n.id);
          }}
          onDelete={() => remove(n.id)}
        />
      ))}
      <div className="w-note-add">
        <textarea
          value={draft}
          rows={2}
          placeholder="Tulis catatan untuk hari ini…"
          aria-label="Catatan baru untuk tanggal ini"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) add();
          }}
        />
        <button className="w-btn sm primary" disabled={!draft.trim()} onClick={add}>
          <Plus size={13} /> Simpan catatan
        </button>
      </div>
    </div>
  );
}

function DayNote({ note, editing, onEdit, onDone, onDelete }: { note: Item<Note>; editing: boolean; onEdit: () => void; onDone: (body: string) => void; onDelete: () => void }) {
  const [body, setBody] = useState(note.body);
  if (editing)
    return (
      <div className="w-note editing">
        <textarea autoFocus value={body} rows={Math.min(8, Math.max(2, body.split("\n").length))} onChange={(e) => setBody(e.target.value)} onBlur={() => onDone(body)} aria-label="Ubah catatan" />
      </div>
    );
  return (
    <div className="w-note">
      <button className="w-note-body" onClick={() => (setBody(note.body), onEdit())} title="Klik untuk mengedit">
        {note.body}
      </button>
      <button className="w-icon" onClick={onDelete} aria-label="Hapus catatan">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

export function DayView({ date, setDate, now, orientation = "vertical" }: { date: string; setDate: (d: string) => void; now: number; orientation?: "vertical" | "horizontal" }) {
  const scope = useScope();
  const blocks = useRecords<TimeBlock>("timeblock");
  const reminders = useRecords<Reminder>("reminder");
  const today = dateKey(now);
  const dayBlocks = blocks.items.filter((b) => b.date === date);
  const marks = reminders.items.flatMap((r) => reminderTimesOn(r, date).map((at) => ({ r, at })));
  const doneMarks = reminders.items.filter((r) => r.done && r.repeat === "none" && dateKey(r.dueAt) === date && !marks.some((m) => m.r.id === r.id)).map((r) => ({ r, at: r.dueAt }));
  const planned = dayBlocks.reduce((s, b) => s + (b.end - b.start), 0);
  const done = dayBlocks.filter((b) => b.done).reduce((s, b) => s + (b.end - b.start), 0);
  const d = parseDateKey(date);
  const go = (n: number) => setDate(dateKey(addDays(d, n)));
  const ib = useIbadah();
  const tk = useTasks();
  const pt = ib.times(date);
  const prayerMarks = pt
    ? [
        { label: "Subuh", at: pt.subuh },
        { label: "Dzuhur", at: pt.dzuhur },
        { label: "Ashar", at: pt.ashar },
        { label: "Maghrib", at: pt.maghrib },
        { label: "Isya", at: pt.isya },
      ]
    : [];

  return (
    <div className={`w-day ${orientation === "horizontal" ? "w-day-h" : ""}`}>
      <header className="w-day-head w-nodrag">
        <button className="w-icon" onClick={() => go(-1)} aria-label="Hari sebelumnya"><ChevronLeft size={16} /></button>
        <div className="w-day-title">
          <strong>{date === today ? "Hari ini" : dayLong(d.getTime())}</strong>
          <small>{date === today ? dayLong(d.getTime()) : planned ? `${durationLabel(0, planned)} direncanakan` : "Belum ada blok"}</small>
          {ib.config.setup && <small className="w-day-hijri">{hijriLabel(date, ib.config.hijriOffset)}</small>}
        </div>
        <button className="w-icon" onClick={() => go(1)} aria-label="Hari berikutnya"><ChevronRight size={16} /></button>
      </header>
      {date !== today && (
        <button className="w-btn sm w-today-btn" onClick={() => setDate(today)}>Ke hari ini</button>
      )}

      <section className="w-sec">
        <h2 className="w-sec-title">
          Aktivitas <span>{!planned ? "" : done ? `${durationLabel(0, done)} dari ${durationLabel(0, planned)} selesai` : `${durationLabel(0, planned)} direncanakan`}</span>
        </h2>
        <TaskTray tasks={scope.ids ? tk.tasks.filter((x) => scope.match(x.projectId)) : tk.tasks} projects={tk.projects} date={date} blocks={blocks.items} compact />
        <TimeGrid
          orientation={orientation}
          projects={scope.allProjects}
          defaultProjectId={scope.defaultProjectId}
          dimIds={scope.ids ? new Set(dayBlocks.filter((b) => !scope.match(blockProject(b, tk.tasks))).map((b) => b.id)) : undefined}
          onDropTask={(taskId, minute) => {
            const task = tk.tasks.find((t) => t.id === taskId);
            if (task) blocks.save(boxTask(task, tk.projects, date, minute));
          }}
          date={date}
          blocks={dayBlocks}
          reminders={[...marks, ...doneMarks]}
          prayers={prayerMarks}
          isToday={date === today}
          now={now}
          onSave={(b, id) => blocks.save(b, id)}
          onDelete={(id) => {
            const b = blocks.items.find((x) => x.id === id);
            if (b) void removeBlockSmart(b);
          }}
          onReminderDone={(r) => (r.done ? reminders.save({ ...strip(r), done: false, doneAt: undefined }, r.id) : reminders.save(completeReminder(r), r.id))}
        />
      </section>

      <section className="w-sec">
        <h2 className="w-sec-title">Ibadah</h2>
        <DayIbadah date={date} now={now} />
      </section>

      <section className="w-sec">
        <h2 className="w-sec-title">KPI</h2>
        <DayKpis date={date} />
      </section>

      <section className="w-sec">
        <h2 className="w-sec-title">OKR</h2>
        <DayOkr date={date} />
      </section>

      <section className="w-sec">
        <h2 className="w-sec-title">Catatan</h2>
        <DayNotes date={date} />
      </section>

      {date <= today && (
        <section className="w-sec">
          <h2 className="w-sec-title">Evaluasi hari {date === today ? "ini" : "itu"}</h2>
          <ReviewForm type="day" pkey={date} compact />
        </section>
      )}
    </div>
  );
}
