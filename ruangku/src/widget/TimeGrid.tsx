import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import type { BlockColor, Item, Reminder, TimeBlock } from "../lib/types";
import type { Project } from "../lib/tasks";
import { flatTree } from "../lib/projects";
import { durationLabel, fmtMin, layout, moveRange, normalizeRange, parseHHMM, resizeRange, snap, visibleHours } from "../lib/timeblocks";
import { strip } from "../lib/useRecords";
import { time } from "../lib/date";

export const BLOCK_COLORS: { id: BlockColor; label: string }[] = [
  { id: "nila", label: "Nila" },
  { id: "kunyit", label: "Kunyit" },
  { id: "daun", label: "Daun" },
  { id: "bata", label: "Bata" },
  { id: "abu", label: "Abu" },
  { id: "ungu", label: "Ungu" },
  { id: "laut", label: "Laut" },
  { id: "jambu", label: "Jambu" },
  { id: "kopi", label: "Kopi" },
];

type Drag =
  | { mode: "move"; id: string; y0: number; start: number; end: number; moved: boolean }
  | { mode: "start" | "end"; id: string; start: number; end: number }
  | { mode: "create"; anchor: number; current: number; y0: number; moved: boolean };

export interface PrayerMark {
  label: string;
  at: number; // menit sejak 00:00
}

export interface ReminderMark {
  r: Item<Reminder>;
  at: number;
}

