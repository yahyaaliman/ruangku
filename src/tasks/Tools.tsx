import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { Item, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { newId } from "../lib/api";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { Action, ACTION_LABEL, ActionType, PRESET_RULES, Rule, TRIGGER_LABEL, TriggerType } from "../lib/automation";
import { INBOX_ID, PRIORITIES, projectOf, statusesOf, TaskPriority } from "../lib/tasks";
import { applyDayTemplate, BUILTIN_DAY_TEMPLATES, BUILTIN_PROJECT_TEMPLATES, DayTemplate, fromProject, instantiate, ProjectTemplate } from "../lib/projectTemplates";
import type { useTasks } from "../lib/useTasks";
import { Field, Modal, useToast } from "../components/ui";
import { fmtMin } from "../lib/timeblocks";

type T = ReturnType<typeof useTasks>;

function describeAction(a: Action, t: T): string {
  switch (a.type) {
    case "set_priority": return `prioritas → ${PRIORITIES.find((p) => p.id === a.priority)?.label ?? "?"}`;
    case "add_tag": return `tag #${a.tag ?? ""}`;
    case "set_status": return `status → ${a.status ?? ""}`;
    case "move_project": return `pindah ke ${projectOf(t.projects, a.projectId ?? INBOX_ID).name}`;
    case "set_due_offset": return `tenggat +${a.days ?? 0} hari`;
    case "add_checklist": return `checklist (${(a.items ?? []).length} item)`;
    case "notify": return `notifikasi "${a.text ?? ""}"`;
    case "complete_parent": return "selesaikan tugas induk";
  }
}

function RuleForm({ t, initial, onSave, onClose }: { t: T; initial?: Item<Rule>; onSave: (r: Rule) => void; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [trigger, setTrigger] = useState(initial?.trigger ?? { type: "status_changed" as TriggerType });
  const [actions, setActions] = useState<Action[]>(initial?.actions ?? [{ type: "notify", text: "" }]);
  const proj = trigger.projectId ? projectOf(t.projects, trigger.projectId) : null;
  const setA = (i: number, patch: Partial<Action>) => setActions(actions.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const valid = actions.length > 0 && (trigger.type !== "status_changed" || !!trigger.status);
  const autoName = () => `${TRIGGER_LABEL[trigger.type]}${trigger.status && proj ? ` "${statusesOf(proj).find((s) => s.id === trigger.status)?.label}"` : ""}: ${actions.map((a) => describeAction(a, t)).join(", ")}`;
  return (
    <Modal
      title={initial ? "Ubah otomasi" : "Otomasi baru"}
      wide
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!valid} onClick={() => (onSave({ name: name.trim() || autoName(), on: initial?.on ?? true, trigger, actions }), onClose())}>Simpan otomasi</button>
        </>
      }
    >
      <div className="form">
        <div className="au-sentence">
          <span className="au-kw">Jika</span>
          <select value={trigger.type} onChange={(e) => setTrigger({ ...trigger, type: e.target.value as TriggerType, status: undefined })}>
            {(Object.keys(TRIGGER_LABEL) as TriggerType[]).map((k) => <option key={k} value={k}>{TRIGGER_LABEL[k]}</option>)}
          </select>
          {trigger.type === "status_changed" && (
            <select value={trigger.status ?? ""} onChange={(e) => setTrigger({ ...trigger, status: e.target.value || undefined })} disabled={!proj}>
              <option value="">{proj ? "pilih status" : "pilih proyek dulu"}</option>
              {proj && statusesOf(proj).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          )}
          <span className="au-kw">di</span>
          <select value={trigger.projectId ?? ""} onChange={(e) => setTrigger({ ...trigger, projectId: e.target.value || undefined, status: undefined })}>
            <option value="">semua proyek</option>
            {t.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="au-actions">
          <span className="au-kw">Maka</span>
          {actions.map((a, i) => (
            <div key={i} className="au-action">
              <select value={a.type} onChange={(e) => setA(i, { type: e.target.value as ActionType })}>
                {(Object.keys(ACTION_LABEL) as ActionType[]).map((k) => <option key={k} value={k}>{ACTION_LABEL[k]}</option>)}
              </select>
              {a.type === "set_priority" && (
                <select value={a.priority ?? ""} onChange={(e) => setA(i, { priority: e.target.value as TaskPriority })}>
                  <option value="">pilih</option>
                  {PRIORITIES.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              )}
              {a.type === "add_tag" && <input value={a.tag ?? ""} placeholder="nama tag" onChange={(e) => setA(i, { tag: e.target.value.replace(/^#/, "").toLowerCase() })} />}
              {a.type === "set_status" && (
                <select value={a.status ?? ""} onChange={(e) => setA(i, { status: e.target.value })}>
                  <option value="">pilih</option>
                  {statusesOf(proj ?? undefined).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              )}
              {a.type === "move_project" && (
                <select value={a.projectId ?? ""} onChange={(e) => setA(i, { projectId: e.target.value })}>
                  <option value="">pilih proyek</option>
                  {t.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              )}
              {a.type === "set_due_offset" && <input type="number" min={0} value={a.days ?? 0} onChange={(e) => setA(i, { days: Number(e.target.value) })} aria-label="Jumlah hari" />}
              {a.type === "add_checklist" && <input value={(a.items ?? []).join(", ")} placeholder="item, pisahkan dengan koma" onChange={(e) => setA(i, { items: e.target.value.split(",").map((x) => x.trim()) })} />}
              {a.type === "notify" && <input value={a.text ?? ""} placeholder="judul notifikasi" onChange={(e) => setA(i, { text: e.target.value })} />}
              <button className="icon-btn sm" onClick={() => setActions(actions.filter((_, j) => j !== i))} aria-label="Hapus aksi"><X size={14} /></button>
            </div>
          ))}
          <button className="chip-btn" onClick={() => setActions([...actions, { type: "add_tag" }])}><Plus size={13} /> Tambah aksi</button>
        </div>
        <Field label="Nama otomasi" hint="Kosongkan untuk dibuat otomatis dari aturannya">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={autoName()} />
        </Field>
      </div>
    </Modal>
  );
}

export function AutomationsPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const [edit, setEdit] = useState<Item<Rule> | "new" | null>(null);
  const toast = useToast();
  const rules = t.rules.items;
  const addPresets = async () => {
    let n = 0;
    for (const p of PRESET_RULES) if (!rules.some((r) => r.name === p.name)) (await t.rules.save(p), n++);
    toast(n ? `${n} otomasi siap pakai ditambahkan` : "Semua otomasi siap pakai sudah ada");
  };
  return (
    <div className="tools">
      <header className="tk-head">
        <div className="tk-head-title">
          <h2>Otomasi</h2>
          <p className="muted small">Aturan "jika X maka Y" yang berjalan saat tugas dibuat, berubah status, selesai, atau tenggatnya tiba.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={addPresets}>Tambahkan yang siap pakai</button>
          <button className="btn btn-primary" onClick={() => setEdit("new")}><Plus size={15} /> Otomasi baru</button>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
        </div>
      </header>
      {rules.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Belum ada otomasi</p>
          <p className="empty-text">Contoh: saat tugas di proyek klien pindah ke "Review klien", beri tag #menunggu dan kirim notifikasi.</p>
          <button className="btn btn-primary" onClick={addPresets}>Tambahkan otomasi siap pakai</button>
        </div>
      ) : (
        <ul className="au-list">
          {rules.map((r) => (
            <li key={r.id} className={r.on ? "" : "off"}>
              <label className="switch"><input type="checkbox" checked={r.on} onChange={(e) => t.rules.save({ ...strip(r), on: e.target.checked }, r.id)} aria-label={`Aktifkan ${r.name}`} /></label>
              <button className="au-body" onClick={() => setEdit(r)}>
                <b>{r.name}</b>
                <span className="muted small">
                  {TRIGGER_LABEL[r.trigger.type]}
                  {r.trigger.projectId ? ` · ${projectOf(t.projects, r.trigger.projectId).name}` : " · semua proyek"} → {r.actions.map((a) => describeAction(a, t)).join(", ")}
                </span>
              </button>
              <button className="icon-btn" onClick={() => t.rules.remove(r.id)} aria-label="Hapus otomasi"><Trash2 size={15} /></button>
            </li>
          ))}
        </ul>
      )}
      {edit && <RuleForm t={t} initial={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} onSave={(r) => t.rules.save(r, edit === "new" ? undefined : edit.id)} />}
    </div>
  );
}

export function TemplatesPanel({ t, onClose }: { t: T; onClose: () => void }) {
  const toast = useToast();
  const userProj = useRecords<ProjectTemplate>("projecttemplate");
  const userDay = useRecords<DayTemplate>("daytemplate");
  const blocks = useRecords<TimeBlock>("timeblock");
  const [useTpl, setUseTpl] = useState<ProjectTemplate | null>(null);
  const [start, setStart] = useState(dateKey());
  const [projName, setProjName] = useState("");
  const [dayDate, setDayDate] = useState(dateKey());
  const [saveFrom, setSaveFrom] = useState("");
  const [saveDay, setSaveDay] = useState(dateKey());

  const createFrom = async (tpl: ProjectTemplate, name: string) => {
    const pid = await t.saveProject({ name, color: tpl.color, description: tpl.description, statuses: tpl.statuses });
    const ids = tpl.tasks.map(() => newId());
    const open = tpl.statuses.find((s) => !s.done)?.id ?? "todo";
    const list = instantiate(tpl, pid, start, ids, open, Math.max(0, ...t.tasks.map((x) => x.order)));
    for (let i = 0; i < list.length; i++) await saveTask(list[i], ids[i]);
    toast(`Proyek "${name}" dibuat dengan ${list.length} tugas`);
  };
  const taskStore = useRecords<import("../lib/tasks").Task>("task");
  const saveTask = (x: import("../lib/tasks").Task, id: string) => taskStore.save(x, id);

  const projTemplates = [...BUILTIN_PROJECT_TEMPLATES, ...userProj.items];
  const dayTemplates = [...BUILTIN_DAY_TEMPLATES, ...userDay.items];
  const realProjects = t.projects.filter((p) => p.id !== INBOX_ID);

  return (
    <div className="tools">
      <header className="tk-head">
        <div className="tk-head-title">
          <h2>Template</h2>
          <p className="muted small">Mulai proyek dari susunan tugas siap pakai, atau isi hari dengan susunan blok waktu.</p>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Tutup"><X size={18} /></button>
      </header>

      <section className="tp-sec">
        <h3>Template proyek</h3>
        <div className="tp-grid">
          {projTemplates.map((p) => (
            <article key={p.id} className="tp-card">
              <span className="tp-icon">{p.icon}</span>
              <b>{p.name}</b>
              <span className="muted small">{p.description}</span>
              <span className="muted small">{p.tasks.length} tugas · {Math.max(0, ...p.tasks.map((x) => x.dueOffset ?? 0)) + 1} hari</span>
              <div className="tp-card-actions">
                <button className="btn btn-sm btn-primary" onClick={() => (setUseTpl(p), setProjName(p.name))}>Gunakan</button>
                {"updatedAt" in p && (p as Item<ProjectTemplate>).updatedAt > 0 && <button className="icon-btn sm" onClick={() => userProj.remove(p.id)} aria-label="Hapus template"><Trash2 size={13} /></button>}
              </div>
            </article>
          ))}
        </div>
        {realProjects.length > 0 && (
          <div className="tp-save">
            <span>Simpan proyek sebagai template:</span>
            <select value={saveFrom} onChange={(e) => setSaveFrom(e.target.value)}>
              <option value="">pilih proyek</option>
              {realProjects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              className="btn btn-sm"
              disabled={!saveFrom}
              onClick={async () => {
                const p = realProjects.find((x) => x.id === saveFrom)!;
                await userProj.save(fromProject(p, t.tasks.filter((x) => x.projectId === p.id)));
                toast(`Template "${p.name}" disimpan`);
                setSaveFrom("");
              }}
            >
              Simpan template
            </button>
          </div>
        )}
      </section>

      <section className="tp-sec">
        <h3>Template hari</h3>
        <div className="tp-save">
          <span>Terapkan ke tanggal</span>
          <input type="date" value={dayDate} onChange={(e) => setDayDate(e.target.value)} />
          <span className="muted small">Blok yang bertabrakan dengan jadwal yang sudah ada dilewati.</span>
        </div>
        <div className="tp-grid">
          {dayTemplates.map((d) => (
            <article key={d.id} className="tp-card">
              <span className="tp-icon">{d.icon}</span>
              <b>{d.name}</b>
              <ul className="tp-blocks">
                {d.blocks.slice(0, 6).map((b, i) => <li key={i}><i className={`tk-sdot bc-${b.color ?? "nila"}`} /> {fmtMin(b.start)} {b.title}</li>)}
              </ul>
              <div className="tp-card-actions">
                <button
                  className="btn btn-sm btn-primary"
                  onClick={async () => {
                    const list = applyDayTemplate(d, dayDate, blocks.items.filter((b) => b.date === dayDate));
                    for (const b of list) await blocks.save(b);
                    toast(list.length ? `${list.length} blok ditambahkan ke ${dayDate}` : "Semua blok bertabrakan dengan jadwal yang ada");
                  }}
                >
                  Terapkan
                </button>
                {"updatedAt" in d && (d as Item<DayTemplate>).updatedAt > 0 && <button className="icon-btn sm" onClick={() => userDay.remove(d.id)} aria-label="Hapus template"><Trash2 size={13} /></button>}
              </div>
            </article>
          ))}
        </div>
        <div className="tp-save">
          <span>Simpan susunan hari</span>
          <input type="date" value={saveDay} onChange={(e) => setSaveDay(e.target.value)} />
          <button
            className="btn btn-sm"
            onClick={async () => {
              const list = blocks.items.filter((b) => b.date === saveDay && !b.tracked).sort((a, b) => a.start - b.start);
              if (!list.length) return toast("Tidak ada blok di tanggal itu", "error");
              await userDay.save({ name: `Susunan ${saveDay}`, icon: "🧩", blocks: list.map((b) => ({ start: b.start, end: b.end, title: b.title, color: b.color })) });
              toast(`Template hari dengan ${list.length} blok disimpan`);
            }}
          >
            sebagai template
          </button>
        </div>
      </section>

      {useTpl && (
        <Modal
          title={`Gunakan template "${useTpl.name}"`}
          onClose={() => setUseTpl(null)}
          footer={
            <>
              <button className="btn" onClick={() => setUseTpl(null)}>Batal</button>
              <button className="btn btn-primary" disabled={!projName.trim()} onClick={() => (createFrom(useTpl, projName.trim()), setUseTpl(null))}>Buat proyek</button>
            </>
          }
        >
          <div className="form">
            <Field label="Nama proyek"><input value={projName} onChange={(e) => setProjName(e.target.value)} /></Field>
            <Field label="Tanggal mulai" hint={`Proyek selesai sekitar ${dateKey(addDays(parseDateKey(start), Math.max(0, ...useTpl.tasks.map((x) => x.dueOffset ?? 0))))}`}>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <ul className="tp-preview">
              {useTpl.tasks.map((x, i) => <li key={i}><span>{x.title}</span><span className="muted small">{x.dueOffset !== undefined ? dateKey(addDays(parseDateKey(start), x.dueOffset)) : "tanpa tenggat"}</span></li>)}
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}
