import { useState } from "react";
import type { Item, Priority, Reminder, Repeat } from "../lib/types";
import { Field, Modal } from "../components/ui";
import { fromInputDateTime, toInputDateTime } from "../lib/date";
import { nextOccurrence, REPEAT_LABEL } from "../lib/repeat";
import { strip } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { ProjectSelect } from "../projects/ProjectSwitcher";

export function defaultDue(): number {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  return d.getTime();
}

/** Tandai selesai. Reminder berulang pindah ke jadwal berikutnya. */
export function completeReminder(r: Item<Reminder>): Reminder {
  const base = strip(r);
  if (r.repeat !== "none") {
    const next = nextOccurrence(r.dueAt, r.repeat, Math.max(Date.now(), r.dueAt), r.anchorDay);
    if (next) {
      return {
        ...base,
        dueAt: next,
        anchorDay: r.anchorDay ?? new Date(r.dueAt).getDate(),
        firedFor: undefined,
        completedCount: (r.completedCount ?? 0) + 1,
      };
    }
  }
  return { ...base, done: true, doneAt: Date.now() };
}

export function snoozeReminder(r: Item<Reminder>, minutes: number): Reminder {
  return { ...strip(r), dueAt: Date.now() + minutes * 60000, firedFor: undefined, done: false };
}

export function ReminderForm({
  initial,
  categories,
  onSave,
  onClose,
}: {
  initial?: Item<Reminder>;
  categories: string[];
  onSave: (r: Reminder) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [due, setDue] = useState(toInputDateTime(initial?.dueAt ?? defaultDue()));
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat ?? "none");
  const [lead, setLead] = useState(initial?.leadMinutes ?? 0);
  const [priority, setPriority] = useState<Priority>(initial?.priority ?? "sedang");
  const [category, setCategory] = useState(initial?.category ?? "");
  const scope = useScope();
  const [projectId, setProjectId] = useState<string | undefined>(initial ? initial.projectId : scope.defaultProjectId);
  const valid = title.trim().length > 0 && !Number.isNaN(fromInputDateTime(due));

  const submit = () => {
    if (!valid) return;
    const dueAt = fromInputDateTime(due);
    const base = initial ? strip(initial) : ({} as Reminder);
    onSave({
      ...base,
      title: title.trim(),
      notes: notes.trim(),
      dueAt,
      repeat,
      leadMinutes: lead,
      priority,
      category: category.trim(),
      projectId,
      done: initial?.done && dueAt === initial.dueAt ? initial.done : false,
      // Waktu berubah = boleh dinotifikasi lagi.
      firedFor: initial && dueAt === initial.dueAt ? initial.firedFor : undefined,
      anchorDay: initial && dueAt === initial.dueAt ? initial.anchorDay : undefined,
    });
    onClose();
  };

  return (
    <Modal
      title={initial ? "Ubah reminder" : "Reminder baru"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button className="btn btn-primary" disabled={!valid} onClick={submit}>
            Simpan reminder
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Judul">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Contoh: Kirim laporan ke Bu Rina" />
        </Field>
        <div className="form-row">
          <Field label="Waktu">
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Ulangi">
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              {(Object.keys(REPEAT_LABEL) as Repeat[]).map((k) => (
                <option key={k} value={k}>
                  {REPEAT_LABEL[k]}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="form-row">
          <Field label="Ingatkan">
            <select value={lead} onChange={(e) => setLead(Number(e.target.value))}>
              <option value={0}>Tepat waktu</option>
              <option value={5}>5 menit sebelumnya</option>
              <option value={15}>15 menit sebelumnya</option>
              <option value={30}>30 menit sebelumnya</option>
              <option value={60}>1 jam sebelumnya</option>
              <option value={1440}>1 hari sebelumnya</option>
            </select>
          </Field>
          <Field label="Prioritas">
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="rendah">Rendah</option>
              <option value="sedang">Sedang</option>
              <option value="tinggi">Tinggi</option>
            </select>
          </Field>
        </div>
        <Field label="Proyek">
          <ProjectSelect value={projectId} onChange={setProjectId} projects={scope.allProjects} />
        </Field>
        <Field label="Kategori" hint="Opsional. Contoh: Kerja, Pribadi, Kuliah">
          <input list="reminder-categories" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="reminder-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Catatan">
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
