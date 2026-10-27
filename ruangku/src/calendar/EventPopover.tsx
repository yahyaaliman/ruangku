import { useState } from "react";
import { ArrowUpRight, CalendarPlus, Check, Clock, MapPin, RotateCcw, Trash2, Video, X } from "lucide-react";
import { api } from "../lib/api";
import { linkPlatform } from "../lib/meetings";
import { ATTENDANCE_LABEL, type Attendance } from "../lib/courses";
import type { CalEvent } from "../lib/calendar";
import { dayLong, parseDateKey } from "../lib/date";
import { fmtMin, parseHHMM } from "../lib/timeblocks";
import { ProjectChip } from "../projects/ProjectSwitcher";
import Popover, { type Anchor } from "./Popover";
import { EvIcon, timeRange } from "./shared";

export interface EventOps {
  toggleDone: (ev: CalEvent) => Promise<void>;
  remove: (ev: CalEvent) => Promise<void>;
  rename: (ev: CalEvent, title: string) => Promise<void>;
  retime: (ev: CalEvent, date: string, start: number, end: number) => Promise<void>;
  openSource: (ev: CalEvent) => void;
  copyToBlock: (ev: CalEvent) => Promise<void>;
  description?: (ev: CalEvent) => string | undefined;
  setAttendance?: (ev: CalEvent, a: Attendance | undefined) => Promise<void>;
}

const LAYER_NAME: Record<CalEvent["layer"], string> = {
  blok: "Blok jadwal",
  rapat: "Rapat",
  kuliah: "Kuliah",
  tercatat: "Waktu tercatat",
  tugas: "Tugas",
  pengingat: "Pengingat",
  milestone: "Milestone proyek",
  proyek: "Periode proyek",
  sholat: "Waktu sholat",
  luar: "Kalender luar",
};

const SOURCE_LABEL: Partial<Record<CalEvent["ref"]["kind"], string>> = {
  timeblock: "Buka di Jadwal harian",
  task: "Buka detail tugas",
  reminder: "Buka di Hari ini",
  milestone: "Buka timeline proyek",
  project: "Buka timeline proyek",
  prayer: "Buka Ibadah",
};

