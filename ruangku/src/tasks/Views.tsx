import { DragEvent, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Item } from "../lib/types";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { monthGrid } from "../lib/timeblocks";
import { barRange, statusForColumn, statusIn, dueState, firstDoneStatus, firstOpenStatus, fmtDuration, isTaskDone, orderBetween, PRIORITIES, priorityRank, Project, projectOf, sortTasks, statusesOf, Task, TaskPriority, workload } from "../lib/tasks";
import type { useTasks } from "../lib/useTasks";
import { PriorityFlag, shortDate, StatusDot, TaskCheck, TaskMeta } from "./shared";

type T = ReturnType<typeof useTasks>;
export interface ViewProps {
  t: T;
  list: Item<Task>[]; // tugas yang lolos filter
  scopeProject: Item<Project> | null; // proyek bila sedang melihat satu proyek / inbox
  onOpen: (id: string) => void;
  selected: string | null;
  tracked: Map<string, number>;
  capacity: number; // menit per hari
  defaults: Partial<Task>; // nilai bawaan untuk tugas baru di tampilan ini
  timer?: (t: Item<Task>) => React.ReactNode;
}

const toggle = (t: T, x: Item<Task>) => {
  const p = projectOf(t.projects, x.projectId);
  t.update(x.id, { status: isTaskDone(x, t.projects) ? firstOpenStatus(p) : firstDoneStatus(p) });
};

function QuickAdd({ onAdd, placeholder }: { onAdd: (title: string) => void; placeholder: string }) {
  const [v, setV] = useState("");
  return (
    <form className="tk-quick" onSubmit={(e) => (e.preventDefault(), v.trim() && (onAdd(v.trim()), setV("")))}>
      <Plus size={15} />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </form>
  );
}

// ---------- List ----------

function Row({ x, p, depth, expanded, onExpand, hasSubs }: { x: Item<Task>; p: ViewProps; depth: number; expanded: boolean; onExpand: () => void; hasSubs: boolean }) {
  const done = isTaskDone(x, p.t.projects);
  const proj = projectOf(p.t.projects, x.projectId);
  return (
    <li className={`tk-row ${done ? "done" : ""} ${p.selected === x.id ? "sel" : ""} ${depth ? "sub" : ""}`} onClick={() => p.onOpen(x.id)} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)}>
      <span className="tk-expand">
        {hasSubs && (
          <button className="icon-btn sm" aria-label={expanded ? "Tutup subtugas" : "Buka subtugas"} onClick={(e) => (e.stopPropagation(), onExpand())}>
            <ChevronDown size={14} style={{ transform: expanded ? "none" : "rotate(-90deg)" }} />
          </button>
        )}
      </span>
      <TaskCheck done={done} label={x.title} onToggle={() => toggle(p.t, x)} />
      <StatusDot project={proj} status={x.status} />
      <div className="tk-main">
        <span className="tk-title">{x.title}</span>
        <TaskMeta t={x} all={p.t.tasks} projects={p.t.projects} showProject={!p.scopeProject || x.projectId !== p.scopeProject.id} tracked={p.tracked.get(x.id)} />
      </div>
      <PriorityFlag p={x.priority} />
      {p.timer?.(x)}
    </li>
  );
}

type Group = { key: string; label: string; items: Item<Task>[]; add?: Partial<Task> };

