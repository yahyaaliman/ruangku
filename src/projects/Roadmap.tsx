// Timeline proyek bertingkat: Tahun → Triwulan → Bulan → Minggu → Hari.
import { PointerEvent as RPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Crosshair } from "lucide-react";
import type { Item, Objective, TimeBlock } from "../lib/types";
import { useTasks } from "../lib/useTasks";
import { useRecords, strip } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { dateKey } from "../lib/date";
import { barRange, isTaskDone, Project, Task } from "../lib/tasks";
import { blockProject, childrenOf, projectSpan, subtreeIds, subtreeProgress } from "../lib/projects";
import { barGeom, daysBetween, makeScale, periodLabel, Scale, shiftAnchor, shiftDate, xOfDate, Zoom, ZOOMS } from "../lib/roadmap";
import { fmtMin } from "../lib/timeblocks";
import { ProjectMark } from "./ProjectSwitcher";
import { PaneResizer, usePaneWidth } from "../components/Pane";

type Row =
  | { kind: "project"; p: Item<Project>; depth: number; hasKids: boolean }
  | { kind: "task"; t: Item<Task>; depth: number; color: string }
  | { kind: "okr"; o: Item<Objective>; depth: number; color: string };

type Drag = { id: string; kind: "project" | "task"; mode: "move" | "l" | "r"; x0: number; start: string; end: string; dx: number };

function loadSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]"));
  } catch {
    return new Set();
  }
}

function quarterRange(period: string): [string, string] | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const q = Number(m[2]) - 1;
  return [dateKey(new Date(y, q * 3, 1)), dateKey(new Date(y, q * 3 + 3, 0))];
}

