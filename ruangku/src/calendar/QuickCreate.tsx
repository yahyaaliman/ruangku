import { useState } from "react";
import { Bell, CalendarClock, CheckSquare, Handshake } from "lucide-react";
import type { Item } from "../lib/types";
import type { Project } from "../lib/tasks";
import { dayLong, parseDateKey } from "../lib/date";
import { fmtMin, parseHHMM } from "../lib/timeblocks";
import { ProjectSelect } from "../projects/ProjectSwitcher";
import Popover, { type Anchor } from "./Popover";
import type { Slot } from "./shared";

export type NewKind = "blok" | "rapat" | "tugas" | "pengingat";

export interface NewItem {
  kind: NewKind;
  title: string;
  date: string;
  start?: number;
  end?: number;
  projectId?: string;
  /** Rapat: tempat atau tautan */
  where?: string;
}

export default function QuickCreate({ slot, at, projects, defaultProject, onSave, onClose }: { slot: Slot; at: Anchor; projects: Item<Project>[]; defaultProject?: string; onSave: (n: NewItem) => Promise<void>; onClose: () => void }) {
  const timed = slot.start !== undefined;
  const [kind, setKind] = useState<NewKind>(timed ? "blok" : "tugas");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(slot.date);
  const [start, setStart] = useState(fmtMin(slot.start ?? 9 * 60));
  const [end, setEnd] = useState(fmtMin(slot.end ?? (slot.start ?? 9 * 60) + 60));
  const [allDay, setAllDay] = useState(!timed);
  const [projectId, setProjectId] = useState<string | undefined>(defaultProject);
  const [busy, setBusy] = useState(false);

  const s = parseHHMM(start);
  const e = parseHHMM(end);
  const [where, setWhere] = useState("");
  const ranged = kind === "blok" || kind === "rapat";
  const needsTime = ranged || kind === "pengingat" || !allDay;
  const valid = title.trim() && (!needsTime || (s !== null && (!ranged || (e !== null && e > s))));

  const save = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave({ kind, title: title.trim(), date, start: needsTime ? s! : undefined, end: ranged ? e! : kind === "tugas" && needsTime ? e ?? undefined : undefined, projectId, where: where.trim() || undefined });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover at={at} onClose={onClose} label="Buat baru" width={330}>
      <form
        className="qc"
        onSubmit={(ev) => {
          ev.preventDefault();
          save();
        }}
      >
        <div className="seg seg-full qc-kind" role="tablist" aria-label="Jenis">
          {(
            [
              ["blok", "Blok", CalendarClock],
              ["rapat", "Rapat", Handshake],
              ["tugas", "Tugas", CheckSquare],
              ["pengingat", "Pengingat", Bell],
            ] as const
          ).map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={kind === k ? "active" : ""} onClick={() => setKind(k)}>
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>
        <input autoFocus className="qc-title" placeholder={kind === "blok" ? "Mis. Fokus menulis bab 2" : kind === "rapat" ? "Mis. Rapat evaluasi mingguan" : kind === "tugas" ? "Mis. Kirim draf proposal" : "Mis. Telepon donatur"} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Judul" />
        <div className="qc-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Tanggal" />
          {kind === "tugas" && (
            <label className="qc-check">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> tanpa jam
            </label>
          )}
        </div>
        {needsTime && (
          <div className="qc-row">
            <input className="hhmm" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Mulai" />
            {kind !== "pengingat" && (
              <>
                <span>–</span>
                <input className="hhmm" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Selesai" />
              </>
            )}
            <span className="muted small">{dayLong(parseDateKey(date).getTime())}</span>
          </div>
        )}
        {kind === "rapat" && <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Tempat atau tautan Zoom/Meet (opsional)" aria-label="Tempat atau tautan" />}
        <ProjectSelect value={projectId} onChange={setProjectId} projects={projects} emptyLabel={kind === "tugas" ? "Inbox" : "Tanpa proyek"} />
        <div className="qc-foot">
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-sm btn-primary" disabled={!valid || busy}>
            Simpan
          </button>
        </div>
      </form>
    </Popover>
  );
}