function BlockForm({
  block,
  focusTitle,
  projects,
  onChange,
  onDelete,
  onClose,
}: {
  block: Item<TimeBlock>;
  focusTitle: boolean;
  projects?: Item<Project>[];
  onChange: (b: TimeBlock) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(block.title);
  const [note, setNote] = useState(block.note ?? "");
  const [s, setS] = useState(fmtMin(block.start));
  const [e, setE] = useState(fmtMin(block.end));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setTitle(block.title);
    setNote(block.note ?? "");
    setS(fmtMin(block.start));
    setE(fmtMin(block.end));
  }, [block.id, block.title, block.note, block.start, block.end]);
  useEffect(() => {
    if (focusTitle) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [focusTitle, block.id]);

  const base = strip(block);
  const commitTitle = () => {
    const t = title.trim() || "Aktivitas";
    if (t !== block.title) onChange({ ...base, title: t });
  };
  const commitTimes = (ns: string, ne: string) => {
    const a = parseHHMM(ns);
    let b = parseHHMM(ne);
    if (a === null || b === null) {
      // Kembalikan isian yang tidak valid ke nilai tersimpan.
      setS(fmtMin(block.start));
      setE(fmtMin(block.end));
      return;
    }
    if (b <= a) b = a + 15;
    const r = normalizeRange(a, b);
    if (r.start !== block.start || r.end !== block.end) onChange({ ...base, ...r });
  };

  return (
    <div className="tg-form w-nodrag" onKeyDown={(ev) => ev.key === "Escape" && onClose()}>
      <div className="tg-form-row">
        <input
          ref={ref}
          className="tg-title-input"
          value={title}
          aria-label="Nama aktivitas"
          placeholder="Nama aktivitas"
          onChange={(ev) => setTitle(ev.target.value)}
          onBlur={commitTitle}
          onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
        />
        <button className="w-icon" onClick={onClose} aria-label="Tutup editor blok">
          <X size={15} />
        </button>
      </div>
      <div className="tg-form-row">
        <input className="tg-time" value={s} inputMode="numeric" maxLength={5} placeholder="08:00" aria-label="Mulai (jj:mm)" onChange={(ev) => setS(ev.target.value)} onBlur={() => commitTimes(s, e)} onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()} />
        <span className="tg-dash">sampai</span>
        <input className="tg-time" value={e} inputMode="numeric" maxLength={5} placeholder="09:00" aria-label="Selesai (jj:mm)" onChange={(ev) => setE(ev.target.value)} onBlur={() => commitTimes(s, e)} onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()} />
        <span className="tg-dur">{durationLabel(block.start, block.end)}</span>
      </div>
      <div className="tg-form-row">
        <div className="tg-colors" role="radiogroup" aria-label="Warna">
          {BLOCK_COLORS.map((c) => (
            <button
              key={c.id}
              role="radio"
              aria-checked={(block.color ?? "nila") === c.id}
              aria-label={c.label}
              className={`tg-color c-${c.id} ${(block.color ?? "nila") === c.id ? "on" : ""}`}
              onClick={() => onChange({ ...base, color: c.id })}
            />
          ))}
        </div>
        <button className={`w-btn sm ${block.done ? "primary" : ""}`} onClick={() => onChange({ ...base, done: !block.done })}>
          <Check size={13} /> {block.done ? "Selesai" : "Tandai selesai"}
        </button>
        <button className="w-icon danger" onClick={onDelete} aria-label="Hapus blok" title="Hapus blok (Delete)">
          <Trash2 size={15} />
        </button>
      </div>
      <div className="tg-form-row">
        <span className="tg-dash">Notifikasi</span>
        <select
          className="tg-notify"
          value={block.notify === undefined ? "default" : String(block.notify)}
          aria-label="Notifikasi blok"
          onChange={(ev) => {
            const v = ev.target.value;
            onChange({ ...base, notify: v === "default" ? undefined : v === "off" ? "off" : Number(v) });
          }}
        >
          <option value="default">Ikuti pengaturan</option>
          <option value="0">Tepat waktu</option>
          {[5, 10, 15, 30].map((n) => <option key={n} value={n}>{n} menit sebelumnya</option>)}
          <option value="off">Mati</option>
        </select>
      </div>
      {projects && (
        <div className="tg-form-row">
          <span className="tg-dash">Proyek</span>
          <select
            className="tg-notify"
            value={block.projectId ?? ""}
            aria-label="Proyek blok"
            onChange={(ev) => {
              const pid = ev.target.value || undefined;
              const p = projects.find((x) => x.id === pid);
              onChange({ ...base, projectId: pid, color: p && (!block.projectId || block.color === projects.find((x) => x.id === block.projectId)?.color) ? p.color : block.color });
            }}
          >
            <option value="">Tanpa proyek</option>
            {flatTree(projects.filter((x) => x.id !== "inbox" && !x.archived)).map(({ p, depth }) => (
              <option key={p.id} value={p.id}>{"\u00a0\u00a0".repeat(depth)}{p.icon ? `${p.icon} ` : ""}{p.name}</option>
            ))}
          </select>
        </div>
      )}
      <input
        className="tg-note-input"
        value={note}
        placeholder="Catatan singkat (opsional)"
        aria-label="Catatan blok"
        onChange={(ev) => setNote(ev.target.value)}
        onBlur={() => note.trim() !== (block.note ?? "") && onChange({ ...base, note: note.trim() || undefined })}
        onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
      />
    </div>
  );
}

export type Orientation = "vertical" | "horizontal";