export default function Roadmap({ onEditProject, onOpenTask }: { onEditProject: (p: Item<Project>) => void; onOpenTask: (id: string) => void }) {
  const t = useTasks();
  const scope = useScope();
  const [labelW, setLabelW, resetLabelW] = usePaneWidth("roadmap-labels", 270, 180, 520);
  const objectives = useRecords<Objective>("objective");
  const blocks = useRecords<TimeBlock>("timeblock");
  const [zoom, setZoom] = useState<Zoom>(() => (localStorage.getItem("ruangku-rm-zoom") as Zoom) || "triwulan");
  const [anchor, setAnchor] = useState(dateKey());
  const [showTasks, setShowTasks] = useState(() => localStorage.getItem("ruangku-rm-tasks") !== "0");
  const [showOkr, setShowOkr] = useState(() => localStorage.getItem("ruangku-rm-okr") !== "0");
  const [showDone, setShowDone] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => loadSet("ruangku-rm-collapsed"));
  const [drag, setDrag] = useState<Drag | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const today = dateKey();

  useEffect(() => {
    try {
      localStorage.setItem("ruangku-rm-zoom", zoom);
      localStorage.setItem("ruangku-rm-tasks", showTasks ? "1" : "0");
      localStorage.setItem("ruangku-rm-okr", showOkr ? "1" : "0");
      localStorage.setItem("ruangku-rm-collapsed", JSON.stringify([...collapsed]));
    } catch {
      /* abaikan */
    }
  }, [zoom, showTasks, showOkr, collapsed]);

  const scale = useMemo(() => makeScale(zoom, anchor, today), [zoom, anchor, today]);
  const projects = t.projects.filter((p) => p.id !== "inbox");

  // Gulir ke hari ini saat zoom/jangkar berubah.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (zoom === "hari") {
      const now = new Date();
      el.scrollLeft = Math.max(0, ((now.getHours() - 2) * 60 * scale.dayWidth) / 1440);
    } else if (today >= scale.from && today <= scale.to) el.scrollLeft = Math.max(0, xOfDate(scale, today) - el.clientWidth / 3);
    else el.scrollLeft = 0;
  }, [scale, zoom, today]);

  const rows = useMemo(() => {
    const out: Row[] = [];
    const roots = scope.current ? [scope.current] : childrenOf(projects, undefined);
    const walk = (p: Item<Project>, depth: number) => {
      const kids = childrenOf(projects, p.id);
      out.push({ kind: "project", p, depth, hasKids: kids.length > 0 || (showTasks && t.tasks.some((x) => x.projectId === p.id)) });
      if (collapsed.has(p.id)) return;
      if (showOkr) for (const o of objectives.items.filter((o) => o.projectId === p.id && !o.archived)) out.push({ kind: "okr", o, depth: depth + 1, color: p.color });
      for (const k of kids) walk(k, depth + 1);
      if (showTasks && zoom !== "hari") {
        const ts = t.tasks
          .filter((x) => x.projectId === p.id && !x.parentId && (showDone || !isTaskDone(x, t.projects)) && barRange(x))
          .sort((a, b) => (barRange(a)!.start).localeCompare(barRange(b)!.start));
        for (const x of ts) out.push({ kind: "task", t: x, depth: depth + 1, color: p.color });
      }
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [projects, scope.current, collapsed, showTasks, showOkr, showDone, t.tasks, t.projects, objectives.items, zoom]);

  const toggle = (id: string) => setCollapsed((c) => {
    const n = new Set(c);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  // ---------- seret batang ----------
  const startDrag = (e: RPointerEvent, kind: Drag["kind"], id: string, mode: Drag["mode"], start: string, end: string) => {
    if (zoom === "hari") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id, kind, mode, x0: e.clientX, start, end, dx: 0 });
  };
  const deltaDays = (d: Drag) => Math.round(d.dx / scale.dayWidth);
  const preview = (d: Drag | null, id: string, start: string, end: string): [string, string] => {
    if (!d || d.id !== id) return [start, end];
    const n = deltaDays(d);
    if (d.mode === "move") return [shiftDate(start, n), shiftDate(end, n)];
    if (d.mode === "l") {
      const s = shiftDate(start, n);
      return [s > end ? end : s, end];
    }
    const e = shiftDate(end, n);
    return [start, e < start ? start : e];
  };
  const endDrag = async () => {
    const d = drag;
    setDrag(null);
    if (!d) return;
    const [s, e] = preview(d, d.id, d.start, d.end);
    if (Math.abs(d.dx) < 3) {
      // klik biasa
      if (d.kind === "project") {
        const p = projects.find((x) => x.id === d.id);
        if (p) onEditProject(p);
      } else onOpenTask(d.id);
      return;
    }
    if (s === d.start && e === d.end) return;
    if (d.kind === "project") {
      const p = projects.find((x) => x.id === d.id);
      if (p) await t.saveProject({ ...strip(p), start: s, end: e }, p.id);
    } else {
      const x = t.tasks.find((y) => y.id === d.id);
      if (!x) return;
      const patch: Partial<Task> = {};
      if (x.start) patch.start = s;
      if (x.due) patch.due = e;
      if (!x.start && d.mode === "l" && s !== e) patch.start = s;
      if (!x.due && d.mode === "r" && s !== e) patch.due = e;
      if (!x.start && !x.due) Object.assign(patch, { start: s, due: e });
      await t.update(x.id, patch);
    }
  };

  const dayBlocks = useMemo(() => (zoom === "hari" ? blocks.items.filter((b) => b.date === scale.from) : []), [blocks.items, zoom, scale.from]);
  const nowX = zoom === "hari" ? (scale.from === today ? ((new Date().getHours() * 60 + new Date().getMinutes()) * scale.dayWidth) / 1440 : null) : today >= scale.from && today <= scale.to ? xOfDate(scale, today) + scale.dayWidth / 2 : null;

  const H = (r: Row) => (r.kind === "project" ? (r.depth === 0 ? 40 : 34) : 28);
  const totalH = rows.reduce((s, r) => s + H(r), 0);

  return (
    <div className="rm">
      <div className="rm-bar">
        <div className="seg" role="tablist" aria-label="Skala timeline">
          {ZOOMS.map((z) => (
            <button key={z.id} role="tab" aria-selected={zoom === z.id} className={zoom === z.id ? "active" : ""} onClick={() => setZoom(z.id)}>{z.label}</button>
          ))}
        </div>
        <div className="rm-nav">
          <button className="icon-btn" onClick={() => setAnchor(shiftAnchor(zoom, anchor, -1))} aria-label="Sebelumnya"><ChevronLeft size={17} /></button>
          <strong>{periodLabel(zoom, anchor)}</strong>
          <button className="icon-btn" onClick={() => setAnchor(shiftAnchor(zoom, anchor, 1))} aria-label="Berikutnya"><ChevronRight size={17} /></button>
          <button className="chip-btn" onClick={() => setAnchor(today)}><Crosshair size={13} /> Hari ini</button>
        </div>
        <div className="rm-toggles">
          <label className="switch small"><input type="checkbox" checked={showTasks} onChange={(e) => setShowTasks(e.target.checked)} /><span>Tugas</span></label>
          <label className="switch small"><input type="checkbox" checked={showOkr} onChange={(e) => setShowOkr(e.target.checked)} /><span>OKR</span></label>
          <label className="switch small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /><span>Yang selesai</span></label>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Belum ada proyek</p>
          <p className="empty-text">Buat proyek dan subproyek, beri tanggal mulai dan selesai, lalu lihat semuanya di sini dari skala tahun sampai hari.</p>
        </div>
      ) : (
        <div className="rm-frame pane-host" style={{ ["--pane-l" as string]: `${labelW}px` }}>
          <PaneResizer value={labelW} onChange={setLabelW} onReset={resetLabelW} min={180} max={520} label="Lebar kolom nama" />
          <div className="rm-labels" style={{ paddingTop: 58 }}>
            {rows.map((r) => (
              <div key={`${r.kind}:${r.kind === "project" ? r.p.id : r.kind === "task" ? r.t.id : r.o.id}`} className={`rm-label rm-${r.kind} d${Math.min(r.depth, 4)}`} style={{ height: H(r), paddingLeft: 8 + r.depth * 16 }}>
                {r.kind === "project" ? (
                  <>
                    <button className="icon-btn sm rm-caret" onClick={() => toggle(r.p.id)} aria-label={collapsed.has(r.p.id) ? `Buka ${r.p.name}` : `Tutup ${r.p.name}`} style={{ visibility: r.hasKids ? "visible" : "hidden" }}>
                      <ChevronDown size={14} style={{ transform: collapsed.has(r.p.id) ? "rotate(-90deg)" : "none" }} />
                    </button>
                    <ProjectMark p={r.p} size="sm" />
                    <button className="rm-name" onClick={() => onEditProject(r.p)} title={r.p.description ?? r.p.name}>{r.p.name}</button>
                    <ProgressMini p={r.p} t={t} />
                  </>
                ) : r.kind === "task" ? (
                  <button className={`rm-name rm-taskname ${isTaskDone(r.t, t.projects) ? "done" : ""}`} onClick={() => onOpenTask(r.t.id)}>{r.t.title}</button>
                ) : (
                  <span className="rm-name rm-okrname" title="Objective (OKR)">◎ {r.o.title}</span>
                )}
              </div>
            ))}
          </div>
          <div className="rm-scroll" ref={scroller}>
            <div className="rm-canvas" style={{ width: scale.width, height: totalH + 58 }}>
              <Header scale={scale} />
              <Grid scale={scale} height={totalH} />
              {nowX !== null && <div className="rm-now" style={{ left: nowX, height: totalH + 58 }} />}
              <div className="rm-rows" onPointerMove={(e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 })} onPointerUp={endDrag} onPointerCancel={() => setDrag(null)}>
                {(() => {
                  let y = 0;
                  return rows.map((r) => {
                    const top = y;
                    y += H(r);
                    const key = `${r.kind}:${r.kind === "project" ? r.p.id : r.kind === "task" ? r.t.id : r.o.id}`;
                    return (
                      <div key={key} className={`rm-row rm-row-${r.kind}`} style={{ top, height: H(r) }}>
                        {zoom === "hari"
                          ? r.kind === "project" && <DayLane p={r.p} t={t} blocks={dayBlocks} scale={scale} date={scale.from} projects={projects} />
                          : r.kind === "project"
                            ? <ProjectBar r={r} t={t} scale={scale} drag={drag} preview={preview} startDrag={startDrag} />
                            : r.kind === "task"
                              ? <TaskBar x={r.t} color={r.color} t={t} scale={scale} drag={drag} preview={preview} startDrag={startDrag} />
                              : <OkrBar o={r.o} color={r.color} scale={scale} />}
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      <p className="muted small rm-hint">
        {zoom === "hari"
          ? "Skala hari menampilkan blok jadwal dan tugas yang jatuh tempo per proyek. Ubah blok di halaman Jadwal."
          : "Seret batang untuk menggeser, tarik ujungnya untuk mengubah tanggal. Klik batang proyek untuk mengubah detail. Batang putus-putus = tanggal dihitung dari tugasnya."}
      </p>
    </div>
  );
}

function ProgressMini({ p, t }: { p: Item<Project>; t: ReturnType<typeof useTasks> }) {
  const pr = subtreeProgress(t.projects, t.tasks, p.id, (x) => isTaskDone(x, t.projects));
  if (!pr.total) return null;
  return (
    <span className="rm-prog" title={`${pr.done} dari ${pr.total} tugas selesai${pr.late ? `, ${pr.late} terlambat` : ""}`}>
      {Math.round((pr.done / pr.total) * 100)}%{pr.late ? <b> · {pr.late}!</b> : null}
    </span>
  );
}

function Header({ scale }: { scale: Scale }) {
  const unit = scale.zoom === "hari" ? scale.dayWidth : scale.dayWidth;
  return (
    <div className="rm-head">
      {scale.tiers.map((tier, i) => {
        let x = 0;
        return (
          <div key={i} className={`rm-tier rm-tier-${i}`}>
            {tier.map((c, j) => {
              const w = c.days * unit;
              const left = x;
              x += w;
              return (
                <span key={j} className={`rm-cell ${c.today ? "today" : ""} ${c.weekend ? "weekend" : ""}`} style={{ left, width: w }} title={c.title}>
                  {c.label}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function Grid({ scale, height }: { scale: Scale; height: number }) {
  const lower = scale.tiers[1];
  let x = 0;
  return (
    <div className="rm-grid" style={{ height, top: 58 }}>
      {lower.map((c, i) => {
        const w = c.days * scale.dayWidth;
        const left = x;
        x += w;
        return <i key={i} className={`${c.weekend ? "weekend" : ""} ${c.today ? "today" : ""}`} style={{ left, width: w }} />;
      })}
    </div>
  );
}

type BarProps = {
  t: ReturnType<typeof useTasks>;
  scale: Scale;
  drag: Drag | null;
  preview: (d: Drag | null, id: string, s: string, e: string) => [string, string];
  startDrag: (ev: RPointerEvent, kind: Drag["kind"], id: string, mode: Drag["mode"], start: string, end: string) => void;
};

function ProjectBar({ r, t, scale, drag, preview, startDrag }: BarProps & { r: Extract<Row, { kind: "project" }> }) {
  const span = projectSpan(r.p, t.projects, t.tasks);
  const milestones = r.p.milestones ?? [];
  const today = dateKey();
  const content = [];
  if (span) {
    const [s, e] = preview(drag, r.p.id, span.start, span.end);
    const g = barGeom(scale, s, e);
    const pr = subtreeProgress(t.projects, t.tasks, r.p.id, (x) => isTaskDone(x, t.projects));
    const late = !!r.p.end && r.p.end < today && pr.open > 0;
    if (g)
      content.push(
        <div
          key="bar"
          className={`rm-pbar bc-${r.p.color} ${span.derived ? "derived" : ""} ${late ? "late" : ""} ${drag?.id === r.p.id ? "dragging" : ""} ${g.cutStart ? "cut-l" : ""} ${g.cutEnd ? "cut-r" : ""}`}
          style={{ left: g.left, width: g.width }}
          onPointerDown={(ev) => startDrag(ev, "project", r.p.id, "move", span.start, span.end)}
          title={`${r.p.name}: ${s} – ${e} (${daysBetween(s, e) + 1} hari)${pr.total ? ` · ${pr.done}/${pr.total} tugas selesai` : ""}`}
        >
          <i className="rm-pfill" style={{ width: pr.total ? `${(pr.done / pr.total) * 100}%` : 0 }} />
          <span className="rm-blabel">{r.p.icon ? `${r.p.icon} ` : ""}{r.p.name}</span>
          <span className="rm-handle l" onPointerDown={(ev) => startDrag(ev, "project", r.p.id, "l", span.start, span.end)} />
          <span className="rm-handle r" onPointerDown={(ev) => startDrag(ev, "project", r.p.id, "r", span.start, span.end)} />
        </div>,
      );
  }
  for (const m of milestones) {
    if (m.date < scale.from || m.date > scale.to) continue;
    content.push(
      <span key={m.id} className={`rm-ms ${m.done ? "done" : m.date < today ? "late" : ""}`} style={{ left: xOfDate(scale, m.date) + scale.dayWidth / 2 }} title={`Milestone: ${m.title} · ${m.date}${m.done ? " (tercapai)" : ""}`}>
        <i />
        {scale.dayWidth >= 13 && <em>{m.title}</em>}
      </span>,
    );
  }
  return <>{content}</>;
}

function TaskBar({ x, color, t, scale, drag, preview, startDrag }: BarProps & { x: Item<Task>; color: string }) {
  const r = barRange(x)!;
  const [s, e] = preview(drag, x.id, r.start, r.end);
  const g = barGeom(scale, s, e);
  if (!g) return null;
  const done = isTaskDone(x, t.projects);
  const late = !done && !!x.due && x.due < dateKey();
  return (
    <div
      className={`rm-tbar bc-${color} ${done ? "done" : ""} ${late ? "late" : ""} ${s === e ? "dot" : ""}`}
      style={{ left: g.left, width: g.width }}
      onPointerDown={(ev) => startDrag(ev, "task", x.id, "move", r.start, r.end)}
      title={`${x.title}: ${s === e ? s : `${s} – ${e}`}`}
    >
      {g.width > 60 && <span className="rm-blabel">{x.title}</span>}
      <span className="rm-handle l" onPointerDown={(ev) => startDrag(ev, "task", x.id, "l", r.start, r.end)} />
      <span className="rm-handle r" onPointerDown={(ev) => startDrag(ev, "task", x.id, "r", r.start, r.end)} />
    </div>
  );
}

function OkrBar({ o, color, scale }: { o: Item<Objective>; color: string; scale: Scale }) {
  const r = quarterRange(o.period);
  if (!r) return null;
  const g = barGeom(scale, r[0], r[1]);
  if (!g) return null;
  return (
    <div className={`rm-obar bc-${color}`} style={{ left: g.left, width: g.width }} title={`OKR ${o.period}: ${o.title}`}>
      {g.width > 80 && <span className="rm-blabel">◎ {o.title}</span>}
    </div>
  );
}

function DayLane({ p, t, blocks, scale, date, projects }: { p: Item<Project>; t: ReturnType<typeof useTasks>; blocks: Item<TimeBlock>[]; scale: Scale; date: string; projects: Item<Project>[] }) {
  const ids = subtreeIds(projects, p.id);
  const px = scale.dayWidth / 1440;
  const mine = blocks.filter((b) => {
    const pid = blockProject(b, t.tasks);
    return pid && ids.has(pid);
  });
  const due = t.tasks.filter((x) => ids.has(x.projectId) && x.due === date && !isTaskDone(x, t.projects));
  return (
    <>
      {mine.map((b) => (
        <div key={b.id} className={`rm-block bc-${b.color ?? p.color} ${b.tracked ? "tracked" : ""} ${b.done ? "done" : ""}`} style={{ left: b.start * px, width: Math.max(6, (b.end - b.start) * px) }} title={`${fmtMin(b.start)}–${fmtMin(b.end)} ${b.title}`}>
          <span className="rm-blabel">{fmtMin(b.start)} {b.title}</span>
        </div>
      ))}
      {due.map((x, i) => (
        <span key={x.id} className="rm-due" style={{ left: (x.dueTime ?? 17 * 60 + i * 20) * px }} title={`Tenggat: ${x.title}${x.dueTime !== undefined ? ` jam ${fmtMin(x.dueTime)}` : ""}`}>
          ⚑ {x.title}
        </span>
      ))}
    </>
  );
}
