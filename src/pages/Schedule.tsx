import { useEffect, useMemo, useState } from "react";
import { AlarmClock, Pencil, Plus, Repeat as RepeatIcon, RotateCcw, Trash2 } from "lucide-react";
import type { Item, Reminder } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { addDays, dateKey, dayShort, relativeDay, sameDay, startOfDay, time } from "../lib/date";
import { REPEAT_LABEL } from "../lib/repeat";
import { Confirm, Empty } from "../components/ui";
import { completeReminder, ReminderForm, snoozeReminder } from "./reminderActions";
import { useScope } from "../lib/scope";
import ScheduleGrid from "../schedule/ScheduleGrid";

type Group = { key: string; label: string; items: Item<Reminder>[] };

function groupUpcoming(list: Item<Reminder>[], now: number): Group[] {
  const today = startOfDay(now);
  const tomorrow = today + 86400000;
  const dayAfter = tomorrow + 86400000;
  const week = today + 7 * 86400000;
  const g: Group[] = [
    { key: "late", label: "Terlewat", items: [] },
    { key: "today", label: "Hari ini", items: [] },
    { key: "tomorrow", label: "Besok", items: [] },
    { key: "week", label: "7 hari ke depan", items: [] },
    { key: "later", label: "Nanti", items: [] },
  ];
  for (const r of list) {
    // Yang lewat hari ini tetap di "Hari ini" (diberi tanda Terlewat).
    if (r.dueAt < today) g[0].items.push(r);
    else if (r.dueAt < tomorrow) g[1].items.push(r);
    else if (r.dueAt < dayAfter) g[2].items.push(r);
    else if (r.dueAt < week) g[3].items.push(r);
    else g[4].items.push(r);
  }
  return g.filter((x) => x.items.length > 0);
}

