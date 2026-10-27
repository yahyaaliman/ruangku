import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Plus, Square, Trash2 } from "lucide-react";
import type { Item, Reminder, TimeBlock } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { addDays, dateKey, dayLong, parseDateKey } from "../lib/date";
import { fmtMin, reminderTimesOn } from "../lib/timeblocks";
import { fmtClock, useTimer } from "../lib/timer";
import { fmtDuration, isTaskDone, Project, projectOf, sortTasks, Task } from "../lib/tasks";
import { useIbadah } from "../lib/useIbadah";
import { completeReminder } from "../pages/reminderActions";
import TimeGrid from "../widget/TimeGrid";
import { PriorityFlag } from "./shared";
import type { ViewProps } from "./Views";

export const WORK_ID = "work-config";
export function useWorkConfig() {
  const rec = useRecords<{ capacity: number }>("workconfig");
  const cfg = rec.items.find((x) => x.id === WORK_ID);
  return { capacity: cfg?.capacity ?? 360, setCapacity: (capacity: number) => rec.save({ capacity }, WORK_ID) };
}

type Timer = ReturnType<typeof useTimer>;

export function TimerButton({ task, timer, projects }: { task: Item<Task>; timer: Timer; projects: Item<Project>[] }) {
  const on = timer.active?.taskId === task.id;
  if (isTaskDone(task, projects) && !on) return <span className="tk-timer-slot" />;
  return (
    <button
      className={`tk-timer ${on ? "on" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        on ? timer.stop() : timer.start(task, projectOf(projects, task.projectId).color);
      }}
      title={on ? "Hentikan timer" : "Mulai timer"}
      aria-label={on ? `Hentikan timer ${task.title}` : `Mulai timer ${task.title}`}
    >
      {on ? <><Square size={11} /> {fmtClock(timer.elapsed)}</> : <Play size={12} />}
    </button>
  );
}

/** Penanda timer yang sedang berjalan (sidebar aplikasi utama). */
export function TimerPill({ timer, onOpen }: { timer: Timer; onOpen?: () => void }) {
  if (!timer.active) return null;
  return (
    <div className="timer-pill" role="status">
      <button className="timer-pill-main" onClick={onOpen} title="Buka tugas">
        <i className="timer-dot" />
        <span>{timer.active.title}</span>
        <b>{fmtClock(timer.elapsed)}</b>
      </button>
      <button className="icon-btn sm" onClick={() => timer.stop()} aria-label="Hentikan timer" title="Hentikan dan catat waktu">
        <Square size={13} />
      </button>
    </div>
  );
}

/** Bagian waktu tercatat di panel detail tugas. */
export function TrackedPanel({ task, timer, projects }: { task: Item<Task>; timer: Timer; projects: Item<Project>[] }) {
  const [manual, setManual] = useState("");
  const sessions = timer.blocks.items.filter((b) => b.tracked && b.taskId === task.id).sort((a, b) => (b.date + fmtMin(b.start)).localeCompare(a.date + fmtMin(a.start)));
  const total = timer.tracked.get(task.id) ?? 0;
  const on = timer.active?.taskId === task.id;
  const pct = task.estimate ? Math.min(1, total / task.estimate) : 0;
  return (
    <section className="td-time-sec">
      <div className="td-time-top">
        <div>
          <span className="td-label">Waktu tercatat</span>
          <b className="td-time-total">{fmtDuration(Math.round(total))}{task.estimate ? <span className="muted"> / {fmtDuration(task.estimate)}</span> : null}</b>
        </div>
        <button className={`btn ${on ? "btn-danger" : "btn-primary"} btn-sm`} onClick={() => (on ? timer.stop() : timer.start(task, projectOf(projects, task.projectId).color))}>
          {on ? <><Square size={13} /> Stop {fmtClock(timer.elapsed)}</> : <><Play size={13} /> Mulai timer</>}
        </button>
      </div>
      {task.estimate ? <div className={`td-time-bar ${total > task.estimate ? "over" : ""}`}><i style={{ width: `${pct * 100}%` }} /></div> : null}
      {sessions.length > 0 && (
        <ul className="td-sessions">
          {sessions.slice(0, 5).map((s) => (
            <li key={s.id}>
              <span>{s.date === dateKey() ? "Hari ini" : s.date}</span>
              <span>{fmtMin(s.start)}–{fmtMin(s.end)}</span>
              <b>{fmtDuration(s.end - s.start)}</b>
              <button className="icon-btn sm" aria-label="Hapus sesi" onClick={() => timer.blocks.remove(s.id)}><Trash2 size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="td-manual"
        onSubmit={(e) => {
          e.preventDefault();
          const m = Math.round(Number(manual.replace(",", ".")) || 0);
          if (m <= 0) return;
          const now = new Date();
          const end = Math.max(m, now.getHours() * 60 + now.getMinutes());
          timer.blocks.save({ date: dateKey(), start: end - m, end, title: task.title, color: projectOf(projects, task.projectId).color, done: true, taskId: task.id, tracked: true });
          setManual("");
        }}
      >
        <Plus size={13} />
        <input value={manual} inputMode="numeric" placeholder="Catat manual (menit), mis. 45" onChange={(e) => setManual(e.target.value)} aria-label="Catat waktu manual dalam menit" />
      </form>
    </section>
  );
}

/** Daftar tugas yang bisa diseret ke grid jam. */
export function TaskTray({ tasks, projects, date, blocks, compact }: { tasks: Item<Task>[]; projects: Item<Project>[]; date: string; blocks: Item<TimeBlock>[]; compact?: boolean }) {
  const list = sortTasks(tasks.filter((t) => !isTaskDone(t, projects) && (!t.due || t.due <= date))).sort((a, b) => Number(!!b.due) - Number(!!a.due));
  const boxed = new Set(blocks.filter((b) => b.date === date && b.taskId && !b.tracked).map((b) => b.taskId));
  if (!list.length) return compact ? null : <p className="muted small">Tidak ada tugas terbuka untuk dijadwalkan.</p>;
  return (
    <ul className={compact ? "w-tray w-nodrag" : "plan-tray"}>
      {list.slice(0, compact ? 6 : 50).map((t) => (
        <li
          key={t.id}
          className={compact ? "w-tray-item" : `plan-item ${boxed.has(t.id) ? "boxed" : ""}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/task", t.id);
            e.dataTransfer.effectAllowed = "copy";
          }}
          title="Seret ke jam yang diinginkan"
        >
          {projectOf(projects, t.projectId).icon ? <span className="plan-icon" aria-hidden="true">{projectOf(projects, t.projectId).icon}</span> : <i className={`tk-pdot bc-${projectOf(projects, t.projectId).color}`} />}
          <span className="plan-title">{t.title}</span>
          {!compact && <PriorityFlag p={t.priority} />}
          <small>{t.estimate ? fmtDuration(t.estimate) : "1 j"}{boxed.has(t.id) ? " ✓" : ""}</small>
        </li>
      ))}
    </ul>
  );
}

