// Jadwal harian di aplikasi utama: grid jam 1/3/7 hari, vertikal atau horizontal,
// ukuran bisa diatur, dan bisa difokuskan ke satu proyek.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Columns3, LayoutTemplate, Rows3 } from "lucide-react";
import type { Item, Reminder, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { reminderTimesOn, visibleHours, fmtMin } from "../lib/timeblocks";
import { useTasks } from "../lib/useTasks";
import { useScope } from "../lib/scope";
import { useIbadah } from "../lib/useIbadah";
import { blockProject } from "../lib/projects";
import { fmtDuration } from "../lib/tasks";
import { applyDayTemplate, BUILTIN_DAY_TEMPLATES, DayTemplate } from "../lib/projectTemplates";
import TimeGrid, { Orientation } from "../widget/TimeGrid";
import { boxTask, TaskTray } from "../tasks/TimeTracking";
import { completeReminder } from "../pages/reminderActions";
import { useToast } from "../components/ui";
import { removeBlockSmart, REMOVE_MESSAGE } from "../lib/agendaSync";
import { conflicts, nudge, prayerBands, useGuard } from "../lib/prayerGuard";
import { useNow } from "../pages/Schedule";
import { PaneResizer, usePaneWidth } from "../components/Pane";

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BLN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

interface Prefs {
  orientation: Orientation;
  days: 1 | 3 | 7;
  size: number; // persen 60..180
  tray: boolean;
  prayers: boolean;
}
const DEF: Prefs = { orientation: "vertical", days: 1, size: 100, tray: true, prayers: true };
const KEY = "ruangku-schedule-prefs";

function loadPrefs(): Prefs {
  try {
    return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return DEF;
  }
}

export default function ScheduleGrid() {
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [trayW, setTrayW, resetTrayW] = usePaneWidth("schedule-tray", 240, 180, 460);
  const setPrefs = (p: Partial<Prefs>) =>
    setPrefsState((cur) => {
      const n = { ...cur, ...p };
      try {
        localStorage.setItem(KEY, JSON.stringify(n));
      } catch {
        /* abaikan */
      }
      return n;
    });
  const now = useNow(30000);
  const today = dateKey(now);
  const [anchor, setAnchor] = useState(today);
  const blocks = useRecords<TimeBlock>("timeblock");
  const reminders = useRecords<Reminder>("reminder");
  const dayTemplates = useRecords<DayTemplate>("daytemplate");
  const tk = useTasks();
  const scope = useScope();
  const ib = useIbadah();
  const toast = useToast();
  const guard = useGuard();
  const [tplOpen, setTplOpen] = useState(false);

  /** Simpan blok; bila menimpa waktu sholat yang dilindungi, tawarkan geser ke setelah sholat. */
  const saveBlock = async (b: TimeBlock, id?: string) => {
    const bid = await blocks.save(b, id);
    const t = guard.cfg.enabled ? ib.times(b.date) : null;
    if (!t || b.tracked) return bid;
    const bands = prayerBands(t, parseDateKey(b.date).getDay(), guard.cfg);
    const hit = conflicts(b, bands);
    if (hit.length) {
      const to = nudge(b, bands);
      toast(`"${b.title || "Blok"}" menimpa waktu ${hit.map((h) => h.name).join(" & ")}`, "error", to ? { label: `Geser ke ${fmtMin(to.start)}`, run: () => blocks.save({ ...b, ...to }, bid) } : undefined);
    }
    return bid;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || e.ctrlKey || e.metaKey) return;
      if (e.key === "[") setAnchor((a) => dateKey(addDays(parseDateKey(a), -prefs.days)));
      if (e.key === "]") setAnchor((a) => dateKey(addDays(parseDateKey(a), prefs.days)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prefs.days]);

  // 7 hari mulai Senin; 3 hari dan 1 hari mulai dari jangkar.
  const dates = useMemo(() => {
    const a = parseDateKey(anchor);
    const start = prefs.days === 7 ? addDays(a, -((a.getDay() + 6) % 7)) : a;
    return Array.from({ length: prefs.days }, (_, i) => dateKey(addDays(start, i)));
  }, [anchor, prefs.days]);

  const inScope = (b: Item<TimeBlock>) => scope.match(blockProject(b, tk.tasks));
  const dimIds = useMemo(() => (scope.ids ? new Set(blocks.items.filter((b) => !inScope(b)).map((b) => b.id)) : undefined), [blocks.items, scope.ids, tk.tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const prayerMarks = (d: string) => {
    if (!prefs.prayers) return [];
    const pt = ib.times(d);
    return pt ? (["subuh", "dzuhur", "ashar", "maghrib", "isya"] as const).map((k) => ({ label: k[0].toUpperCase() + k.slice(1), at: pt[k] })) : [];
  };
  const remMarks = (d: string) => reminders.items.filter((r) => scope.match(r.projectId)).flatMap((r) => reminderTimesOn(r, d).map((at) => ({ r, at })));

  // Rentang jam sama untuk semua hari supaya sejajar.
  const range = useMemo(() => {
    const mins: number[] = [];
    for (const d of dates) {
      for (const b of blocks.items) if (b.date === d) mins.push(b.start, b.end);
      for (const m of remMarks(d)) mins.push(new Date(m.at).getHours() * 60 + new Date(m.at).getMinutes());
      for (const p of prayerMarks(d)) mins.push(p.at);
    }
    if (dates.includes(today)) mins.push(new Date(now).getHours() * 60);
    return visibleHours(mins);
  }, [dates, blocks.items, reminders.items, prefs.prayers, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const H = prefs.orientation === "horizontal";
  const scale = prefs.size / 100;
  const style = { ["--tg-hour" as string]: `${Math.round((H ? 64 : prefs.days === 1 ? 52 : 46) * scale)}px`, ["--tg-lane" as string]: `${Math.round((prefs.days === 1 ? 130 : 84) * scale)}px` };

  const planned = blocks.items.filter((b) => dates.includes(b.date) && !b.tracked && inScope(b)).reduce((s, b) => s + b.end - b.start, 0);
  const tracked = blocks.items.filter((b) => dates.includes(b.date) && b.tracked && inScope(b)).reduce((s, b) => s + b.end - b.start, 0);
  const pool = tk.tasks.filter((t) => scope.match(t.projectId === "inbox" ? undefined : t.projectId) || (!scope.ids && t.projectId === "inbox"));
  const shift = (n: number) => setAnchor(dateKey(addDays(parseDateKey(anchor), n * prefs.days)));
  const first = parseDateKey(dates[0]);
  const last = parseDateKey(dates[dates.length - 1]);
  const title =
    prefs.days === 1
      ? `${anchor === today ? "Hari ini · " : ""}${HARI[first.getDay()]}, ${first.getDate()} ${BLN[first.getMonth()]} ${first.getFullYear()}`
      : `${first.getDate()} ${BLN[first.getMonth()]} – ${last.getDate()} ${BLN[last.getMonth()]} ${last.getFullYear()}`;
  const allTemplates: DayTemplate[] = [...BUILTIN_DAY_TEMPLATES, ...dayTemplates.items];

  const grid = (d: string, i: number) => (
    <TimeGrid
      key={d}
      date={d}
      orientation={prefs.orientation}
      hourRange={range}
      hideAxis={i > 0}
      showHelp={false}
      blocks={blocks.items.filter((b) => b.date === d)}
      dimIds={dimIds}
      reminders={remMarks(d)}
      prayers={prayerMarks(d)}
      isToday={d === today}
      now={now}
      projects={scope.allProjects}
      defaultProjectId={scope.defaultProjectId}
      onSave={(b, id) => saveBlock(b, id)}
      onDelete={async (id) => {
        const b = blocks.items.find((x) => x.id === id);
        if (!b) return;
        const r = await removeBlockSmart(b);
        toast(REMOVE_MESSAGE[r.kind](b.title), "info", { label: "Batalkan", run: () => void r.undo() });
      }}
      onReminderDone={(r) => (r.done ? reminders.save({ ...strip(r), done: false, doneAt: undefined }, r.id) : reminders.save(completeReminder(r), r.id))}
      onDropTask={(taskId, minute) => {
        const task = tk.tasks.find((t) => t.id === taskId);
        if (task) saveBlock(boxTask(task, tk.projects, d, minute));
      }}
    />
  );
  const dayLabel = (d: string) => {
    const x = parseDateKey(d);
    const plannedDay = blocks.items.filter((b) => b.date === d && !b.tracked && inScope(b)).reduce((s, b) => s + b.end - b.start, 0);
    return (
      <div className={`sg-day ${d === today ? "today" : ""} ${x.getDay() === 0 ? "sun" : ""}`}>
        <button className="sg-day-btn" onClick={() => { setPrefs({ days: 1 }); setAnchor(d); }} title="Buka hari ini saja">
          <b>{HARI[x.getDay()].slice(0, 3)}</b> <span>{x.getDate()}</span>
        </button>
        {plannedDay > 0 && <small>{fmtDuration(plannedDay)}</small>}
      </div>
    );
  };

  return (
    <div className="sg">
      <div className="sg-bar">
        <div className="rm-nav">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Sebelumnya" title="Sebelumnya ([)"><ChevronLeft size={17} /></button>
          <strong className="sg-title">{title}</strong>
          <button className="icon-btn" onClick={() => shift(1)} aria-label="Berikutnya" title="Berikutnya (])"><ChevronRight size={17} /></button>
          {!dates.includes(today) && <button className="chip-btn" onClick={() => setAnchor(today)}>Hari ini</button>}
        </div>
        <div className="seg" role="tablist" aria-label="Jumlah hari">
          {([1, 3, 7] as const).map((n) => (
            <button key={n} role="tab" aria-selected={prefs.days === n} className={prefs.days === n ? "active" : ""} onClick={() => setPrefs({ days: n })}>{n === 1 ? "Hari" : n === 3 ? "3 hari" : "Minggu"}</button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Arah tampilan">
          <button role="tab" aria-selected={!H} className={!H ? "active" : ""} onClick={() => setPrefs({ orientation: "vertical" })} title="Jam ke bawah"><Columns3 size={14} /> Vertikal</button>
          <button role="tab" aria-selected={H} className={H ? "active" : ""} onClick={() => setPrefs({ orientation: "horizontal" })} title="Jam ke kanan"><Rows3 size={14} /> Horizontal</button>
        </div>
        <label className="sg-size" title="Ukuran grid">
          <span>Ukuran</span>
          <input type="range" min={60} max={180} step={10} value={prefs.size} onChange={(e) => setPrefs({ size: Number(e.target.value) })} aria-label="Ukuran grid jam" />
          <b>{prefs.size}%</b>
        </label>
        <div className="sg-more">
          <label className="switch small"><input type="checkbox" checked={prefs.tray} onChange={(e) => setPrefs({ tray: e.target.checked })} /><span>Baki tugas</span></label>
          <label className="switch small"><input type="checkbox" checked={prefs.prayers} onChange={(e) => setPrefs({ prayers: e.target.checked })} /><span>Waktu sholat</span></label>
          <div className="sg-tpl">
            <button className="chip-btn" onClick={() => setTplOpen(!tplOpen)} aria-expanded={tplOpen}><LayoutTemplate size={13} /> Template hari</button>
            {tplOpen && (
              <div className="menu">
                {allTemplates.map((tpl) => (
                  <button
                    key={tpl.name}
                    onClick={async () => {
                      setTplOpen(false);
                      const d = dates[0];
                      const existing = blocks.items.filter((b) => b.date === d);
                      const list = applyDayTemplate(tpl, d, existing);
                      for (const b of list) await blocks.save(scope.defaultProjectId ? { ...b, projectId: scope.defaultProjectId } : b);
                      toast(list.length ? `${list.length} blok dari "${tpl.name}" ditambahkan` : "Semua jam template sudah terisi");
                    }}
                  >
                    {tpl.name} <small className="muted">· {tpl.blocks.length} blok</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="muted small sg-sum">
        {planned ? `${fmtDuration(planned)} direncanakan` : "Belum ada blok"}
        {tracked ? ` · ${fmtDuration(tracked)} tercatat timer` : ""}
        {scope.current ? ` · fokus ${scope.current.name} (blok lain dipudarkan)` : ""}
        {" · Klik/seret area kosong untuk menambah, seret blok untuk menggeser, tarik tepinya untuk mengubah durasi."}
      </p>

      <div className={`sg-body pane-host ${prefs.tray ? "with-tray" : ""}`} style={{ ["--pane-l" as string]: `${trayW}px` }}>
        {prefs.tray && (
          <aside className="sg-tray">
            <h3>Seret tugas ke jadwal</h3>
            <TaskTray tasks={pool} projects={tk.projects} date={dates[0]} blocks={blocks.items} />
          </aside>
        )}
        {prefs.tray && <PaneResizer value={trayW} onChange={setTrayW} onReset={resetTrayW} min={180} max={460} offset={7} label="Lebar baki tugas" />}
        <div className="tg-host sg-scroll" style={style}>
          {H ? (
            <div className="sg-rows">
              {dates.map((d, i) => (
                <div key={d} className="sg-row">
                  <div className="sg-row-label" style={i === 0 ? { paddingTop: 18 } : undefined}>{dayLabel(d)}</div>
                  {grid(d, i)}
                </div>
              ))}
            </div>
          ) : (
            <div className={`sg-cols n${prefs.days}`}>
              {dates.map((d, i) => (
                <div key={d} className="sg-col">
                  {prefs.days > 1 && <div className="sg-col-label" style={i === 0 ? { marginLeft: 30 } : undefined}>{dayLabel(d)}</div>}
                  {grid(d, i)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
