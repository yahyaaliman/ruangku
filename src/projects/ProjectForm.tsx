import { EmojiPicker } from "../components/EmojiPicker";
import { useState } from "react";
import { ChevronDown, ChevronUp, FolderOpen, Plus, Trash2, X } from "lucide-react";
import type { BlockColor, Item } from "../lib/types";
import { DEFAULT_STATUSES, Milestone, Project, StatusDef } from "../lib/tasks";
import { FIELD_TYPES, type FieldDef, type FieldType } from "../lib/customFields";
import { flatTree, wouldCycleProject } from "../lib/projects";
import { newId, pickFolder } from "../lib/api";
import { Field, Modal } from "../components/ui";
import { BLOCK_COLORS } from "../widget/TimeGrid";
import { useRecords } from "../lib/useRecords";
import type { Member } from "../lib/team";

export interface Workspace {
  name: string;
  serverUrl: string;
  remoteId: string;
  role?: string;
}

export default function ProjectForm({
  initial,
  parentId: presetParent,
  projects,
  onSave,
  onClose,
}: {
  initial?: Item<Project>;
  parentId?: string;
  projects: Item<Project>[];
  onSave: (p: Project) => void;
  onClose: () => void;
}) {
  const parentInit = initial?.parentId ?? presetParent;
  const parentProject = projects.find((p) => p.id === parentInit);
  const [name, setName] = useState(initial?.name ?? "");
  const [iconAt, setIconAt] = useState<{ x: number; y: number } | null>(null);
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [color, setColor] = useState<BlockColor>(initial?.color ?? parentProject?.color ?? "nila");
  const [parentId, setParentId] = useState(parentInit ?? "");
  const [start, setStart] = useState(initial?.start ?? "");
  const [end, setEnd] = useState(initial?.end ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [leadId, setLeadId] = useState(initial?.leadId ?? "");
  const [workspaceId, setWorkspaceId] = useState(initial?.workspaceId ?? parentProject?.workspaceId ?? "");
  const [milestones, setMilestones] = useState<Milestone[]>(initial?.milestones ?? []);
  const [statuses, setStatuses] = useState<StatusDef[]>(initial?.statuses?.length ? initial.statuses : parentProject?.statuses?.length ? parentProject.statuses : DEFAULT_STATUSES);
  const [showStatus, setShowStatus] = useState(!initial);
  const [fields, setFields] = useState<FieldDef[]>(initial?.fields ?? []);
  const [showFields, setShowFields] = useState(!!initial?.fields?.length);
  const members = useRecords<Member>("member");
  const workspaces = useRecords<Workspace>("workspace");

  const parents = flatTree(projects.filter((p) => !initial || !wouldCycleProject(projects, initial.id, p.id)));
  const datesOk = !start || !end || start <= end;
  const valid = name.trim() && datesOk && statuses.some((s) => s.done) && statuses.some((s) => !s.done) && statuses.every((s) => s.label.trim());
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= statuses.length) return;
    const c = statuses.slice();
    [c[i], c[j]] = [c[j], c[i]];
    setStatuses(c);
  };
  const save = () => {
    const p: Project = {
      ...(initial ?? ({} as Project)),
      name: name.trim(),
      icon: icon || undefined,
      color,
      parentId: parentId || undefined,
      start: start || undefined,
      end: end || undefined,
      description: description.trim() || undefined,
      folder: folder || undefined,
      leadId: leadId || undefined,
      workspaceId: workspaceId || undefined,
      milestones: milestones.filter((m) => m.title.trim() && m.date),
      statuses,
      fields: fields.filter((f) => f.name.trim()).map((f) => ({ ...f, name: f.name.trim(), options: f.type === "pilihan" ? (f.options ?? []).map((o) => o.trim()).filter(Boolean) : undefined })),
    };
    if (!p.fields?.length) delete p.fields;
    delete (p as Partial<Item<Project>>).id;
    delete (p as Partial<Item<Project>>).updatedAt;
    onSave(p);
    onClose();
  };

  return (
    <Modal
      wide
      title={initial ? "Ubah proyek" : parentId ? "Subproyek baru" : "Proyek baru"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!valid} onClick={save}>Simpan proyek</button>
        </>
      }
    >
      <div className="form">
        <div className="pf-name">
          <button type="button" className="pf-icon" aria-label="Pilih ikon ruang" title="Pilih ikon ruang" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIconAt({ x: r.left, y: r.bottom + 4 }); }}>{icon || "＋"}</button>
          {iconAt && <EmojiPicker at={iconAt} onPick={setIcon} onRemove={() => setIcon("")} onClose={() => setIconAt(null)} />}
          <Field label="Nama proyek"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Riset Thesis" autoFocus /></Field>
        </div>
        <div className="form-row">
          <Field label="Di bawah proyek" hint="Kosongkan untuk proyek utama.">
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">— Proyek utama —</option>
              {parents.map(({ p, depth }) => <option key={p.id} value={p.id}>{"\u00a0\u00a0".repeat(depth)}{p.icon ? `${p.icon} ` : ""}{p.name}</option>)}
            </select>
          </Field>
          <Field label="Warna">
            <div className="tk-colors">
              {BLOCK_COLORS.map((c) => <button key={c.id} type="button" className={`tk-color bc-${c.id} ${color === c.id ? "on" : ""}`} aria-label={c.label} title={c.label} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
            </div>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Mulai"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
          <Field label="Selesai" hint={!datesOk ? "Tanggal selesai harus setelah mulai." : "Kosongkan agar dihitung dari tugasnya."}><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
        </div>
        <div className="form-row">
          <Field label="Penanggung jawab">
            <select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">—</option>
              {members.items.map((m) => <option key={m.id} value={m.id}>{m.name}{m.isMe ? " (saya)" : ""}</option>)}
            </select>
          </Field>
          <Field label="Dibagikan ke tim" hint={workspaces.items.length ? "Proyek tim tersinkron ke server bersama sesuai peran anggota." : "Hubungkan server tim di Pengaturan → Tim untuk berbagi proyek."}>
            <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} disabled={!workspaces.items.length}>
              <option value="">Pribadi (tidak dibagikan)</option>
              {workspaces.items.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Deskripsi"><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tujuan atau ruang lingkup proyek" /></Field>
        <Field label="Folder proyek" hint="Tampil sebagai pintasan di halaman File.">
          <div className="pf-folder">
            <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="C:\Users\Saya\Documents\Riset Thesis" />
            <button type="button" className="btn btn-sm" onClick={async () => { const f = await pickFolder("Pilih folder proyek"); if (f) setFolder(f); }}><FolderOpen size={14} /> Pilih</button>
          </div>
        </Field>
        <Field label="Milestone">
          <ul className="pf-milestones">
            {milestones.map((m) => (
              <li key={m.id}>
                <span className="pf-diamond" aria-hidden="true" />
                <input value={m.title} aria-label="Nama milestone" placeholder="Contoh: Seminar proposal" onChange={(e) => setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, title: e.target.value } : x)))} />
                <input type="date" value={m.date} aria-label="Tanggal milestone" onChange={(e) => setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, date: e.target.value } : x)))} />
                <label className="pf-done"><input type="checkbox" checked={!!m.done} onChange={(e) => setMilestones(milestones.map((x) => (x.id === m.id ? { ...x, done: e.target.checked } : x)))} /> Tercapai</label>
                <button type="button" className="icon-btn sm" aria-label="Hapus milestone" onClick={() => setMilestones(milestones.filter((x) => x.id !== m.id))}><X size={14} /></button>
              </li>
            ))}
          </ul>
          <button type="button" className="chip-btn" onClick={() => setMilestones([...milestones, { id: newId().slice(0, 8), title: "", date: end || start || "" }])}><Plus size={13} /> Tambah milestone</button>
        </Field>
        <button type="button" className="pf-toggle" onClick={() => setShowFields(!showFields)} aria-expanded={showFields}>
          <ChevronDown size={14} style={{ transform: showFields ? "none" : "rotate(-90deg)" }} /> Kolom tambahan tugas ({fields.length})
        </button>
        {showFields && (
          <Field label="" hint="Misalnya Sumber kandidat, Skor wawancara, Nominal, atau Link CV. Tampil di detail tugas dan tampilan Tabel; subproyek ikut mewarisi.">
            <ul className="pf-fields">
              {fields.map((f) => (
                <li key={f.id}>
                  <input value={f.name} aria-label="Nama kolom" placeholder="Nama kolom" onChange={(e) => setFields(fields.map((x) => (x.id === f.id ? { ...x, name: e.target.value } : x)))} />
                  <select value={f.type} aria-label="Jenis kolom" onChange={(e) => setFields(fields.map((x) => (x.id === f.id ? { ...x, type: e.target.value as FieldType } : x)))}>
                    {FIELD_TYPES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  {f.type === "pilihan" && (
                    <input className="pf-opts" value={(f.options ?? []).join(", ")} aria-label="Pilihan" placeholder="Pilihan, pisahkan koma" onChange={(e) => setFields(fields.map((x) => (x.id === f.id ? { ...x, options: e.target.value.split(",") } : x)))} />
                  )}
                  <button type="button" className="icon-btn sm" aria-label={`Hapus kolom ${f.name}`} onClick={() => setFields(fields.filter((x) => x.id !== f.id))}>
                    <X size={14} />
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="chip-btn" onClick={() => setFields([...fields, { id: `f${newId().slice(0, 6)}`, name: "", type: "teks" }])}>
              <Plus size={13} /> Tambah kolom
            </button>
          </Field>
        )}
        <button type="button" className="pf-toggle" onClick={() => setShowStatus(!showStatus)} aria-expanded={showStatus}>
          <ChevronDown size={14} style={{ transform: showStatus ? "none" : "rotate(-90deg)" }} /> Alur status tugas ({statuses.length})
        </button>
        {showStatus && (
          <Field label="" hint="Minimal satu status terbuka dan satu status selesai. Subproyek baru mewarisi alur status induknya.">
            <ul className="pf-statuses">
              {statuses.map((s, i) => (
                <li key={s.id}>
                  <select value={s.color} aria-label="Warna status" onChange={(e) => setStatuses(statuses.map((x) => (x.id === s.id ? { ...x, color: e.target.value as BlockColor } : x)))}>
                    {BLOCK_COLORS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <input value={s.label} aria-label="Nama status" onChange={(e) => setStatuses(statuses.map((x) => (x.id === s.id ? { ...x, label: e.target.value } : x)))} />
                  <label className="pf-done"><input type="checkbox" checked={!!s.done} onChange={(e) => setStatuses(statuses.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)))} /> Selesai</label>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naikkan"><ChevronUp size={14} /></button>
                  <button type="button" className="icon-btn sm" onClick={() => move(i, 1)} disabled={i === statuses.length - 1} aria-label="Turunkan"><ChevronDown size={14} /></button>
                  <button type="button" className="icon-btn sm" onClick={() => setStatuses(statuses.filter((x) => x.id !== s.id))} disabled={statuses.length <= 2} aria-label="Hapus status"><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
            <button type="button" className="chip-btn" onClick={() => setStatuses([...statuses.slice(0, -1), { id: newId().slice(0, 8), label: "Status baru", color: "nila" }, ...statuses.slice(-1)])}>
              <Plus size={13} /> Tambah status
            </button>
          </Field>
        )}
      </div>
    </Modal>
  );
}
