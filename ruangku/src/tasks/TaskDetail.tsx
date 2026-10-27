import { ReactNode, useEffect, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Item, Objective } from "../lib/types";
import { useRecords } from "../lib/useRecords";
import { newId } from "../lib/api";
import { fmtMin, parseHHMM } from "../lib/timeblocks";
import { firstDoneStatus, firstOpenStatus, isTaskDone, PRIORITIES, projectOf, RECUR_LABEL, RecurFreq, statusesOf, Task, wouldCycle } from "../lib/tasks";
import type { useTasks } from "../lib/useTasks";
import { Confirm } from "../components/ui";
import { TaskCheck, TaskMeta } from "./shared";
import { AssigneePicker } from "../team/Avatars";
import type { Member } from "../lib/team";
import { ProjectSelect } from "../projects/ProjectSwitcher";
import { lineage, projectPath } from "../lib/projects";
import Comments from "../collab/Comments";
import { FieldInput } from "./CustomFields";
import { fieldsFor } from "../lib/customFields";
import { useAccess } from "../lib/access";

type T = ReturnType<typeof useTasks>;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="td-row">
      <span className="td-label">{label}</span>
      <div className="td-value">{children}</div>
    </div>
  );
}

export default function TaskDetail({ id, t: api, onClose, onOpen, extra }: { id: string; t: T; onClose: () => void; onOpen: (id: string) => void; extra?: ReactNode }) {
  const task = api.tasks.find((x) => x.id === id);
  const objectives = useRecords<Objective>("objective");
  const members = useRecords<Member>("member");
  const [title, setTitle] = useState(task?.title ?? "");
  const [desc, setDesc] = useState(task?.description ?? "");
  const [tags, setTags] = useState(task?.tags.join(", ") ?? "");
  const [time, setTime] = useState(task?.dueTime !== undefined ? fmtMin(task.dueTime) : "");
  const [newCheck, setNewCheck] = useState("");
  const [newSub, setNewSub] = useState("");
  const [depQuery, setDepQuery] = useState("");
  const [del, setDel] = useState(false);
  const access = useAccess();
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setDesc(task.description ?? "");
    setTags(task.tags.join(", "));
    setTime(task.dueTime !== undefined ? fmtMin(task.dueTime) : "");
  }, [id, task?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  const depCandidates = useMemo(() => {
    if (!task) return [];
    const q = depQuery.trim().toLowerCase();
    if (!q) return [];
    return api.tasks.filter((x) => x.id !== task.id && !task.dependsOn.includes(x.id) && x.title.toLowerCase().includes(q) && !wouldCycle(task.id, x.id, api.tasks)).slice(0, 6);
  }, [depQuery, api.tasks, task]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !(e.target as HTMLElement).closest("input, textarea") && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!task) return null;
  const project = projectOf(api.projects, task.projectId);
  const done = isTaskDone(task, api.projects);
  const set = (patch: Partial<Task>) => api.update(task.id, patch);
  const subs = api.tasks.filter((x) => x.parentId === task.id).sort((a, b) => a.order - b.order);
  const parent = task.parentId ? api.tasks.find((x) => x.id === task.parentId) : undefined;
  const krs = api.krs;
  const readOnly = access.readOnly(task.projectId);
  const wsId = lineage(api.projects, task.projectId).map((p) => p.workspaceId).filter(Boolean).pop() ?? "";
  const wsMembers = members.items.filter((m) => (m.workspaceId ?? "") === wsId);

  return (
    <aside className="td" aria-label="Detail tugas">
      <header className="td-head">
        {parent ? (
          <button className="td-crumb" onClick={() => onOpen(parent.id)}>‹ {parent.title}</button>
        ) : (
          <span className="td-crumb muted">{projectPath(api.projects, project.id) || project.name}</span>
        )}
        {!readOnly && <button className="icon-btn" onClick={() => setDel(true)} title="Hapus tugas"><Trash2 size={16} /></button>}
        <button className="icon-btn" onClick={onClose} aria-label="Tutup detail"><X size={18} /></button>
      </header>

      <div className="td-body">
        {readOnly && <p className="ro-banner">Anda pembaca di proyek ini: tugas hanya bisa dilihat.</p>}
        <fieldset className="ro" disabled={readOnly}>
        <div className="td-title-row">
          <TaskCheck done={done} label={task.title} onToggle={() => set({ status: done ? firstOpenStatus(project) : firstDoneStatus(project) })} />
          <textarea
            className="td-title"
            rows={1}
            value={title}
            aria-label="Judul tugas"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && set({ title: title.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur())}
          />
        </div>
        <TaskMeta t={task} all={api.tasks} projects={api.projects} />

        {extra}

        <div className="td-grid">
          <Row label="Status">
            <div className="td-status">
              {statusesOf(project).map((s) => (
                <button key={s.id} className={`td-st bc-border-${s.color} ${task.status === s.id ? "on" : ""}`} onClick={() => set({ status: s.id })}>
                  <i className={`tk-sdot bc-${s.color}`} /> {s.label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Proyek">
            <ProjectSelect
              value={task.projectId === "inbox" ? undefined : task.projectId}
              projects={api.projects}
              emptyLabel="Inbox (tanpa proyek)"
              onChange={(v) => {
                const pid = v ?? "inbox";
                const target = projectOf(api.projects, pid);
                set({ projectId: pid, status: done ? firstDoneStatus(target) : statusesOf(target).some((s) => s.id === task.status) ? task.status : firstOpenStatus(target) });
              }}
            />
          </Row>
          <Row label="Ditugaskan">
            <AssigneePicker value={task.assignees} members={members.items.filter((m) => (m.workspaceId ?? "") === (lineage(api.projects, task.projectId).map((p) => p.workspaceId).filter(Boolean).pop() ?? ""))} onChange={(ids) => set({ assignees: ids.length ? ids : undefined })} />
          </Row>
          <Row label="Prioritas">
            <select value={task.priority ?? ""} onChange={(e) => set({ priority: (e.target.value || undefined) as Task["priority"] })}>
              <option value="">Tanpa prioritas</option>
              {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Row>
          <Row label="Mulai">
            <input type="date" value={task.start ?? ""} onChange={(e) => set({ start: e.target.value || undefined })} />
          </Row>
          <Row label="Tenggat">
            <div className="td-inline">
              <input type="date" value={task.due ?? ""} onChange={(e) => set({ due: e.target.value || undefined })} />
              <input
                className="td-time"
                placeholder="jam"
                value={time}
                maxLength={5}
                aria-label="Jam tenggat"
                onChange={(e) => setTime(e.target.value)}
                onBlur={() => {
                  const m = time.trim() ? parseHHMM(time) : null;
                  if (!time.trim()) set({ dueTime: undefined });
                  else if (m !== null) set({ dueTime: m });
                  else setTime(task.dueTime !== undefined ? fmtMin(task.dueTime) : "");
                }}
              />
            </div>
          </Row>
          <Row label="Estimasi">
            <select value={task.estimate ?? ""} onChange={(e) => set({ estimate: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Tanpa estimasi</option>
              {[15, 30, 45, 60, 90, 120, 180, 240, 360, 480].map((m) => <option key={m} value={m}>{m < 60 ? `${m} menit` : `${m / 60} jam`}</option>)}
            </select>
          </Row>
          <Row label="Ulangi">
            <select value={task.recurrence?.freq ?? ""} onChange={(e) => set({ recurrence: e.target.value ? { freq: e.target.value as RecurFreq, interval: 1 } : undefined })}>
              <option value="">Tidak berulang</option>
              {(Object.keys(RECUR_LABEL) as RecurFreq[]).map((f) => <option key={f} value={f}>{RECUR_LABEL[f]}</option>)}
            </select>
          </Row>
          <Row label="Tag">
            <input value={tags} placeholder="pisahkan dengan koma" onChange={(e) => setTags(e.target.value)} onBlur={() => set({ tags: [...new Set(tags.split(",").map((x) => x.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))] })} />
          </Row>
          <Row label="Key result">
            <div className="td-inline">
              <select value={task.krId ?? ""} onChange={(e) => set({ krId: e.target.value || undefined })}>
                <option value="">Tidak tertaut</option>
                {objectives.items.filter((o) => !o.archived).map((o) => (
                  <optgroup key={o.id} label={o.title}>
                    {krs.filter((k) => k.objectiveId === o.id).map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
                  </optgroup>
                ))}
              </select>
              {task.krId && (
                <label className="td-inc" title="Ditambahkan ke nilai key result saat tugas selesai">
                  +<input type="number" value={task.krIncrement ?? 1} onChange={(e) => set({ krIncrement: Number(e.target.value) || 1 })} />
                </label>
              )}
            </div>
          </Row>
          {fieldsFor(api.projects, task.projectId).map((f) => (
            <Row key={f.id} label={f.name}>
              <FieldInput
                f={f}
                value={task.custom?.[f.id]}
                onChange={(v) => {
                  const custom = { ...(task.custom ?? {}) };
                  if (v === undefined) delete custom[f.id];
                  else custom[f.id] = v;
                  set({ custom: Object.keys(custom).length ? custom : undefined });
                }}
              />
            </Row>
          ))}
        </div>

        <section className="td-sec">
          <h3>Checklist</h3>
          <ul className="td-checklist">
            {task.checklist.map((c) => (
              <li key={c.id}>
                <input type="checkbox" checked={c.done} onChange={() => set({ checklist: task.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} aria-label={c.text} />
                <span className={c.done ? "done" : ""}>{c.text}</span>
                <button className="icon-btn sm" aria-label={`Hapus ${c.text}`} onClick={() => set({ checklist: task.checklist.filter((x) => x.id !== c.id) })}><X size={13} /></button>
              </li>
            ))}
          </ul>
          <form className="td-add" onSubmit={(e) => (e.preventDefault(), newCheck.trim() && (set({ checklist: [...task.checklist, { id: newId(), text: newCheck.trim(), done: false }] }), setNewCheck("")))}>
            <Plus size={14} />
            <input value={newCheck} onChange={(e) => setNewCheck(e.target.value)} placeholder="Tambah item checklist" />
          </form>
        </section>

        {!task.parentId && (
          <section className="td-sec">
            <h3>Subtugas</h3>
            <ul className="td-subs">
              {subs.map((s) => {
                const sd = isTaskDone(s, api.projects);
                return (
                  <li key={s.id}>
                    <TaskCheck done={sd} label={s.title} onToggle={() => api.update(s.id, { status: sd ? firstOpenStatus(projectOf(api.projects, s.projectId)) : firstDoneStatus(projectOf(api.projects, s.projectId)) })} />
                    <button className={`td-sub-title ${sd ? "done" : ""}`} onClick={() => onOpen(s.id)}>{s.title}</button>
                  </li>
                );
              })}
            </ul>
            <form className="td-add" onSubmit={(e) => (e.preventDefault(), newSub.trim() && (api.create({ title: newSub.trim(), projectId: task.projectId, parentId: task.id }), setNewSub("")))}>
              <Plus size={14} />
              <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Tambah subtugas" />
            </form>
          </section>
        )}

        <section className="td-sec">
          <h3>Menunggu tugas lain</h3>
          <ul className="td-deps">
            {task.dependsOn.map((d) => {
              const x = api.tasks.find((y) => y.id === d);
              if (!x) return null;
              const xd = isTaskDone(x, api.projects);
              return (
                <li key={d} className={xd ? "done" : ""}>
                  <button className="td-sub-title" onClick={() => onOpen(x.id)}>{xd ? "✓ " : "○ "}{x.title}</button>
                  <button className="icon-btn sm" aria-label="Hapus dependensi" onClick={() => set({ dependsOn: task.dependsOn.filter((y) => y !== d) })}><X size={13} /></button>
                </li>
              );
            })}
          </ul>
          <div className="td-dep-add">
            <input value={depQuery} onChange={(e) => setDepQuery(e.target.value)} placeholder="Cari tugas yang harus selesai lebih dulu" />
            {depCandidates.length > 0 && (
              <ul className="td-dep-results">
                {depCandidates.map((c) => (
                  <li key={c.id}>
                    <button onClick={() => (set({ dependsOn: [...task.dependsOn, c.id] }), setDepQuery(""))}>{c.title} <span className="muted">· {projectOf(api.projects, c.projectId).name}</span></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="td-sec">
          <h3>Deskripsi</h3>
          <textarea className="td-desc" rows={5} value={desc} placeholder="Konteks, tautan, catatan…" onChange={(e) => setDesc(e.target.value)} onBlur={() => desc !== (task.description ?? "") && set({ description: desc || undefined })} />
        </section>
        </fieldset>

        <section className="td-sec">
          <Comments target="task" targetId={task.id} projectId={task.projectId === "inbox" ? undefined : task.projectId} readOnly={readOnly} members={wsMembers} />
        </section>
      </div>

      {del && (
        <Confirm
          title="Hapus tugas?"
          text={subs.length ? `"${task.title}" beserta ${subs.length} subtugasnya akan dihapus.` : `"${task.title}" akan dihapus.`}
          confirmLabel="Hapus tugas"
          onConfirm={() => (api.remove(task.id), onClose())}
          onClose={() => setDel(false)}
        />
      )}
    </aside>
  );
}

export type { Item };