export default function EventPopover({ ev, at, ops, onClose }: { ev: CalEvent; at: Anchor; ops: EventOps; onClose: () => void }) {
  const [title, setTitle] = useState(ev.title);
  const editable = ev.ref.kind === "timeblock" || ev.ref.kind === "task" || ev.ref.kind === "milestone";
  const timeEditable = ev.ref.kind === "timeblock" && ev.movable;
  const [start, setStart] = useState(ev.start !== undefined ? fmtMin(ev.start) : "");
  const [end, setEnd] = useState(ev.end !== undefined ? fmtMin(ev.end) : "");
  const [date, setDate] = useState(ev.date);
  const [confirmDel, setConfirmDel] = useState(false);
  const canDone = ev.ref.kind === "task" || ev.ref.kind === "timeblock" || ev.ref.kind === "milestone" || (ev.ref.kind === "reminder" && ev.movable);
  const canDelete = ev.ref.kind === "timeblock" && ev.layer !== "tercatat";
  const exam = ev.layer === "kuliah" && ev.title.match(/^(UTS|UAS|Kuis|Presentasi|Lainnya) /);
  const source = ev.layer === "rapat" ? "Buka rapat" : ev.layer === "kuliah" ? "Buka mata kuliah" : SOURCE_LABEL[ev.ref.kind];
  const delLabel = ev.layer === "rapat" ? "Batalkan rapat" : ev.layer === "kuliah" ? (exam ? "Hapus ujian" : "Kelas batal") : "Hapus blok";
  const desc = ops.description?.(ev);

  const commitTitle = () => {
    const t = title.trim();
    if (t && t !== ev.title) ops.rename(ev, t);
  };
  const commitTime = () => {
    const s = parseHHMM(start);
    const e = parseHHMM(end);
    if (s === null || e === null || e <= s) return;
    if (s !== ev.start || e !== ev.end || date !== ev.date) ops.retime(ev, date, s, e);
  };

  return (
    <Popover at={at} onClose={onClose} label={`Detail: ${ev.title}`} width={340}>
      <div className={`evp cc-${ev.color}`}>
        <header className="evp-head">
          <i className="cal-swatch lg" />
          <span className="evp-kind">
            <EvIcon ev={ev} />
            {LAYER_NAME[ev.layer]}
            {ev.done && <span className="evp-done">selesai</span>}
          </span>
          <button className="icon-btn sm" onClick={onClose} aria-label="Tutup">
            <X size={15} />
          </button>
        </header>
        {editable ? (
          <input
            className="evp-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitTitle();
                (e.target as HTMLInputElement).blur();
              }
            }}
            aria-label="Judul"
          />
        ) : (
          <h3 className="evp-title">{ev.title}</h3>
        )}
        <div className="evp-meta">
          <Clock size={14} />
          {timeEditable ? (
            <span className="evp-time-edit">
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} onBlur={commitTime} aria-label="Tanggal" />
              <input value={start} onChange={(e) => setStart(e.target.value)} onBlur={commitTime} aria-label="Mulai" className="hhmm" />
              –
              <input value={end} onChange={(e) => setEnd(e.target.value)} onBlur={commitTime} aria-label="Selesai" className="hhmm" />
            </span>
          ) : (
            <span>
              {dayLong(parseDateKey(ev.date).getTime())}
              {ev.endDate && ev.endDate !== ev.date ? ` – ${dayLong(parseDateKey(ev.endDate).getTime())}` : ""} · {timeRange(ev)}
            </span>
          )}
        </div>
        {ev.projectId && (
          <div className="evp-meta">
            <ProjectChip id={ev.projectId} />
          </div>
        )}
        {((ev.sub && ev.layer === "luar") || ev.location) && (
          <div className="evp-meta">
            <MapPin size={14} />
            <span>{ev.location ?? ev.sub}</span>
          </div>
        )}
        {ev.link && (
          <div className="evp-meta">
            <Video size={14} />
            <button className="link" onClick={() => api.openUrl(ev.link!)}>
              Gabung {linkPlatform(ev.link) !== "Tautan" ? linkPlatform(ev.link) : "kelas daring"}
            </button>
          </div>
        )}
        {ev.layer === "kuliah" && !exam && ops.setAttendance && (
          <div className="evp-meta">
            <Check size={14} />
            <select className="evp-att" value={ev.attendance ?? ""} onChange={(e) => ops.setAttendance!(ev, (e.target.value || undefined) as Attendance | undefined)} aria-label="Presensi">
              <option value="">Presensi belum diisi</option>
              {(Object.keys(ATTENDANCE_LABEL) as Attendance[]).map((k) => (
                <option key={k} value={k}>{ATTENDANCE_LABEL[k]}</option>
              ))}
            </select>
          </div>
        )}
        {desc && <p className="evp-desc">{desc}</p>}
        <footer className="evp-actions">
          {canDone && (
            <button className="btn btn-sm" onClick={() => (ops.toggleDone(ev), onClose())}>
              {ev.done ? <RotateCcw size={14} /> : <Check size={14} />}
              {ev.done ? "Buka lagi" : ev.ref.kind === "milestone" ? "Tercapai" : "Selesai"}
            </button>
          )}
          {ev.layer === "luar" && (
            <button className="btn btn-sm" onClick={() => (ops.copyToBlock(ev), onClose())} title="Buat blok jadwal Ruangku dari acara ini">
              <CalendarPlus size={14} /> Jadikan blok
            </button>
          )}
          {source && (
            <button className="btn btn-sm" onClick={() => (ops.openSource(ev), onClose())}>
              <ArrowUpRight size={14} /> {source}
            </button>
          )}
          {canDelete &&
            (confirmDel ? (
              <button className="btn btn-sm btn-danger" onClick={() => (ops.remove(ev), onClose())}>
                {ev.layer === "blok" ? "Yakin hapus?" : `${delLabel}?`}
              </button>
            ) : (
              <button className="icon-btn sm evp-del" onClick={() => setConfirmDel(true)} aria-label={delLabel} title={delLabel}>
                <Trash2 size={15} />
              </button>
            ))}
        </footer>
      </div>
    </Popover>
  );
}