export default function TimeGrid({
  date,
  blocks,
  reminders,
  prayers = [],
  isToday,
  now,
  onSave,
  onDelete,
  onReminderDone,
  onDropTask,
  orientation = "vertical",
  hourRange,
  hideAxis,
  projects,
  defaultProjectId,
  defaultColor,
  showHelp = true,
  dimIds,
}: {
  date: string;
  blocks: Item<TimeBlock>[];
  reminders: ReminderMark[];
  prayers?: PrayerMark[];
  isToday: boolean;
  now: number;
  onSave: (b: TimeBlock, id?: string) => Promise<string> | string | void;
  onDelete: (id: string) => void;
  onReminderDone: (r: Item<Reminder>) => void;
  /** Tugas diseret ke grid: buat blok mulai `minute` (timeboxing). */
  onDropTask?: (taskId: string, minute: number) => void;
  /** Vertikal (jam ke bawah) atau horizontal (jam ke kanan). */
  orientation?: Orientation;
  /** Paksa rentang jam (dipakai tampilan beberapa hari supaya sejajar). */
  hourRange?: { from: number; to: number };
  /** Sembunyikan label jam (kolom/baris kedua dst.). */
  hideAxis?: boolean;
  /** Daftar proyek untuk pilihan proyek di editor blok. */
  projects?: Item<Project>[];
  defaultProjectId?: string;
  defaultColor?: BlockColor;
  showHelp?: boolean;
  /** Blok di luar proyek yang sedang difokuskan (ditampilkan pudar). */
  dimIds?: Set<string>;
}) {
  const H = orientation === "horizontal";
  const grid = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusTitle, setFocusTitle] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);

  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const auto = visibleHours([
    ...blocks.flatMap((b) => [b.start, b.end]),
    ...reminders.map((m) => new Date(m.at).getHours() * 60 + new Date(m.at).getMinutes()),
    ...prayers.map((p) => p.at),
    ...(isToday ? [nowMin] : []),
  ]);
  const { from, to } = hourRange ?? auto;
  const total = (to - from) * 60;

  // Sumbu waktu: Y untuk vertikal, X untuk horizontal.
  const coord = (e: { clientX: number; clientY: number }) => (H ? e.clientX : e.clientY);
  const toMin = (c: number) => {
    const r = grid.current!.getBoundingClientRect();
    return from * 60 + ((c - (H ? r.left : r.top)) / (H ? r.width : r.height)) * total;
  };
  const perPx = () => {
    const r = grid.current!.getBoundingClientRect();
    return total / (H ? r.width : r.height);
  };

  // Blok yang ditampilkan, dengan pratinjau selama diseret.
  const shown = useMemo(() => {
    const list = blocks.map((b) => ({ ...b }));
    if (drag && drag.mode !== "create") {
      const b = list.find((x) => x.id === drag.id);
      if (b) Object.assign(b, { start: drag.start, end: drag.end });
    }
    return list;
  }, [blocks, drag]);
  const placed = layout(shown);
  const creating = drag?.mode === "create" && drag.moved ? normalizeRange(drag.anchor, drag.current) : null;

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const c = coord(e);
      if (drag.mode === "create") {
        setDrag({ ...drag, current: toMin(c), moved: drag.moved || Math.abs(c - drag.y0) > 5 });
      } else if (drag.mode === "move") {
        const orig = blocks.find((b) => b.id === drag.id)!;
        const delta = (c - drag.y0) * perPx();
        const r = moveRange(orig.start, orig.end, delta);
        setDrag({ ...drag, ...r, moved: drag.moved || Math.abs(c - drag.y0) > 4 });
      } else {
        const orig = blocks.find((b) => b.id === drag.id)!;
        setDrag({ ...drag, ...resizeRange(orig.start, orig.end, drag.mode, toMin(c)) });
      }
    };
    const up = async () => {
      const d = drag;
      setDrag(null);
      if (d.mode === "create") {
        const r = d.moved ? normalizeRange(d.anchor, d.current) : normalizeRange(Math.floor(d.anchor / 30) * 30, Math.floor(d.anchor / 30) * 30 + 60);
        const pColor = projects?.find((p) => p.id === defaultProjectId)?.color;
        const id = await onSave({ date, ...r, title: "Aktivitas baru", color: defaultColor ?? pColor ?? "nila", ...(defaultProjectId ? { projectId: defaultProjectId } : {}) });
        if (id) {
          setSelected(id);
          setFocusTitle(true);
        }
        return;
      }
      const orig = blocks.find((b) => b.id === d.id);
      if (!orig) return;
      if (d.mode === "move" && !d.moved) {
        setSelected(d.id);
        setFocusTitle(false);
        return;
      }
      if (d.start !== orig.start || d.end !== orig.end) onSave({ ...strip(orig), start: d.start, end: d.end }, d.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up, { once: true });
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag, blocks]);

  // Pintasan keyboard untuk blok terpilih.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!selected || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      const b = blocks.find((x) => x.id === selected);
      if (!b) return;
      const back = H ? "ArrowLeft" : "ArrowUp";
      const fwd = H ? "ArrowRight" : "ArrowDown";
      if (e.key === "Delete" || e.key === "Backspace") {
        onDelete(b.id);
        setSelected(null);
      } else if (e.key === "Escape") setSelected(null);
      else if (e.key === "Enter") setFocusTitle(true);
      else if (e.key === back || e.key === fwd) {
        e.preventDefault();
        const d = e.key === back ? -15 : 15;
        const r = e.shiftKey ? resizeRange(b.start, b.end, "end", b.end + d) : moveRange(b.start, b.end, d);
        onSave({ ...strip(b), ...r }, b.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, blocks, onSave, onDelete, H]);

  const sel = blocks.find((b) => b.id === selected);
  const formRef = useRef<HTMLDivElement>(null);
  // Pastikan editor terlihat setelah blok dipilih.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [selected]);
  const pct = (m: number) => `${((m - from * 60) / total) * 100}%`;
  const hours = Array.from({ length: to - from }, (_, i) => from + i);
  /** Posisi pada sumbu waktu + lebar/tinggi. */
  const along = (a: number, b: number) => (H ? { left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` } : { top: pct(a), height: `calc(${pct(b)} - ${pct(a)})` });
  const at = (m: number) => (H ? { left: pct(m) } : { top: pct(m) });
  // Horizontal: sisakan pita atas untuk label sholat dan pita bawah untuk reminder.
  const lane = (col: number, cols: number) =>
    H
      ? { top: `calc(16px + (100% - 36px) * ${col / cols} + 1px)`, height: `calc((100% - 36px) / ${cols} - 2px)` }
      : { left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` };
  const formPos = !sel
    ? {}
    : H
      ? { top: "22px", left: `clamp(0px, calc(${pct(sel.end)} + 8px), calc(100% - 330px))` }
      : sel.end > to * 60 - 200
        ? { bottom: `calc(100% - ${pct(sel.start)} + 6px)` }
        : { top: `calc(${pct(sel.end)} + 6px)` };
  const wrapStyle = H ? { width: `calc(var(--tg-hour) * ${to - from} + ${hideAxis ? 0 : 0}px)` } : { height: `calc(var(--tg-hour) * ${to - from})` };

  return (
    <div className={`tg ${H ? "h" : "v"} ${hideAxis ? "no-axis" : ""}`}>
      <div className="tg-wrap w-nodrag" style={wrapStyle}>
      {sel && (
        <div ref={formRef} className="tg-form-anchor" style={formPos}>
        <BlockForm
          block={sel}
          focusTitle={focusTitle}
          projects={projects}
          onChange={(b) => onSave(b, sel.id)}
          onDelete={() => {
            onDelete(sel.id);
            setSelected(null);
          }}
          onClose={() => setSelected(null)}
        />
        </div>
      )}
        <div className="tg-gutter" aria-hidden="true">
          {!hideAxis && hours.map((h) => (
            <span key={h} style={at(h * 60)}>{String(h).padStart(2, "0")}</span>
          ))}
        </div>
        <div
          ref={grid}
          className="tg-grid"
          role="application"
          onDragOver={(e) => {
            if (!onDropTask || !e.dataTransfer.types.includes("text/task")) return;
            e.preventDefault();
            setDropAt(Math.floor(toMin(coord(e)) / 15) * 15);
          }}
          onDragLeave={() => setDropAt(null)}
          onDrop={(e) => {
            const id = e.dataTransfer.getData("text/task");
            setDropAt(null);
            if (!id || !onDropTask) return;
            e.preventDefault();
            onDropTask(id, Math.max(0, Math.min(1425, Math.floor(toMin(coord(e)) / 15) * 15)));
          }}
          aria-label="Blok waktu. Klik area kosong untuk menambah, seret untuk menggeser."
          onPointerDown={(e) => {
            if (e.button !== 0 || e.target !== e.currentTarget) return;
            e.preventDefault();
            setSelected(null);
            const m = toMin(coord(e));
            setDrag({ mode: "create", anchor: snap(m), current: m, y0: coord(e), moved: false });
          }}
        >
          {hours.map((h) => (
            <div key={h} className="tg-line" style={at(h * 60)} />
          ))}
          {hours.map((h) => (
            <div key={`h${h}`} className="tg-line half" style={at(h * 60 + 30)} />
          ))}

          {placed.map(({ item: b, col, cols }) => {
            const short = b.end - b.start <= 30;
            return (
              <div
                key={b.id}
                className={`tg-block c-${b.color ?? "nila"} ${b.done ? "done" : ""} ${selected === b.id ? "sel" : ""} ${drag && "id" in drag && drag.id === b.id ? "dragging" : ""} ${short ? "short" : ""} ${b.tracked ? "tracked" : ""} ${b.taskId ? "linked" : ""} ${dimIds?.has(b.id) ? "dim" : ""}`}
                style={{ ...along(b.start, b.end), ...lane(col, cols) }}
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.preventDefault();
                  e.stopPropagation();
                  setDrag({ mode: "move", id: b.id, y0: coord(e), start: b.start, end: b.end, moved: false });
                }}
                onDoubleClick={() => {
                  setSelected(b.id);
                  setFocusTitle(true);
                }}
                title={`${fmtMin(b.start)}–${fmtMin(b.end)} ${b.title}${b.note ? `\n${b.note}` : ""}`}
              >
                <div className="tg-handle top" onPointerDown={(e) => (e.preventDefault(), e.stopPropagation(), setDrag({ mode: "start", id: b.id, start: b.start, end: b.end }))} />
                <span className="tg-block-title">{b.title}</span>
                <span className="tg-block-time">
                  {fmtMin(b.start)}–{fmtMin(b.end)}
                </span>
                <div className="tg-handle bottom" onPointerDown={(e) => (e.preventDefault(), e.stopPropagation(), setDrag({ mode: "end", id: b.id, start: b.start, end: b.end }))} />
              </div>
            );
          })}

          {dropAt !== null && (
            <div className="tg-drop" style={at(dropAt)} aria-hidden="true">
              <span>{fmtMin(dropAt)}</span>
            </div>
          )}

          {creating && (
            <div className="tg-block c-nila ghost" style={{ ...along(creating.start, creating.end), ...(H ? { top: 16, bottom: 20 } : { left: 2, right: 2 }) }}>
              <span className="tg-block-time">
                {fmtMin(creating.start)}–{fmtMin(creating.end)}
              </span>
            </div>
          )}

          {reminders.map(({ r, at: t }) => {
            const m = new Date(t).getHours() * 60 + new Date(t).getMinutes();
            return (
              <button
                key={`${r.id}-${t}`}
                className={`tg-rem ${r.done ? "done" : ""}`}
                style={at(m)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onReminderDone(r)}
                title={`Reminder ${time(t)}: ${r.title}. Klik untuk tandai selesai.`}
              >
                <i />
                <span>
                  {time(t)} {r.title}
                </span>
              </button>
            );
          })}

          {prayers
            .filter((p) => p.at >= from * 60 && p.at <= to * 60)
            .map((p) => (
              <div key={p.label} className="tg-prayer" style={at(p.at)} title={`${p.label} ${fmtMin(p.at)}`} aria-hidden="true">
                <span>{p.label} {fmtMin(p.at)}</span>
              </div>
            ))}

          {isToday && nowMin >= from * 60 && nowMin <= to * 60 && <div className="tg-now" style={at(nowMin)} aria-hidden="true" />}
        </div>
      </div>
      {showHelp && <p className="tg-help">Klik atau seret di area kosong untuk menambah blok. Seret blok untuk menggeser, tarik tepinya untuk mengubah durasi, klik untuk mengedit.</p>}
    </div>
  );
}