export function ListView(p: ViewProps) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const today = dateKey();
  const top = p.list.filter((x) => !x.parentId || !p.list.some((y) => y.id === x.parentId));
  const groups: Group[] = useMemo(() => {
    if (p.scopeProject) {
      return statusesOf(p.scopeProject).map((s) => ({ key: s.id, label: s.label, items: sortTasks(top.filter((x) => statusIn(p.scopeProject!, x, p.t.projects) === s.id)), add: { status: s.id } }));
    }
    const g: Group[] = [
      { key: "overdue", label: "Terlambat", items: [] },
      { key: "today", label: "Hari ini", items: [], add: { due: today } },
      { key: "tomorrow", label: "Besok", items: [], add: { due: dateKey(addDays(parseDateKey(today), 1)) } },
      { key: "week", label: "7 hari ke depan", items: [] },
      { key: "later", label: "Nanti", items: [] },
      { key: "none", label: "Tanpa tenggat", items: [], add: {} },
      { key: "done", label: "Selesai", items: [] },
    ];
    const tomorrow = dateKey(addDays(parseDateKey(today), 1));
    const week = dateKey(addDays(parseDateKey(today), 7));
    for (const x of top) {
      if (isTaskDone(x, p.t.projects)) g[6].items.push(x);
      else if (!x.due) g[5].items.push(x);
      else if (x.due < today) g[0].items.push(x);
      else if (x.due === today) g[1].items.push(x);
      else if (x.due === tomorrow) g[2].items.push(x);
      else if (x.due <= week) g[3].items.push(x);
      else g[4].items.push(x);
    }
    g.forEach((x) => (x.items = [...x.items].sort((a, b) => (a.due ?? "9").localeCompare(b.due ?? "9") || (a.dueTime ?? 9999) - (b.dueTime ?? 9999) || priorityRank(a.priority) - priorityRank(b.priority))));
    return g.filter((x) => x.items.length || x.key === "today");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.list, p.scopeProject, p.t.projects]);

  const subsOf = (id: string) => sortTasks(p.t.tasks.filter((x) => x.parentId === id && p.list.some((y) => y.id === x.id)));
  const renderTask = (x: Item<Task>, depth = 0): React.ReactNode => {
    const subs = subsOf(x.id);
    const ex = open.has(x.id);
    return (
      <div key={x.id}>
        <Row x={x} p={p} depth={depth} hasSubs={subs.length > 0} expanded={ex} onExpand={() => setOpen((s) => { const n = new Set(s); n.has(x.id) ? n.delete(x.id) : n.add(x.id); return n; })} />
        {ex && <ul className="tk-list sub">{subs.map((s) => renderTask(s, depth + 1))}</ul>}
      </div>
    );
  };

  return (
    <div className="tk-listview">
      {groups.map((g) => (
        <section key={g.key} className="tk-group">
          <h2 className={`tk-group-title ${g.key === "overdue" ? "warn" : ""}`}>
            {g.label} <span className="count">{g.items.length}</span>
          </h2>
          <ul className="tk-list">{g.items.map((x) => renderTask(x))}</ul>
          {g.add && <QuickAdd placeholder="Tambah tugas" onAdd={(title) => p.t.create({ ...p.defaults, ...g.add, title })} />}
        </section>
      ))}
    </div>
  );
}

// ---------- Kanban ----------

export function BoardView(p: ViewProps) {
  const [over, setOver] = useState<string | null>(null);
  const top = p.list.filter((x) => !x.parentId);
  type Col = { id: string; label: string; color?: string; items: Item<Task>[]; patch: (x: Item<Task>) => Partial<Task> };
  const cols: Col[] = p.scopeProject
    ? statusesOf(p.scopeProject).map((s) => ({ id: s.id, label: s.label, color: s.color, items: sortTasks(top.filter((x) => statusIn(p.scopeProject!, x, p.t.projects) === s.id)), patch: (x: Item<Task>) => ({ status: statusForColumn(p.scopeProject!, s.id, x, p.t.projects) }) }))
    : [...PRIORITIES.map((pr) => ({ id: pr.id, label: pr.label, items: sortTasks(top.filter((x) => x.priority === pr.id)), patch: () => ({ priority: pr.id as TaskPriority }) })), { id: "none", label: "Tanpa prioritas", items: sortTasks(top.filter((x) => !x.priority)), patch: () => ({ priority: undefined }) }];

  const drop = (e: DragEvent, col: Col, beforeId: string | null) => {
    e.preventDefault();
    e.stopPropagation();
    setOver(null);
    const id = e.dataTransfer.getData("text/task");
    const x = p.t.tasks.find((y) => y.id === id);
    if (!x || beforeId === id) return;
    p.t.update(id, { ...col.patch(x), order: orderBetween(col.items, beforeId, id) });
  };

  return (
    <div className="tk-board">
      {cols.map((c) => (
        <section key={c.id} className={`tk-col ${over === c.id ? "over" : ""}`} onDragOver={(e) => (e.preventDefault(), setOver(c.id))} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, c, null)}>
          <h2 className="tk-col-title">
            {c.color && <i className={`tk-sdot bc-${c.color}`} />} {c.label} <span className="count">{c.items.length}</span>
          </h2>
          <ul className="tk-cards">
            {c.items.map((x) => {
              const done = isTaskDone(x, p.t.projects);
              return (
                <li
                  key={x.id}
                  className={`tk-card ${done ? "done" : ""} ${p.selected === x.id ? "sel" : ""}`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, c, x.id)}
                  onClick={() => p.onOpen(x.id)}
                >
                  <div className="tk-card-top">
                    <TaskCheck done={done} label={x.title} onToggle={() => toggle(p.t, x)} />
                    <span className="tk-title">{x.title}</span>
                    <PriorityFlag p={x.priority} />
                  </div>
                  <TaskMeta t={x} all={p.t.tasks} projects={p.t.projects} showProject={!p.scopeProject || x.projectId !== p.scopeProject.id} tracked={p.tracked.get(x.id)} />
                </li>
              );
            })}
          </ul>
          <QuickAdd placeholder="Tambah kartu" onAdd={(title) => p.t.create({ ...p.defaults, ...(p.scopeProject ? { status: c.id } : { priority: c.id === "none" ? undefined : (c.id as TaskPriority) }), title })} />
        </section>
      ))}
    </div>
  );
}