/** Buat blok waktu dari tugas yang dijatuhkan di grid. */
export function boxTask(task: Item<Task>, projects: Item<Project>[], date: string, minute: number): TimeBlock {
  const dur = task.estimate ?? 60;
  const start = Math.min(minute, 1440 - 15);
  return { date, start, end: Math.min(1440, start + dur), title: task.title, color: projectOf(projects, task.projectId).color, taskId: task.id, ...(task.projectId !== "inbox" ? { projectId: task.projectId } : {}) };
}

/** Tampilan "Rencana hari": seret tugas ke grid jam (timeboxing). */
export function PlanDay(p: ViewProps & { clock: Timer; work: ReturnType<typeof useWorkConfig> }) {
  const [date, setDate] = useState(dateKey());
  const reminders = useRecords<Reminder>("reminder");
  const ib = useIbadah();
  const blocks = p.clock.blocks;
  const dayBlocks = blocks.items.filter((b) => b.date === date);
  const planned = dayBlocks.filter((b) => !b.tracked).reduce((s, b) => s + b.end - b.start, 0);
  const tracked = dayBlocks.filter((b) => b.tracked).reduce((s, b) => s + b.end - b.start, 0);
  const dueEst = p.t.tasks.filter((t) => t.due === date && !isTaskDone(t, p.t.projects)).reduce((s, t) => s + (t.estimate ?? 30), 0);
  const marks = reminders.items.flatMap((r) => reminderTimesOn(r, date).map((at) => ({ r, at })));
  const pt = ib.times(date);
  const prayers = pt ? (["subuh", "dzuhur", "ashar", "maghrib", "isya"] as const).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), at: pt[k] })) : [];
  const pool = useMemo(() => (p.scopeProject ? p.t.tasks.filter((t) => t.projectId === p.scopeProject!.id) : p.t.tasks), [p.t.tasks, p.scopeProject]);
  const over = planned > p.work.capacity;

  return (
    <div className="plan">
      <aside className="plan-side">
        <h3>Tugas untuk dijadwalkan</h3>
        <p className="muted small">Seret tugas ke jam di sebelah kanan. Durasi blok mengikuti estimasi tugas.</p>
        <TaskTray tasks={pool} projects={p.t.projects} date={date} blocks={blocks.items} />
      </aside>
      <section className="plan-main">
        <header className="plan-head">
          <button className="icon-btn" onClick={() => setDate(dateKey(addDays(parseDateKey(date), -1)))} aria-label="Hari sebelumnya"><ChevronLeft size={18} /></button>
          <strong>{date === dateKey() ? "Hari ini" : dayLong(parseDateKey(date).getTime())}</strong>
          <button className="icon-btn" onClick={() => setDate(dateKey(addDays(parseDateKey(date), 1)))} aria-label="Hari berikutnya"><ChevronRight size={18} /></button>
          {date !== dateKey() && <button className="chip-btn" onClick={() => setDate(dateKey())}>Hari ini</button>}
          <div className="plan-load">
            <div className={`plan-load-bar ${over ? "over" : ""}`}><i style={{ width: `${Math.min(1, planned / p.work.capacity) * 100}%` }} /></div>
            <span>
              Direncanakan <b>{fmtDuration(planned)}</b> dari kapasitas
              <select value={p.work.capacity} onChange={(e) => p.work.setCapacity(Number(e.target.value))} aria-label="Kapasitas harian">
                {[240, 300, 360, 420, 480, 540, 600].map((m) => <option key={m} value={m}>{m / 60} jam</option>)}
              </select>
              {tracked > 0 && <> · tercatat {fmtDuration(tracked)}</>}
              {dueEst > 0 && <> · estimasi tugas jatuh tempo {fmtDuration(dueEst)}</>}
            </span>
          </div>
        </header>
        {over && <p className="plan-warn">Rencana hari ini melebihi kapasitas. Pertimbangkan memindah sebagian tugas ke hari lain.</p>}
        <div className="tg-host">
          <TimeGrid
            date={date}
            blocks={dayBlocks}
            reminders={marks}
            prayers={prayers}
            isToday={date === dateKey()}
            now={Date.now()}
            onSave={(b, id) => blocks.save(b, id)}
            onDelete={(id) => blocks.remove(id)}
            onReminderDone={(r) => (r.done ? reminders.save({ ...strip(r), done: false, doneAt: undefined }, r.id) : reminders.save(completeReminder(r), r.id))}
            onDropTask={(taskId, minute) => {
              const task = p.t.tasks.find((t) => t.id === taskId);
              if (task) blocks.save(boxTask(task, p.t.projects, date, minute));
            }}
          />
        </div>
      </section>
    </div>
  );
}
