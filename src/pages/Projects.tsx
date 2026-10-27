// Halaman Proyek: timeline bertingkat dan daftar proyek & subproyek.
import { useMemo, useState } from "react";
import { Archive, ArchiveRestore, CalendarRange, Crosshair, FolderOpen, LayoutGrid, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { Page } from "../App";
import type { Item, KeyResult, Note, Objective, TimeBlock } from "../lib/types";
import { useTasks } from "../lib/useTasks";
import { strip, useRecords } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { api } from "../lib/api";
import { dateKey, dateShort, parseDateKey } from "../lib/date";
import { fmtDuration, isTaskDone, Project } from "../lib/tasks";
import { blockProject, childrenOf, flatTree, projectSpan, subtreeIds, subtreeProgress } from "../lib/projects";
import { objectiveProgress } from "../lib/metrics";
import type { Member } from "../lib/team";
import { Confirm, Progress, useToast } from "../components/ui";
import ProjectForm from "../projects/ProjectForm";
import Roadmap from "../projects/Roadmap";
import { ProjectMark } from "../projects/ProjectSwitcher";
import { NO_SECTIONS, usePageLayout } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu } from "../components/LayoutMenu";

interface PjView {
  desc: boolean;
  progress: boolean;
  stats: boolean;
  folder: boolean;
}

type Tab = "timeline" | "daftar";

