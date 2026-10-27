import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, CalendarRange, ChevronDown, Columns3, Table2, Inbox, LayoutList, ListTodo, Pencil, Plus, Search, Sun, Trash2, Zap, LayoutTemplate, Clock } from "lucide-react";
import type { Item } from "../lib/types";
import { useTasks } from "../lib/useTasks";
import { parseQuick } from "../lib/quickParse";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { INBOX_ID, isTaskDone, Project, projectOf, PRIORITIES, Task, TaskPriority } from "../lib/tasks";
import { Confirm, useToast } from "../components/ui";
import { useScope } from "../lib/scope";
import { flatTree, projectPath, subtreeIds } from "../lib/projects";
import ProjectForm from "../projects/ProjectForm";
import { ProjectMark } from "../projects/ProjectSwitcher";
import type { Member } from "../lib/team";
import { useRecords } from "../lib/useRecords";
import { BoardView, CalendarView, ListView, TimelineView, ViewProps } from "../tasks/Views";
import { TableView } from "../tasks/CustomFields";
import TaskDetail from "../tasks/TaskDetail";
import { useOpenRequest } from "../lib/deeplink";
import { PaneResizer, usePaneWidth } from "../components/Pane";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu } from "../components/LayoutMenu";

const NO_SECTIONS: SectionDef[] = [];
/** Properti tugas yang bisa ditampilkan/disembunyikan di List, Kanban, dan Kalender. */
export const TASK_PROPS: { id: string; label: string }[] = [
  { id: "status", label: "Titik status" },
  { id: "prioritas", label: "Prioritas" },
  { id: "proyek", label: "Proyek" },
  { id: "tenggat", label: "Tenggat" },
  { id: "orang", label: "Ditugaskan ke" },
  { id: "subtugas", label: "Subtugas" },
  { id: "checklist", label: "Checklist" },
  { id: "estimasi", label: "Estimasi & waktu" },
  { id: "berulang", label: "Berulang" },
  { id: "kr", label: "Key result" },
  { id: "tag", label: "Tag" },
];

export type Scope = { kind: "inbox" | "today" | "week" | "all" } | { kind: "project"; id: string };
export type ViewKind = "list" | "board" | "table" | "calendar" | "timeline" | "plan";

export interface TasksPageSlots {
  /** Tombol timer per tugas (paket time tracking). */
  timer?: (t: Item<Task>) => ReactNode;
  /** Bagian tambahan di panel detail (mis. waktu tercatat). */
  detailExtra?: (t: Item<Task>) => ReactNode;
  /** Menit tercatat per tugas. */
  tracked?: Map<string, number>;
  /** Tampilan "Rencana hari". */
  plan?: (p: ViewProps) => ReactNode;
  /** Panel otomasi & template. */
  side?: "automations" | "templates" | null;
  renderSide?: (kind: "automations" | "templates", close: () => void, t: ReturnType<typeof useTasks>) => ReactNode;
  capacity?: number;
}

const VIEWS: { id: ViewKind; label: string; icon: typeof LayoutList }[] = [
  { id: "list", label: "List", icon: LayoutList },
  { id: "board", label: "Kanban", icon: Columns3 },
  { id: "table", label: "Tabel", icon: Table2 },
  { id: "calendar", label: "Kalender", icon: CalendarDays },
  { id: "timeline", label: "Timeline", icon: CalendarRange },
  { id: "plan", label: "Rencana hari", icon: Clock },
];

function load<T>(key: string, d: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : d;
  } catch {
    return d;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* abaikan */
  }
}