// ---------- Kalender ----------

const MONTHS = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export function CalendarView(p: ViewProps) {
  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const dates = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const load = workload(p.list, p.t.projects, dates);
  const today = dateKey();
  const shift = (n: number) => setYm(({ y, m }) => ({ y: m + n < 0 ? y - 1 : m + n > 11 ? y + 1 : y, m: (m + n + 12) % 12 }));
  const undated = p.list.filter((x) => !x.due && !x.parentId && !isTaskDone(x, p.t.projects));

  const moveTo = (id: string, date: string) => {
    const x = p.t.tasks.find((y) => y.id === id);
    if (!x) return;
    let start = x.start;
    if (x.start && x.due) {
      const span = Math.round((parseDateKey(x.due).getTime() - parseDateKey(x.start).getTime()) / 86400000);
      start = dateKey(addDays(parseDateKey(date), -span));
    }
    p.t.update(id, { due: date, start });
  };

  return (
    <div className="tk-cal-wrap">
      <div className="tk-cal">
        <header className="tk-cal-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Bulan sebelumnya"><ChevronLeft size={18} /></button>
          <strong>{MONTHS[ym.m]} {ym.y}</strong>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Bulan berikutnya"><ChevronRight size={18} /></button>
          <button className="chip-btn" onClick={() => setYm({ y: now.getFullYear(), m: now.getMonth() })}>Bulan ini</button>
        </header>
        <div className="tk-cal-grid">
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <span key={d} className="tk-cal-wd">{d}</span>)}
          {dates.map((d) => {
            const dt = parseDateKey(d);
            const items = sortTasks(p.list.filter((x) => x.due === d)).sort((a, b) => Number(isTaskDone(a, p.t.projects)) - Number(isTaskDone(b, p.t.projects)));
            const l = load.get(d)!;
            const pct = Math.min(1, l.minutes / p.capacity);
            return (
              <div
                key={d}
                className={`tk-cal-day ${dt.getMonth() !== ym.m ? "other" : ""} ${d === today ? "today" : ""} ${over === d ? "over" : ""}`}
                onDragOver={(e) => (e.preventDefault(), setOver(d))}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => (e.preventDefault(), setOver(null), moveTo(e.dataTransfer.getData("text/task"), d))}
                onDoubleClick={() => setAdding(d)}
              >
                <div className="tk-cal-num">
                  <span>{dt.getDate()}</span>
                  {l.minutes > 0 && (
                    <span className={`tk-load ${l.minutes > p.capacity ? "over" : ""}`} title={`Beban ${fmtDuration(l.minutes)} dari kapasitas ${fmtDuration(p.capacity)}`}>
                      <i style={{ width: `${pct * 100}%` }} />
                    </span>
                  )}
                </div>
                <ul>
                  {items.slice(0, 4).map((x) => (
                    <li
                      key={x.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)}
                      onClick={() => p.onOpen(x.id)}
                      className={`tk-cal-item bc-soft-${projectOf(p.t.projects, x.projectId).color} ${isTaskDone(x, p.t.projects) ? "done" : ""} ${p.selected === x.id ? "sel" : ""}`}
                      title={x.title}
                    >
                      {x.title}
                    </li>
                  ))}
                  {items.length > 4 && <li className="tk-cal-more">+{items.length - 4} lagi</li>}
                </ul>
                {adding === d && (
                  <form className="tk-cal-add" onSubmit={(e) => { e.preventDefault(); const v = (e.currentTarget.elements.namedItem("t") as HTMLInputElement).value.trim(); if (v) p.t.create({ ...p.defaults, title: v, due: d }); setAdding(null); }}>
                    <input name="t" autoFocus placeholder="Tugas baru" onBlur={() => setAdding(null)} />
                  </form>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted small">Seret tugas ke tanggal lain untuk memindah tenggat. Klik ganda tanggal untuk menambah tugas. Garis di samping tanggal menunjukkan beban estimasi terhadap kapasitas harian.</p>
      </div>
      {undated.length > 0 && (
        <aside className="tk-undated">
          <h3>Belum dijadwalkan</h3>
          <ul>
            {undated.map((x) => (
              <li key={x.id} draggable onDragStart={(e) => e.dataTransfer.setData("text/task", x.id)} onClick={() => p.onOpen(x.id)}>
                <PriorityFlag p={x.priority} /> {x.title}
              </li>
            ))}
          </ul>
          <p className="muted small">Seret ke kalender untuk memberi tenggat.</p>
        </aside>
      )}
    </div>
  );
}

// ---------- Timeline / Gantt ----------

const DAY_W = 34;

export function TimelineView(p: ViewProps) {
  const [start, setStart] = useState(() => {
    const d = addDays(new Date(), -7);
    return dateKey(addDays(d, -((d.getDay() + 6) % 7)));
  });
  const days = 42;
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => dateKey(addDays(parseDateKey(start), i))), [start]);
  const idx = (d: string) => Math.round((parseDateKey(d).getTime() - parseDateKey(start).getTime()) / 86400000);
  const today = dateKey();
  const rows = p.list
    .map((x) => ({ x, r: barRange(x) }))
    .filter((v): v is { x: Item<Task>; r: { start: string; end: string } } => !!v.r)
    .sort((a, b) => a.r.start.localeCompare(b.r.start) || a.r.end.localeCompare(b.r.end));
  const unscheduled = p.list.filter((x) => !barRange(x) && !x.parentId);
  const load = workload(p.list, p.t.projects, dates);
  const drag = useRef<{ id: string; mode: "move" | "start" | "end"; x0: number; s: string; e: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; s: string; e: string } | null>(null);

  const onDown = (e: React.PointerEvent, id: string, mode: "move" | "start" | "end", r: { start: string; end: string }) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { id, mode, x0: e.clientX, s: r.start, e: r.end };
    const move = (ev: PointerEvent) => {
      const d = drag.current!;
      const delta = Math.round((ev.clientX - d.x0) / DAY_W);
      let s = d.s;
      let en = d.e;
      if (d.mode === "move") (s = dateKey(addDays(parseDateKey(d.s), delta))), (en = dateKey(addDays(parseDateKey(d.e), delta)));
      if (d.mode === "start") s = dateKey(addDays(parseDateKey(d.s), delta)) > d.e ? d.e : dateKey(addDays(parseDateKey(d.s), delta));
      if (d.mode === "end") en = dateKey(addDays(parseDateKey(d.e), delta)) < d.s ? d.s : dateKey(addDays(parseDateKey(d.e), delta));
      setPreview({ id: d.id, s, e: en });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      const d = drag.current!;
      drag.current = null;
      setPreview(null);
      if (Math.abs(ev.clientX - d.x0) < 4 && d.mode === "move") return p.onOpen(d.id);
      const delta = Math.round((ev.clientX - d.x0) / DAY_W);
      if (!delta) return;
      const x = p.t.tasks.find((y) => y.id === d.id)!;
      const sh = (v?: string) => (v ? dateKey(addDays(parseDateKey(v), delta)) : v);
      if (d.mode === "move") p.t.update(d.id, { start: sh(x.start ?? x.due), due: sh(x.due ?? x.start) });
      else if (d.mode === "start") p.t.update(d.id, { start: [sh(d.s)!, d.e].sort()[0] , due: x.due ?? d.e });
      else p.t.update(d.id, { due: [d.s, sh(d.e)!].sort()[1], start: x.start ?? d.s });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
  };

  const rowIndex = new Map(rows.map((v, i) => [v.x.id, i]));
  const ROW_H = 34;

  return (
    <div className="tl">
      <header className="tl-head">
        <button className="icon-btn" onClick={() => setStart(dateKey(addDays(parseDateKey(start), -14)))} aria-label="Mundur 2 minggu"><ChevronLeft size={18} /></button>
        <strong>{shortDate(dates[0])} – {shortDate(dates[days - 1])}</strong>
        <button className="icon-btn" onClick={() => setStart(dateKey(addDays(parseDateKey(start), 14)))} aria-label="Maju 2 minggu"><ChevronRight size={18} /></button>
        <span className="muted small">Seret batang untuk menggeser jadwal, tarik ujungnya untuk mengubah mulai atau tenggat.</span>
      </header>
      <div className="tl-scroll">
        <div className="tl-inner" style={{ width: 240 + days * DAY_W }}>
          <div className="tl-row tl-dates">
            <span className="tl-name" />
            {dates.map((d) => {
              const dt = parseDateKey(d);
              return (
                <span key={d} className={`tl-date ${d === today ? "today" : ""} ${dt.getDay() === 0 || dt.getDay() === 6 ? "weekend" : ""}`} style={{ width: DAY_W }}>
                  {dt.getDate() === 1 || d === dates[0] ? <b>{["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"][dt.getMonth()]}</b> : null}
                  {dt.getDate()}
                </span>
              );
            })}
          </div>
          <div className="tl-row tl-load" title="Beban kerja per hari (estimasi tugas yang jatuh tempo)">
            <span className="tl-name muted small">Beban harian</span>
            {dates.map((d) => {
              const l = load.get(d)!;
              const r = l.minutes / p.capacity;
              return <span key={d} className={`tl-loadcell ${r > 1 ? "over" : ""}`} style={{ width: DAY_W }} title={l.minutes ? `${fmtDuration(l.minutes)} · ${l.count} tugas` : ""}><i style={{ height: `${Math.min(1, r) * 100}%` }} /></span>;
            })}
          </div>
          <div className="tl-body" style={{ height: rows.length * ROW_H }}>
            <div className="tl-grid" style={{ left: 240 }}>
              {dates.map((d, i) => {
                const dt = parseDateKey(d);
                return <span key={d} className={`tl-col ${dt.getDay() === 0 || dt.getDay() === 6 ? "weekend" : ""} ${d === today ? "today" : ""}`} style={{ left: i * DAY_W, width: DAY_W }} />;
              })}
            </div>
            <svg className="tl-deps" style={{ left: 240 }} width={days * DAY_W} height={rows.length * ROW_H} aria-hidden="true">
              <defs>
                <marker id="tl-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" className="tl-arrowhead" /></marker>
              </defs>
              {rows.flatMap(({ x, r }) =>
                x.dependsOn.map((dep) => {
                  const from = rows.find((v) => v.x.id === dep);
                  if (!from) return null;
                  const x1 = (idx(from.r.end) + 1) * DAY_W;
                  const y1 = rowIndex.get(dep)! * ROW_H + ROW_H / 2;
                  const x2 = idx(r.start) * DAY_W;
                  const y2 = rowIndex.get(x.id)! * ROW_H + ROW_H / 2;
                  const late = from.r.end >= r.start;
                  return <path key={`${dep}-${x.id}`} d={`M${x1},${y1} C${x1 + 14},${y1} ${x2 - 14},${y2} ${x2},${y2}`} className={`tl-dep ${late ? "late" : ""}`} markerEnd="url(#tl-arrow)" />;
                }),
              )}
            </svg>
            {rows.map(({ x, r }, i) => {
              const pv = preview?.id === x.id ? { start: preview.s, end: preview.e } : r;
              const l = idx(pv.start);
              const w = idx(pv.end) - l + 1;
              const done = isTaskDone(x, p.t.projects);
              const proj = projectOf(p.t.projects, x.projectId);
              return (
                <div key={x.id} className={`tl-row tl-task ${p.selected === x.id ? "sel" : ""}`} style={{ top: i * ROW_H, height: ROW_H }}>
                  <button className="tl-name" onClick={() => p.onOpen(x.id)} title={x.title}>
                    {x.parentId && <span className="muted">↳ </span>}
                    <span className={done ? "done" : ""}>{x.title}</span>
                  </button>
                  {l + w > 0 && l < days && (
                    <div
                      className={`tl-bar bc-${proj.color} ${done ? "done" : ""} ${dueState(x) === "overdue" && !done ? "late" : ""}`}
                      style={{ left: 240 + Math.max(0, l) * DAY_W + 2, width: Math.max(1, Math.min(days, l + w) - Math.max(0, l)) * DAY_W - 4 }}
                      onPointerDown={(e) => onDown(e, x.id, "move", r)}
                      title={`${shortDate(pv.start)} – ${shortDate(pv.end)}`}
                    >
                      <span className="tl-handle l" onPointerDown={(e) => onDown(e, x.id, "start", r)} />
                      <span className="tl-bar-label">{w > 2 ? x.title : ""}</span>
                      <span className="tl-handle r" onPointerDown={(e) => onDown(e, x.id, "end", r)} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {unscheduled.length > 0 && (
        <section className="tl-unscheduled">
          <h3>Belum dijadwalkan</h3>
          <ul>
            {unscheduled.map((x) => (
              <li key={x.id}>
                <button onClick={() => p.onOpen(x.id)}>{x.title}</button>
                <button className="chip-btn" onClick={() => p.t.update(x.id, { start: today, due: dateKey(addDays(new Date(), Math.max(0, Math.ceil((x.estimate ?? 60) / p.capacity) - 1))) })}>Jadwalkan mulai hari ini</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