export function ReminderRow({
  r,
  now,
  onDone,
  onEdit,
  onSnooze,
  onDelete,
  compact,
}: {
  r: Item<Reminder>;
  now: number;
  onDone: () => void;
  onEdit?: () => void;
  onSnooze?: (min: number) => void;
  onDelete?: () => void;
  compact?: boolean;
}) {
  const late = !r.done && r.dueAt < now;
  return (
    <li className={`rem ${r.done ? "rem-done" : ""} ${late ? "rem-late" : ""} rem-p-${r.priority ?? "sedang"}`}>
      <button
        className="check"
        onClick={onDone}
        aria-label={r.done ? "Tandai belum selesai" : r.repeat !== "none" ? "Selesai untuk jadwal ini" : "Tandai selesai"}
        aria-pressed={r.done}
      />
      <div className="rem-time">
        <span className="rem-clock">{time(r.dueAt)}</span>
        {!sameDay(r.dueAt, now) && <span className="rem-day">{relativeDay(r.dueAt, now)}</span>}
      </div>
      <div className="rem-main">
        <span className="rem-title">{r.title}</span>
        <span className="rem-meta">
          {r.repeat !== "none" && (
            <span className="tag">
              <RepeatIcon size={12} /> {REPEAT_LABEL[r.repeat]}
            </span>
          )}
          {r.category && <span className="tag">{r.category}</span>}
          {late && <span className="tag tag-warn">Terlewat</span>}
          {!compact && r.notes && <span className="rem-notes">{r.notes}</span>}
        </span>
      </div>
      {!compact && (
        <div className="row-actions">
          {onSnooze && !r.done && (
            <>
              <button className="icon-btn" title="Tunda 10 menit" onClick={() => onSnooze(10)}>
                <AlarmClock size={16} />
              </button>
              <button className="chip-btn" title="Tunda 1 jam" onClick={() => onSnooze(60)}>
                +1 jam
              </button>
            </>
          )}
          {onEdit && (
            <button className="icon-btn" title="Ubah" onClick={onEdit}>
              <Pencil size={16} />
            </button>
          )}
          {onDelete && (
            <button className="icon-btn" title="Hapus" onClick={onDelete}>
              <Trash2 size={16} />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

export default function Schedule() {
  const [tab, setTabState] = useState<"harian" | "reminder">(() => (localStorage.getItem("ruangku-schedule-tab") as "harian" | "reminder") || "harian");
  const setTab = (t: "harian" | "reminder") => {
    setTabState(t);
    try {
      localStorage.setItem("ruangku-schedule-tab", t);
    } catch {
      /* abaikan */
    }
  };
  const scope = useScope();
  return (
    <div className={`page ${tab === "harian" ? "page-wide" : ""}`}>
      <header className="page-head">
        <div>
          <h1>Jadwal{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <p className="page-sub">{tab === "harian" ? "Blok waktu per jam. Atur arah (vertikal/horizontal), ukuran, dan jumlah hari sesuai selera." : "Reminder dengan notifikasi Windows, tetap berjalan selama Ruangku ada di system tray."}</p>
        </div>
        <div className="seg" role="tablist" aria-label="Bagian jadwal">
          <button role="tab" aria-selected={tab === "harian"} className={tab === "harian" ? "active" : ""} onClick={() => setTab("harian")}>Jadwal harian</button>
          <button role="tab" aria-selected={tab === "reminder"} className={tab === "reminder" ? "active" : ""} onClick={() => setTab("reminder")}>Reminder</button>
        </div>
      </header>
      {tab === "harian" ? <ScheduleGrid /> : <Reminders />}
    </div>
  );
}

function Reminders() {
  const { items: allItems, save, remove, loading } = useRecords<Reminder>("reminder");
  const scope = useScope();
  const items = useMemo(() => allItems.filter((r) => scope.match(r.projectId)), [allItems, scope]);
  const now = useNow();
  const [view, setView] = useState<"upcoming" | "done">("upcoming");
  const [day, setDay] = useState<string | null>(null);
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Item<Reminder> | "new" | null>(null);
  const [deleting, setDeleting] = useState<Item<Reminder> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setEditing("new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const categories = useMemo(() => [...new Set(items.map((r) => r.category).filter(Boolean) as string[])].sort(), [items]);
  const open = useMemo(() => items.filter((r) => !r.done).sort((a, b) => a.dueAt - b.dueAt), [items]);
  const done = useMemo(() => items.filter((r) => r.done).sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0)), [items]);

  const week = Array.from({ length: 7 }, (_, i) => addDays(new Date(startOfDay(now)), i));
  const countByDay = useMemo(() => {
    const m = new Map<string, number>();
    open.forEach((r) => m.set(dateKey(r.dueAt), (m.get(dateKey(r.dueAt)) ?? 0) + 1));
    return m;
  }, [open]);

  const filtered = (view === "upcoming" ? open : done).filter(
    (r) => (!cat || r.category === cat) && (!day || dateKey(r.dueAt) === day),
  );
  const groups = view === "upcoming" ? groupUpcoming(filtered, now) : [{ key: "done", label: "Selesai", items: filtered }];

  const toggle = (r: Item<Reminder>) =>
    r.done ? save({ ...strip(r), done: false, doneAt: undefined }, r.id) : save(completeReminder(r), r.id);

  return (
    <div>
      <div className="rem-top">
        <p className="muted">{open.length} reminder aktif{scope.current ? ` di ${scope.current.name}` : ""}.</p>
        <button className="btn btn-primary" onClick={() => setEditing("new")} title="Ctrl+N">
          <Plus size={16} /> Tambah reminder
        </button>
      </div>

      <div className="weekstrip" role="group" aria-label="Pilih hari">
        {week.map((d) => {
          const k = dateKey(d);
          const n = countByDay.get(k) ?? 0;
          const active = day === k;
          return (
            <button key={k} className={`weekday ${active ? "active" : ""}`} onClick={() => setDay(active ? null : k)}>
              <span className="weekday-name">{k === dateKey(now) ? "Hari ini" : dayShort(d.getTime()).split(",")[0]}</span>
              <span className="weekday-num">{d.getDate()}</span>
              <span className="weekday-dots" aria-label={`${n} reminder`}>
                {Array.from({ length: Math.min(n, 4) }, (_, i) => (
                  <i key={i} />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="toolbar">
        <div className="seg">
          <button className={view === "upcoming" ? "active" : ""} onClick={() => setView("upcoming")}>
            Mendatang
          </button>
          <button className={view === "done" ? "active" : ""} onClick={() => setView("done")}>
            Selesai ({done.length})
          </button>
        </div>
        {categories.length > 0 && (
          <div className="chips">
            <button className={`chip ${!cat ? "active" : ""}`} onClick={() => setCat(null)}>
              Semua
            </button>
            {categories.map((c) => (
              <button key={c} className={`chip ${cat === c ? "active" : ""}`} onClick={() => setCat(cat === c ? null : c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {day && (
          <button className="chip-btn" onClick={() => setDay(null)}>
            <RotateCcw size={13} /> Semua hari
          </button>
        )}
      </div>

      {!loading && filtered.length === 0 ? (
        <Empty
          title={view === "done" ? "Belum ada reminder yang selesai" : "Tidak ada reminder di sini"}
          text={view === "done" ? undefined : "Tambahkan rapat, tenggat, atau kebiasaan harian. Ruangku akan mengingatkan Anda."}
          action={
            view === "upcoming" && (
              <button className="btn btn-primary" onClick={() => setEditing("new")}>
                <Plus size={16} /> Tambah reminder
              </button>
            )
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.key} className="group">
            <h2 className={`group-title ${g.key === "late" ? "warn" : ""}`}>
              {g.label} <span className="count">{g.items.length}</span>
            </h2>
            <ul className="rem-list">
              {g.items.map((r) => (
                <ReminderRow
                  key={r.id}
                  r={r}
                  now={now}
                  onDone={() => toggle(r)}
                  onEdit={() => setEditing(r)}
                  onSnooze={(m) => save(snoozeReminder(r, m), r.id)}
                  onDelete={() => setDeleting(r)}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {editing && (
        <ReminderForm
          initial={editing === "new" ? undefined : editing}
          categories={categories}
          onClose={() => setEditing(null)}
          onSave={(r) => save(r, editing === "new" ? undefined : editing.id)}
        />
      )}
      {deleting && (
        <Confirm
          title="Hapus reminder?"
          text={`"${deleting.title}" akan dihapus dari semua perangkat yang tersinkron.`}
          confirmLabel="Hapus reminder"
          onConfirm={() => remove(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