export default function Tasks({ slots = {} }: { slots?: TasksPageSlots }) {
  const t = useTasks();
  const toast = useToast();
  const [scope, setScopeState] = useState<Scope>(() => load("ruangku-tasks-scope", { kind: "today" } as Scope));
  const [view, setViewState] = useState<ViewKind>(() => load("ruangku-tasks-view", "list" as ViewKind));
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [prio, setPrio] = useState<TaskPriority | "">("");
  const [tag, setTag] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [projForm, setProjForm] = useState<Item<Project> | "new" | { parent: string } | null>(null);
  const [mine, setMine] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const global = useScope();
  const members = useRecords<Member>("member");
  const meIds = members.items.filter((m) => m.isMe).map((m) => m.id);
  const meId = members.items.find((m) => m.isMe && !m.workspaceId)?.id ?? meIds[0];
  const [delProj, setDelProj] = useState<Item<Project> | null>(null);
  const [quick, setQuick] = useState("");
  const [side, setSide] = useState<"automations" | "templates" | null>(null);
  const layout = usePageLayout("tasks", NO_SECTIONS);
  const [sideW, setSideW, resetSideW] = usePaneWidth("tasks-side", 250, 170, 420);
  const [detailW, setDetailW, resetDetailW] = usePaneWidth("tasks-detail", 400, 320, 760);
  const hiddenProps = layout.opt<string[]>("hideProps", []);
  const setScope = (s: Scope) => (setScopeState(s), store("ruangku-tasks-scope", s), setSelected(null));
  const setView = (v: ViewKind) => (setViewState(v), store("ruangku-tasks-view", v));

  // Pemilih proyek global → buka proyek itu di sini.
  const lastGlobal = useRef(global.scope);
  useEffect(() => {
    if (global.loading || lastGlobal.current === global.scope) return;
    lastGlobal.current = global.scope;
    if (global.scope !== "all") setScope({ kind: "project", id: global.scope });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global.scope, global.loading]);

  // Dibuka dari tautan tugas di Catatan, palet perintah, kalender, atau widget.
  useOpenRequest("task", setSelected);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        document.getElementById("tk-quick-main")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const today = dateKey();
  const week = dateKey(addDays(parseDateKey(today), 7));
  const scopeProject = scope.kind === "project" ? t.projects.find((p) => p.id === scope.id) ?? null : scope.kind === "inbox" ? projectOf(t.projects, INBOX_ID) : null;
  if (scope.kind === "project" && !scopeProject && !t.loading) setTimeout(() => setScope({ kind: "today" }));
  const projIds = useMemo(() => (scope.kind === "project" ? subtreeIds(t.projects, scope.id) : null), [scope, t.projects]);
  const globalIds = global.ids;
  const sideProjects = useMemo(() => {
    const live = t.projects.filter((p) => p.id !== INBOX_ID && (!globalIds || globalIds.has(p.id)));
    return flatTree(live, collapsed);
  }, [t.projects, globalIds, collapsed]);

  const allTags = useMemo(() => [...new Set(t.tasks.flatMap((x) => x.tags))].sort(), [t.tasks]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return t.tasks.filter((x) => {
      const done = isTaskDone(x, t.projects);
      if (scope.kind === "inbox" && x.projectId !== INBOX_ID) return false;
      if (scope.kind === "project" && !projIds?.has(x.projectId)) return false;
      if (scope.kind !== "inbox" && scope.kind !== "project" && globalIds && !globalIds.has(x.projectId)) return false;
      if (mine && !(x.assignees ?? []).some((a) => meIds.includes(a))) return false;
      if (scope.kind === "today" && !((x.due && x.due <= today && !done) || (done && x.completedAt && dateKey(x.completedAt) === today))) return false;
      if (scope.kind === "week" && !(x.due && x.due <= week && (!done || (x.completedAt && dateKey(x.completedAt) >= today)))) return false;
      if (!showDone && done && scope.kind !== "today" && view !== "calendar" && view !== "timeline" && view !== "table" && !(view === "board" && scope.kind === "project")) return false;
      if (prio && x.priority !== prio) return false;
      if (tag && !x.tags.includes(tag)) return false;
      if (s && !x.title.toLowerCase().includes(s) && !(x.description ?? "").toLowerCase().includes(s)) return false;
      return true;
    });
  }, [t.tasks, t.projects, scope, q, prio, tag, showDone, today, week, view, projIds, globalIds, mine, meIds.join()]);

  const defaults: Partial<Task> = scope.kind === "project" ? { projectId: scope.id } : scope.kind === "today" ? { due: today, projectId: global.defaultProjectId } : { projectId: scope.kind === "inbox" ? undefined : global.defaultProjectId };
  if (mine && meId) defaults.assignees = [meId];
  const counts = useMemo(() => {
    const open = t.tasks.filter((x) => !isTaskDone(x, t.projects));
    const g = open.filter((x) => !globalIds || globalIds.has(x.projectId));
    return {
      inbox: open.filter((x) => x.projectId === INBOX_ID && !x.parentId).length,
      today: g.filter((x) => x.due && x.due <= today).length,
      week: g.filter((x) => x.due && x.due <= week).length,
      all: g.filter((x) => !x.parentId).length,
      project: (id: string) => {
        const ids = subtreeIds(t.projects, id);
        return open.filter((x) => ids.has(x.projectId) && !x.parentId).length;
      },
    };
  }, [t.tasks, t.projects, today, week, globalIds]);

  const addQuick = async () => {
    const parsed = parseQuick(quick, new Date(), t.projects.map((p) => p.name));
    if (!parsed.title) return;
    let projectId = defaults.projectId;
    if (parsed.project) {
      const p = t.projects.find((x) => x.name.toLowerCase() === parsed.project!.toLowerCase()) ?? t.projects.find((x) => x.name.toLowerCase().startsWith(parsed.project!.toLowerCase()));
      if (p) projectId = p.id;
      else toast(`Proyek "${parsed.project}" tidak ditemukan, tugas masuk ke ${projectId ? projectOf(t.projects, projectId).name : "Inbox"}`);
    }
    await t.create({ ...defaults, title: parsed.title, projectId, due: parsed.due ?? defaults.due, dueTime: parsed.dueTime, tags: parsed.tags, priority: parsed.priority, estimate: parsed.estimate, recurrence: parsed.recurrence });
    setQuick("");
  };

  const title =
    scope.kind === "inbox" ? "Inbox" : scope.kind === "today" ? "Hari ini" : scope.kind === "week" ? "7 hari ke depan" : scope.kind === "all" ? "Semua tugas" : scopeProject?.name ?? "";

  const vp: ViewProps = { t, list, scopeProject, onOpen: setSelected, selected, tracked: slots.tracked ?? new Map(), capacity: slots.capacity ?? 360, defaults, timer: slots.timer };
  const scopes: { kind: "inbox" | "today" | "week" | "all"; label: string; icon: typeof Inbox; n: number }[] = [
    { kind: "inbox", label: "Inbox", icon: Inbox, n: counts.inbox },
    { kind: "today", label: "Hari ini", icon: Sun, n: counts.today },
    { kind: "week", label: "7 hari ke depan", icon: CalendarDays, n: counts.week },
    { kind: "all", label: "Semua tugas", icon: ListTodo, n: counts.all },
  ];
  const sel = selected ? t.tasks.find((x) => x.id === selected) : undefined;

  return (
    <div className={`page page-tasks pane-host ${sel ? "with-detail" : ""} ${layout.opt("side", true) ? "" : "side-off"}`} style={{ "--pane-l": `${sideW}px`, "--pane-r": `${detailW}px` } as React.CSSProperties}>
      {layout.opt("side", true) && <PaneResizer value={sideW} onChange={setSideW} onReset={resetSideW} min={170} max={420} label="Lebar panel proyek" />}
      {sel && <PaneResizer value={detailW} onChange={setDetailW} onReset={resetDetailW} edge="right" min={320} max={760} label="Lebar panel detail tugas" />}
      <aside className="tk-side">
        <h1>Tugas</h1>
        <nav aria-label="Ruang lingkup tugas">
          {scopes.map((s) => (
            <button key={s.kind} className={`side-item ${scope.kind === s.kind ? "active" : ""}`} onClick={() => setScope({ kind: s.kind })}>
              <s.icon size={16} /> <span>{s.label}</span> {s.n > 0 && <span className="side-count">{s.n}</span>}
            </button>
          ))}
          <p className="side-label tk-side-label">
            Proyek
            <button className="icon-btn sm" onClick={() => setProjForm("new")} aria-label="Proyek baru" title="Proyek baru"><Plus size={14} /></button>
          </p>
          {sideProjects.length === 0 && <p className="side-empty">Kelompokkan tugas ke dalam proyek dengan alur status sendiri.</p>}
          {sideProjects.map(({ p, depth, hasChildren }) => (
            <div key={p.id} className={`side-item tk-proj ${scope.kind === "project" && scope.id === p.id ? "active" : ""}`} style={{ paddingLeft: 4 + depth * 14 }}>
              <button className="icon-btn sm tk-proj-caret" style={{ visibility: hasChildren ? "visible" : "hidden" }} aria-label={collapsed.has(p.id) ? `Buka ${p.name}` : `Tutup ${p.name}`} onClick={() => setCollapsed((c) => { const n = new Set(c); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })}>
                <ChevronDown size={13} style={{ transform: collapsed.has(p.id) ? "rotate(-90deg)" : "none" }} />
              </button>
              <button className="tk-proj-btn" onClick={() => setScope({ kind: "project", id: p.id })} title={projectPath(t.projects, p.id)}>
                <ProjectMark p={p} size="sm" /> <span>{p.name}</span> {counts.project(p.id) > 0 && <span className="side-count">{counts.project(p.id)}</span>}
              </button>
              <button className="icon-btn sm tk-proj-edit" onClick={() => setProjForm({ parent: p.id })} aria-label={`Subproyek baru di ${p.name}`} title="Subproyek baru"><Plus size={13} /></button>
              <button className="icon-btn sm tk-proj-edit" onClick={() => setProjForm(p)} aria-label={`Ubah ${p.name}`} title="Ubah proyek"><Pencil size={13} /></button>
            </div>
          ))}
          {slots.renderSide && (
            <>
              <p className="side-label">Alat</p>
              <button className={`side-item ${side === "automations" ? "active" : ""}`} onClick={() => setSide(side === "automations" ? null : "automations")}><Zap size={16} /> Otomasi</button>
              <button className={`side-item ${side === "templates" ? "active" : ""}`} onClick={() => setSide(side === "templates" ? null : "templates")}><LayoutTemplate size={16} /> Template</button>
            </>
          )}
        </nav>
      </aside>

      <section className="tk-main-col">
        {side && slots.renderSide ? (
          slots.renderSide(side, () => setSide(null), t)
        ) : (
          <>
            <header className="tk-head">
              <div className="tk-head-title">
                {scopeProject && scope.kind === "project" && scopeProject.parentId && <p className="tk-crumb muted small">{projectPath(t.projects, scopeProject.parentId)}</p>}
                <h2>{scopeProject && scope.kind === "project" && <ProjectMark p={scopeProject} size="lg" />}{title}{global.current && scope.kind !== "project" && scope.kind !== "inbox" && <span className="tk-scope-note"> · {global.current.name}</span>}</h2>
                {scopeProject?.description && <p className="muted small">{scopeProject.description}</p>}
              </div>
              <LayoutMenu layout={layout} title="Atur tampilan tugas" compact>
                <LayoutCheck label="Panel proyek di kiri" checked={layout.opt("side", true)} onChange={(v) => layout.setOpt("side", v)} />
                <LayoutCheck label="Kolom tambah cepat" checked={layout.opt("quick", true)} onChange={(v) => layout.setOpt("quick", v)} />
                <LayoutCheck label="Baris saringan" checked={layout.opt("filters", true)} onChange={(v) => layout.setOpt("filters", v)} />
                <span className="lay-opt-label">Properti yang tampil</span>
                {TASK_PROPS.map((pr) => (
                  <LayoutCheck key={pr.id} label={pr.label} checked={!hiddenProps.includes(pr.id)} onChange={(v) => layout.setOpt("hideProps", v ? hiddenProps.filter((x) => x !== pr.id) : [...hiddenProps, pr.id])} />
                ))}
              </LayoutMenu>
              <div className="seg" role="tablist" aria-label="Tampilan">
                {VIEWS.filter((v) => v.id !== "plan" || slots.plan).map((v) => (
                  <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)}>
                    <v.icon size={14} /> {v.label}
                  </button>
                ))}
              </div>
            </header>

            {layout.opt("quick", true) && <form className="tk-quickmain" onSubmit={(e) => (e.preventDefault(), addQuick())}>
              <Plus size={16} />
              <input
                id="tk-quick-main"
                value={quick}
                onChange={(e) => setQuick(e.target.value)}
                placeholder={`Tambah tugas ke ${scopeProject?.name ?? (scope.kind === "today" ? "hari ini" : "Inbox")}… contoh: Kirim laporan besok jam 14 #kantor !tinggi ~30m`}
                aria-label="Tambah tugas cepat"
              />
              {quick && <QuickPreview text={quick} projects={t.projects} />}
            </form>}

            {layout.opt("filters", true) && <div className="tk-filters">
              <label className="search search-sm">
                <Search size={14} />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari tugas" />
              </label>
              <select value={prio} onChange={(e) => setPrio(e.target.value as TaskPriority | "")} aria-label="Filter prioritas">
                <option value="">Semua prioritas</option>
                {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
              {allTags.length > 0 && (
                <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Filter tag">
                  <option value="">Semua tag</option>
                  {allTags.map((g) => <option key={g} value={g}>#{g}</option>)}
                </select>
              )}
              <label className="switch small"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /><span>Tampilkan yang selesai</span></label>
              {meId && <label className="switch small"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /><span>Hanya tugas saya</span></label>}
              {scopeProject && scope.kind === "project" && (
                <button className="chip-btn" onClick={() => setDelProj(scopeProject)}><Trash2 size={13} /> Hapus proyek</button>
              )}
            </div>}

            <div className={`tk-view ${hiddenProps.map((x) => `tp-hide-${x}`).join(" ")}`}>
              {!t.loading && list.length === 0 && view === "list" && (
                <div className="empty">
                  <p className="empty-title">{scope.kind === "today" ? "Tidak ada tugas untuk hari ini" : "Belum ada tugas di sini"}</p>
                  <p className="empty-text">Ketik di kolom atas. Kata seperti "besok", "jumat", "jam 14", "#tag", "!tinggi", "@Proyek", dan "~30m" langsung dibaca.</p>
                </div>
              )}
              {view === "list" && list.length > 0 && <ListView {...vp} />}
              {view === "board" && <BoardView {...vp} />}
              {view === "table" && <TableView {...vp} />}
              {view === "calendar" && <CalendarView {...vp} />}
              {view === "timeline" && <TimelineView {...vp} />}
              {view === "plan" && slots.plan?.(vp)}
            </div>
          </>
        )}
      </section>

      {sel && <TaskDetail key={sel.id} id={sel.id} t={t} onClose={() => setSelected(null)} onOpen={setSelected} extra={slots.detailExtra?.(sel)} />}

      {projForm && (
        <ProjectForm
          initial={projForm !== "new" && "id" in projForm ? projForm : undefined}
          parentId={projForm !== "new" && "parent" in projForm ? projForm.parent : undefined}
          projects={global.allProjects}
          onClose={() => setProjForm(null)}
          onSave={async (p) => {
            const editing = projForm !== "new" && "id" in projForm;
            const id = await t.saveProject(p, editing ? projForm.id : undefined);
            if (!editing) setScope({ kind: "project", id });
          }}
        />
      )}
      {delProj && (
        <Confirm
          title="Hapus proyek?"
          text={`Proyek "${delProj.name}" dihapus. Tugasnya dipindah ke ${delProj.parentId ? "proyek induk" : "Inbox"} dan subproyeknya naik satu tingkat.`}
          confirmLabel="Hapus proyek"
          onConfirm={() => (t.removeProject(delProj.id), setScope({ kind: "inbox" }))}
          onClose={() => setDelProj(null)}
        />
      )}
    </div>
  );
}

function QuickPreview({ text, projects }: { text: string; projects: Item<Project>[] }) {
  const p = parseQuick(text, new Date(), projects.map((x) => x.name));
  const bits = [
    p.due && `📅 ${p.due === dateKey() ? "hari ini" : p.due}`,
    p.dueTime !== undefined && `⏰ ${String(Math.floor(p.dueTime / 60)).padStart(2, "0")}:${String(p.dueTime % 60).padStart(2, "0")}`,
    p.priority && `⚑ ${PRIORITIES.find((x) => x.id === p.priority)?.label}`,
    p.project && `▣ ${p.project}`,
    p.estimate && `⏱ ${p.estimate} m`,
    p.recurrence && "↻ berulang",
    ...p.tags.map((g) => `#${g}`),
  ].filter(Boolean);
  if (!bits.length) return null;
  return <span className="tk-preview" aria-live="polite">{bits.join("  ")}</span>;
}