export default function Projects({ go }: { go: (p: Page) => void }) {
  const t = useTasks();
  const scope = useScope();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("ruangku-projects-tab") as Tab) || "timeline");
  const [form, setForm] = useState<{ initial?: Item<Project>; parentId?: string } | null>(null);
  const [del, setDel] = useState<Item<Project> | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const setTabP = (x: Tab) => {
    setTab(x);
    try {
      localStorage.setItem("ruangku-projects-tab", x);
    } catch {
      /* abaikan */
    }
  };
  const openTask = (id: string) => {
    try {
      localStorage.setItem("ruangku-open-task", id);
    } catch {
      /* abaikan */
    }
    go("tasks");
  };

  const pl = usePageLayout("proyek", NO_SECTIONS);
  const view: PjView = { desc: pl.opt("desc", true), progress: pl.opt("progress", true), stats: pl.opt("stats", true), folder: pl.opt("folder", true) };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div>
          <h1>{scope.current ? <><ProjectMark p={scope.current} size="lg" /> {scope.current.name}</> : "Proyek"}</h1>
          <p className="page-sub">
            {scope.current
              ? scope.current.description ?? "Timeline proyek ini beserta subproyeknya, dari skala tahun sampai hari."
              : "Semua proyek dan subproyek Anda. Pilih proyek di kiri atas untuk memfokuskan seluruh aplikasi ke proyek itu."}
          </p>
        </div>
        <div className="btn-row">
          {tab === "daftar" && (
            <LayoutMenu layout={pl} title="Atur tampilan daftar proyek">
              <span className="lay-opt-label">Isi kartu proyek</span>
              <LayoutCheck label="Deskripsi" checked={view.desc} onChange={(v) => pl.setOpt("desc", v)} />
              <LayoutCheck label="Bilah progres tugas" checked={view.progress} onChange={(v) => pl.setOpt("progress", v)} />
              <LayoutCheck label="Statistik (tugas, waktu, OKR, catatan, milestone)" checked={view.stats} onChange={(v) => pl.setOpt("stats", v)} />
              <LayoutCheck label="Tombol folder" checked={view.folder} onChange={(v) => pl.setOpt("folder", v)} />
            </LayoutMenu>
          )}
          <div className="seg" role="tablist" aria-label="Tampilan proyek">
            <button role="tab" aria-selected={tab === "timeline"} className={tab === "timeline" ? "active" : ""} onClick={() => setTabP("timeline")}><CalendarRange size={14} /> Timeline</button>
            <button role="tab" aria-selected={tab === "daftar"} className={tab === "daftar" ? "active" : ""} onClick={() => setTabP("daftar")}><LayoutGrid size={14} /> Daftar</button>
          </div>
          <button className="btn btn-primary" onClick={() => setForm({ parentId: scope.current?.id })}><Plus size={16} /> {scope.current ? "Subproyek" : "Proyek baru"}</button>
        </div>
      </header>

      {tab === "timeline" ? (
        <Roadmap onEditProject={(p) => setForm({ initial: p })} onOpenTask={openTask} />
      ) : (
        <ProjectList
          onEdit={(p) => setForm({ initial: p })}
          onSub={(p) => setForm({ parentId: p.id })}
          onDelete={setDel}
          onFocus={(p) => (scope.setScope(p.id), toast(`Fokus ke ${p.name}: semua halaman kini menampilkan proyek ini.`))}
          go={go}
          showArchived={showArchived}
          setShowArchived={setShowArchived}
          view={view}
        />
      )}

      {form && (
        <ProjectForm
          initial={form.initial}
          parentId={form.parentId}
          projects={scope.allProjects}
          onClose={() => setForm(null)}
          onSave={async (p) => {
            await t.saveProject(p, form.initial?.id);
            toast(form.initial ? "Proyek disimpan" : `Proyek "${p.name}" dibuat`);
          }}
        />
      )}
      {del && (
        <Confirm
          title="Hapus proyek?"
          text={`"${del.name}" dihapus. Tugasnya dipindah ke ${del.parentId ? "proyek induk" : "Inbox"}, subproyeknya naik satu tingkat. Catatan, jadwal, OKR, dan KPI yang tertaut tetap ada tanpa proyek.`}
          confirmLabel="Hapus proyek"
          onConfirm={async () => {
            if (scope.scope === del.id) scope.setScope(del.parentId ?? "all");
            await t.removeProject(del.id);
          }}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}

function ProjectList({
  onEdit,
  onSub,
  onDelete,
  onFocus,
  go,
  showArchived,
  setShowArchived,
  view,
}: {
  onEdit: (p: Item<Project>) => void;
  onSub: (p: Item<Project>) => void;
  onDelete: (p: Item<Project>) => void;
  onFocus: (p: Item<Project>) => void;
  go: (p: Page) => void;
  showArchived: boolean;
  setShowArchived: (v: boolean) => void;
  view: PjView;
}) {
  const t = useTasks();
  const scope = useScope();
  const blocks = useRecords<TimeBlock>("timeblock");
  const notes = useRecords<Note>("note");
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const members = useRecords<Member>("member");
  const today = dateKey();
  const monthStart = today.slice(0, 8) + "01";

  const all = scope.allProjects.filter((p) => showArchived || !p.archived);
  const tree = useMemo(() => {
    const rows = flatTree(all);
    if (!scope.current) return rows;
    const ids = subtreeIds(all, scope.current.id);
    return rows.filter((r) => ids.has(r.p.id)).map((r) => ({ ...r, depth: r.depth - (rows.find((x) => x.p.id === scope.current!.id)?.depth ?? 0) }));
  }, [all, scope.current]);

  if (!tree.length)
    return (
      <div className="empty">
        <p className="empty-title">Belum ada proyek</p>
        <p className="empty-text">Contoh: Internal, Kuliah, Riset Thesis. Setiap proyek bisa punya subproyek, milestone, folder, dan anggota.</p>
      </div>
    );

  return (
    <>
      <div className="pj-tools">
        <label className="switch small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /><span>Tampilkan arsip</span></label>
      </div>
      <div className="pj-list">
        {tree.map(({ p, depth }) => {
          const ids = subtreeIds(scope.allProjects, p.id);
          const pr = subtreeProgress(t.projects, t.tasks, p.id, (x) => isTaskDone(x, t.projects));
          const span = projectSpan(p, t.projects, t.tasks);
          const minutes = blocks.items.filter((b) => b.tracked && b.date >= monthStart && ids.has(blockProject(b, t.tasks) ?? "")).reduce((s, b) => s + b.end - b.start, 0);
          const nNotes = notes.items.filter((n) => n.projectId && ids.has(n.projectId) && !n.isTemplate).length;
          const objs = objectives.items.filter((o) => o.projectId && ids.has(o.projectId) && !o.archived);
          const okr = objs.length ? objs.reduce((s, o) => s + objectiveProgress(krs.items.filter((k) => k.objectiveId === o.id)), 0) / objs.length : null;
          const lead = members.items.find((m) => m.id === p.leadId);
          const nextMs = (p.milestones ?? []).filter((m) => !m.done).sort((a, b) => a.date.localeCompare(b.date))[0];
          const kids = childrenOf(scope.allProjects, p.id).length;
          return (
            <article key={p.id} className={`pj-card d${Math.min(depth, 3)} ${p.archived ? "archived" : ""}`} style={{ marginLeft: depth * 28 }}>
              <span className={`pj-stripe bc-${p.color}`} aria-hidden="true" />
              <div className="pj-main">
                <header>
                  <ProjectMark p={p} size="lg" />
                  <div className="pj-title">
                    <h3>{p.name} {p.workspaceId && <span className="tag tag-xs" title="Dibagikan ke tim"><Users size={10} /> Tim</span>} {p.archived && <span className="tag">Arsip</span>}</h3>
                    <p className="muted small">
                      {span ? `${dateShort(parseDateKey(span.start).getTime())} – ${dateShort(parseDateKey(span.end).getTime())}${span.derived ? " (dari tugas)" : ""}` : "Belum ada tanggal"}
                      {lead ? ` · PJ: ${lead.name}` : ""}
                      {kids ? ` · ${kids} subproyek` : ""}
                    </p>
                  </div>
                  <div className="pj-actions">
                    <button className="chip-btn" onClick={() => onFocus(p)} title="Fokuskan seluruh aplikasi ke proyek ini"><Crosshair size={13} /> Fokus</button>
                    <button className="icon-btn sm" onClick={() => onSub(p)} aria-label={`Subproyek baru di ${p.name}`} title="Subproyek baru"><Plus size={15} /></button>
                    <button className="icon-btn sm" onClick={() => onEdit(p)} aria-label={`Ubah ${p.name}`} title="Ubah"><Pencil size={14} /></button>
                    <button className="icon-btn sm" onClick={() => t.saveProject({ ...strip(p), archived: !p.archived }, p.id)} aria-label={p.archived ? "Pulihkan" : "Arsipkan"} title={p.archived ? "Pulihkan dari arsip" : "Arsipkan"}>
                      {p.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                    </button>
                    <button className="icon-btn sm" onClick={() => onDelete(p)} aria-label={`Hapus ${p.name}`} title="Hapus"><Trash2 size={14} /></button>
                  </div>
                </header>
                {view.desc && p.description && <p className="pj-desc">{p.description}</p>}
                <div className="pj-progress" hidden={!view.progress}>
                  <Progress value={pr.total ? pr.done / pr.total : 0} tone={pr.late ? "waspada" : undefined} />
                  <span className="small">{pr.done}/{pr.total} tugas{pr.late ? <b className="text-danger"> · {pr.late} terlambat</b> : null}</span>
                </div>
                <dl className="pj-stats" hidden={!view.stats}>
                  <div><dt>Tugas terbuka</dt><dd><button className="link" onClick={() => (onFocus(p), go("tasks"))}>{pr.open}</button></dd></div>
                  <div><dt>Waktu bulan ini</dt><dd>{minutes ? fmtDuration(minutes) : "—"}</dd></div>
                  <div><dt>OKR</dt><dd>{okr === null ? "—" : `${Math.round(okr * 100)}%`}</dd></div>
                  <div><dt>Catatan</dt><dd>{nNotes || "—"}</dd></div>
                  <div><dt>Milestone berikut</dt><dd>{nextMs ? `${nextMs.title} · ${dateShort(parseDateKey(nextMs.date).getTime())}` : "—"}</dd></div>
                </dl>
                {view.folder && p.folder && (
                  <button className="chip-btn pj-folder" onClick={() => api.open(p.folder!).catch(() => {})} title={p.folder}>
                    <FolderOpen size={13} /> {p.folder.split(/[\\/]/).filter(Boolean).pop()}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

