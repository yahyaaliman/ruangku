// Halaman Kalender: semua jadwal (blok, tugas, pengingat, milestone, sholat, libur,
// Google Calendar & langganan ICS) dalam tampilan hari / minggu / bulan / agenda / tahun.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CalendarClock, CalendarCog, ShieldCheck, ChevronLeft, ChevronRight, Circle, Diamond, EyeOff, FolderKanban, Globe, GraduationCap, Handshake, Moon, Plus, RefreshCw, Timer } from "lucide-react";
import type { Page } from "../App";
import type { Reminder, TimeBlock } from "../lib/types";
import { strip, useRecords } from "../lib/useRecords";
import { useTasks } from "../lib/useTasks";
import { useScope } from "../lib/scope";
import { useIbadah } from "../lib/useIbadah";
import { hijri, HIJRI_MONTHS, hijriLabel } from "../lib/prayer";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { eventsInRange, holidaysIn, LAYERS, moveBlock, moveReminder, moveTask, shiftAnchor, viewRange, viewTitle, type CalEvent, type CalView, type Layer } from "../lib/calendar";
import { firstDoneStatus, firstOpenStatus, projectOf } from "../lib/tasks";
import { requestOpen, useOpenRequest } from "../lib/deeplink";
import { useToast } from "../components/ui";
import { useExternalCalendars } from "../calendar/sources";
import { Ctx, type CalCtx, type Slot } from "../calendar/shared";
import MonthView, { DayList } from "../calendar/MonthView";
import TimeGridView from "../calendar/TimeGridView";
import { AgendaView, MiniMonth, YearView } from "../calendar/OtherViews";
import EventPopover, { type EventOps } from "../calendar/EventPopover";
import QuickCreate, { type NewItem } from "../calendar/QuickCreate";
import CalendarsDialog from "../calendar/CalendarsDialog";
import { anchorOf, type Anchor } from "../calendar/Popover";
import { useGcalConfig } from "../calendar/useGoogle";
import { fmtMin } from "../lib/timeblocks";
import { newId } from "../lib/api";
import "../calendar/calendar.css";
import { useAccess } from "../lib/access";
import { conflicts, nudge, prayerBands, useGuard, type Band } from "../lib/prayerGuard";
import { removeBlockSmart, REMOVE_MESSAGE } from "../lib/agendaSync";
import { MEETING_KIND, normalizeLink, type Meeting } from "../lib/meetings";
import { useMembers } from "../lib/members";
import { PaneResizer, usePaneWidth } from "../components/Pane";
import { useJsonSetting } from "../lib/useSetting";
import { calendarSize, CALENDAR_SIZE } from "../calendar/preferences";
import { LayoutCheck, LayoutMenu } from "../components/LayoutMenu";

const LAYER_ICON: Record<Layer, typeof Bell> = { blok: CalendarClock, rapat: Handshake, kuliah: GraduationCap, tugas: Circle, pengingat: Bell, milestone: Diamond, sholat: Moon, proyek: FolderKanban, tercatat: Timer, luar: Globe };

const VIEWS: { id: CalView; label: string; key: string }[] = [
  { id: "hari", label: "Hari", key: "d" },
  { id: "minggu", label: "Minggu", key: "w" },
  { id: "bulan", label: "Bulan", key: "m" },
  { id: "agenda", label: "Agenda", key: "a" },
  { id: "tahun", label: "Tahun", key: "y" },
];

function stored<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

export default function Calendar({ go, embedded = false }: { go: (p: Page) => void; embedded?: boolean }) {
  const [size, saveSize] = useJsonSetting("calendar_size", CALENDAR_SIZE);
  const dimensions = calendarSize(size);
  const toast = useToast();
  const [prefs, savePrefs] = useJsonSetting("calendar_preferences", {
    view: stored<CalView>("ruangku-cal-view", "bulan"),
    layers: stored<Layer[]>("ruangku-cal-layers", LAYERS.filter(l => l.on).map(l => l.id)),
    hideDone: stored("ruangku-cal-hidedone", false), side: stored("ruangku-cal-side", true),
  });
  const view = VIEWS.some(v => v.id === prefs.view) ? prefs.view : "bulan";
  const setView = (next: CalView | ((v: CalView) => CalView)) => savePrefs(p => ({ ...p, view: typeof next === "function" ? next(p.view) : next }));
  const layers = useMemo(() => new Set<Layer>(prefs.layers), [prefs.layers]);
  const setLayers = (next: (cur: Set<Layer>) => Set<Layer>) => savePrefs(p => ({ ...p, layers: [...next(new Set(p.layers))] }));
  const hideDone = prefs.hideDone;
  const setHideDone = (hideDone: boolean) => savePrefs(p => ({ ...p, hideDone }));
  const calSide = prefs.side;
  const setCalSide = (side: boolean) => savePrefs(p => ({ ...p, side }));
  const [anchor, setAnchor] = useState(() => dateKey());
  const [pop, setPop] = useState<{ ev: CalEvent; at: Anchor } | null>(null);
  const [create, setCreate] = useState<{ slot: Slot; at: Anchor } | null>(null);
  const [manage, setManage] = useState(false);
  useOpenRequest("calendars", () => setManage(true));
  const [sideW, setSideW, resetSideW] = usePaneWidth("cal-side", 236, 190, 420);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);

  useOpenRequest("date", (d) => {
    setAnchor(d);
    setView((v) => (v === "tahun" || v === "agenda" ? "hari" : v));
  });

  const scope = useScope();
  const blocks = useRecords<TimeBlock>("timeblock");
  const meetingsRec = useRecords<Meeting>(MEETING_KIND);
  const members = useMembers();
  const reminders = useRecords<Reminder>("reminder");
  const tk = useTasks();
  const ib = useIbadah();
  const ext = useExternalCalendars();
  const guard = useGuard();
  const gcal = useGcalConfig();
  const today = dateKey(now);

  const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
  const data = useMemo(
    () => ({ blocks: blocks.items, tasks: tk.tasks, reminders: reminders.items, projects: tk.projects, external: ext.external, prayerTimes: ib.config.setup ? ib.times : undefined }),
    [blocks.items, tk.tasks, reminders.items, tk.projects, ext.external, ib.config.setup, ib.times],
  );
  const opt = useMemo(() => ({ layers, match: scope.match, hideDone }), [layers, scope.match, hideDone]);
  const access = useAccess();
  // Proyek tempat saya hanya pembaca: acara tidak bisa digeser.
  const events = useMemo(() => eventsInRange(data, range.from, range.to, opt).map((e) => (e.movable && access.readOnly(e.projectId) ? { ...e, movable: false, resizable: false } : e)), [data, range, opt, access]);
  // Libur selalu dihitung (walau lapisan luar dimatikan) supaya tanggal merah tetap tampil.
  const holidays = useMemo(() => holidaysIn(eventsInRange({ ...data, blocks: [], tasks: [], reminders: [] }, range.from, range.to, { layers: new Set(["luar"]), match: () => true })), [data, range]);
  // Titik penanda di bulan kecil.
  const miniRange = useMemo(() => viewRange("bulan", anchor), [anchor]);
  const marks = useMemo(() => new Set(eventsInRange(data, miniRange.from, miniRange.to, { ...opt, layers: new Set<Layer>(["blok", "rapat", "kuliah", "tugas", "pengingat", "milestone"]) }).map((e) => e.date)), [data, miniRange, opt]);

  const hijriDay = useCallback(
    (d: string) => {
      const [y, m, day] = d.split("-").map(Number);
      const [, hm, hd] = hijri(y, m, day, ib.config.hijriOffset ?? 0);
      return { day: hd, month: HIJRI_MONTHS[hm - 1] };
    },
    [ib.config.hijriOffset],
  );

  const bandsOf = useCallback(
    (d: string): Band[] => {
      if (!guard.cfg.enabled || !ib.config.setup) return [];
      const t = ib.times(d);
      return t ? prayerBands(t, parseDateKey(d).getDay(), guard.cfg) : [];
    },
    [guard.cfg, ib],
  );

  /** Setelah blok disimpan: bila menimpa waktu sholat, tawarkan menggesernya. */
  const checkPrayer = (blockId: string, title: string, date: string, start: number, end: number): boolean => {
    const hit = conflicts({ start, end }, bandsOf(date));
    if (!hit.length) return false;
    const to = nudge({ start, end }, bandsOf(date));
    toast(`"${title}" menimpa waktu ${hit.map((h) => h.name).join(" & ")}`, "error", to ? { label: `Geser ke ${fmtMin(to.start)}`, run: () => { const b = blocks.items.find((x) => x.id === blockId); if (b) blocks.save({ ...strip(b), ...to }, b.id); } } : undefined);
    return true;
  };

  // ---------- Mengubah sumber ----------
  const blockOf = (ev: CalEvent) => blocks.items.find((b) => b.id === ev.ref.id);
  const taskOf = (ev: CalEvent) => tk.tasks.find((t) => t.id === ev.ref.id);
  const reminderOf = (ev: CalEvent) => reminders.items.find((r) => r.id === ev.ref.id);
  const projectOfEv = (ev: CalEvent) => tk.rawProjects.items.find((p) => p.id === ev.ref.id);

  const move = async (ev: CalEvent, date: string, start?: number | null) => {
    if (!ev.movable) return;
    if (ev.ref.kind === "timeblock") {
      const b = blockOf(ev);
      if (b) {
        const next = moveBlock(b, date, start ?? undefined);
        await blocks.save({ ...strip(b), ...next }, b.id);
        if (start !== undefined && start !== null && checkPrayer(b.id, b.title, next.date, next.start, next.end)) return;
      }
    } else if (ev.ref.kind === "task") {
      const t = taskOf(ev);
      if (t) await tk.update(t.id, moveTask(t, ev.date, date, start));
    } else if (ev.ref.kind === "reminder") {
      const r = reminderOf(ev);
      if (r) await reminders.save({ ...strip(r), dueAt: moveReminder(r.dueAt, date, start ?? undefined), firedFor: undefined }, r.id);
    } else if (ev.ref.kind === "milestone") {
      const p = projectOfEv(ev);
      if (p) await tk.saveProject({ ...strip(p), milestones: (p.milestones ?? []).map((m) => (m.id === ev.ref.extra ? { ...m, date } : m)) }, p.id);
    }
    toast(`"${ev.title}" dipindah ke ${parseDateKey(date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short" })}${typeof start === "number" ? ` ${fmtMin(start)}` : ""}`);
  };

  const resize = async (ev: CalEvent, end: number) => {
    if (ev.ref.kind === "timeblock") {
      const b = blockOf(ev);
      if (b) {
        await blocks.save({ ...strip(b), end }, b.id);
        checkPrayer(b.id, b.title, b.date, b.start, end);
      }
    } else if (ev.ref.kind === "task") {
      const t = taskOf(ev);
      if (t && t.dueTime !== undefined) await tk.update(t.id, { estimate: Math.max(15, end - t.dueTime) });
    }
  };

  const ops: EventOps = {
    toggleDone: async (ev) => {
      if (ev.ref.kind === "timeblock" && ev.meetingId) {
        const m = meetingsRec.items.find((x) => x.id === ev.meetingId);
        if (m) await meetingsRec.save({ ...strip(m), status: m.status === "selesai" ? "terjadwal" : "selesai" }, m.id);
      } else if (ev.ref.kind === "timeblock") {
        const b = blockOf(ev);
        if (b) await blocks.save({ ...strip(b), done: !b.done }, b.id);
      } else if (ev.ref.kind === "task") {
        const t = taskOf(ev);
        if (t) {
          const p = projectOf(tk.projects, t.projectId);
          await tk.update(t.id, { status: ev.done ? firstOpenStatus(p) : firstDoneStatus(p) });
        }
      } else if (ev.ref.kind === "reminder") {
        const r = reminderOf(ev);
        if (r) await reminders.save({ ...strip(r), done: !r.done, doneAt: r.done ? undefined : Date.now() }, r.id);
      } else if (ev.ref.kind === "milestone") {
        const p = projectOfEv(ev);
        if (p) await tk.saveProject({ ...strip(p), milestones: (p.milestones ?? []).map((m) => (m.id === ev.ref.extra ? { ...m, done: !m.done } : m)) }, p.id);
      }
    },
    remove: async (ev) => {
      if (ev.ref.kind !== "timeblock") return;
      const b = blockOf(ev);
      if (!b) return;
      const r = await removeBlockSmart(b);
      toast(REMOVE_MESSAGE[r.kind](b.title), "info", { label: "Batalkan", run: () => void r.undo() });
    },
    setAttendance: async (ev, a) => {
      const b = blockOf(ev);
      if (b) await blocks.save({ ...strip(b), attendance: a }, b.id);
    },
    rename: async (ev, title) => {
      if (ev.ref.kind === "timeblock") {
        const b = blockOf(ev);
        if (b) await blocks.save({ ...strip(b), title }, b.id);
      } else if (ev.ref.kind === "task") await tk.update(ev.ref.id, { title });
      else if (ev.ref.kind === "milestone") {
        const p = projectOfEv(ev);
        if (p) await tk.saveProject({ ...strip(p), milestones: (p.milestones ?? []).map((m) => (m.id === ev.ref.extra ? { ...m, title } : m)) }, p.id);
      }
    },
    retime: async (ev, date, start, end) => {
      const b = blockOf(ev);
      if (b) await blocks.save({ ...strip(b), date, start, end }, b.id);
    },
    openSource: (ev) => {
      if (ev.ref.kind === "task") {
        requestOpen("task", ev.ref.id);
        go("tasks");
      } else if (ev.ref.kind === "timeblock" && ev.meetingId) {
        requestOpen("meeting", ev.meetingId);
        go("meetings");
      } else if (ev.ref.kind === "timeblock" && ev.courseId) {
        requestOpen("course", ev.courseId);
        go("courses");
      } else if (ev.ref.kind === "timeblock") go("schedule");
      else if (ev.ref.kind === "reminder") go("today");
      else if (ev.ref.kind === "prayer") go("ibadah");
      else if (ev.ref.kind === "milestone" || ev.ref.kind === "project") {
        scope.setScope(ev.ref.id);
        go("projects");
      }
    },
    copyToBlock: async (ev) => {
      const start = ev.start ?? 9 * 60;
      const end = ev.end && ev.end > start ? ev.end : start + 60;
      await blocks.save({ date: ev.date, start, end, title: ev.title, color: "nila", projectId: scope.defaultProjectId }, newId());
      toast(`Blok "${ev.title}" dibuat`);
    },
    description: (ev) => {
      if (ev.ref.kind === "external") return ext.external.find((c) => c.id === ev.ref.extra)?.events.find((e) => e.uid === ev.ref.id)?.description;
      if (ev.ref.kind === "task") return taskOf(ev)?.description;
      if (ev.ref.kind === "timeblock") return blockOf(ev)?.note;
      if (ev.ref.kind === "reminder") return reminderOf(ev)?.notes;
      return undefined;
    },
  };

  const saveNew = async (n: NewItem) => {
    const pid = n.projectId;
    if (n.kind === "blok") {
      const color = pid ? projectOf(tk.projects, pid).color : "nila";
      const id = newId();
      await blocks.save({ date: n.date, start: n.start!, end: n.end!, title: n.title, color, projectId: pid }, id);
      if (checkPrayer(id, n.title, n.date, n.start!, n.end!)) return;
    } else if (n.kind === "rapat") {
      const isLink = !!n.where && /^(https?:\/\/|www\.|[\w-]+\.(zoom\.us|google\.com|microsoft\.com))/i.test(n.where);
      const id = newId();
      const me = members.find((m) => m.isMe);
      await meetingsRec.save({ title: n.title, date: n.date, start: n.start!, end: n.end!, projectId: pid, location: isLink ? undefined : n.where, link: isLink ? normalizeLink(n.where) : undefined, attendees: me ? [me.id] : [], agenda: [], actions: [], status: "terjadwal", createdAt: Date.now() }, id);
      toast(`Rapat "${n.title}" dibuat`, "info", { label: "Atur peserta & agenda", run: () => (requestOpen("meeting", id), go("meetings")) });
      return;
    } else if (n.kind === "tugas") {
      await tk.create({ title: n.title, projectId: pid ?? "inbox", due: n.date, dueTime: n.start, estimate: n.start !== undefined && n.end !== undefined && n.end > n.start ? n.end - n.start : undefined });
    } else {
      const d = parseDateKey(n.date);
      d.setHours(Math.floor(n.start! / 60), n.start! % 60, 0, 0);
      await reminders.save({ title: n.title, dueAt: d.getTime(), repeat: "none", done: false, priority: "sedang", projectId: pid }, newId());
    }
    toast(`${n.kind === "blok" ? "Blok" : n.kind === "tugas" ? "Tugas" : "Pengingat"} "${n.title}" dibuat`);
  };

  const pickDay = (d: string, v: CalView = "hari") => {
    setAnchor(d);
    setView(v);
  };

  const ctx: CalCtx = {
    today,
    holidays,
    hijriDay,
    selected: pop?.ev.key,
    move,
    resize,
    open: (ev, at) => setPop({ ev, at }),
    create: (slot, at) => setCreate({ slot, at }),
    pickDay,
    bands: bandsOf,
  };

  // Pintasan keyboard (bila tidak sedang mengetik).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.ctrlKey || e.metaKey || e.altKey || /input|textarea|select|button/i.test(t.tagName) || t.isContentEditable || pop || create || manage) return;
      const k = e.key.toLowerCase();
      if (k === "t") setAnchor(dateKey());
      else if (k === "arrowleft" || k === "j") setAnchor((a) => shiftAnchor(view, a, -1));
      else if (k === "arrowright" || k === "k") setAnchor((a) => shiftAnchor(view, a, 1));
      else if (k === "n") setCreate({ slot: { date: anchor, start: view === "hari" || view === "minggu" ? 9 * 60 : undefined, end: view === "hari" || view === "minggu" ? 10 * 60 : undefined }, at: { x: window.innerWidth / 2 - 160, y: 140 } });
      else {
        const v = VIEWS.find((x) => x.key === k);
        if (!v) return;
        setView(v.id);
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, anchor, pop, create, manage]);

  const exportItems = (days: number) => {
    const from = dateKey();
    const to = dateKey(addDays(new Date(), days));
    return eventsInRange(data, from, to, { layers: new Set<Layer>(["blok", "rapat", "kuliah", "tugas", "milestone"]), match: scope.match, hideDone: true }).filter((e) => !e.cancelled).map((e) => ({ uid: e.key.replace(/[^\w:-]/g, ""), title: e.title, date: e.date, start: e.start, end: e.end, description: [e.link, e.layer === "luar" ? e.sub : undefined].filter(Boolean).join("\n") || undefined, location: e.location }));
  };

  const a = parseDateKey(anchor);
  const hj = hijriLabel(anchor, ib.config.hijriOffset ?? 0);
  const toggleLayer = (l: Layer) => setLayers((s) => (s.has(l) ? new Set([...s].filter((x) => x !== l)) : new Set([...s, l])));
  const extSubs = ext.subs.items;
  const upcomingHol = useMemo(() => {
    const evs = eventsInRange({ ...data, blocks: [], tasks: [], reminders: [] }, today, dateKey(addDays(parseDateKey(today), 120)), { layers: new Set<Layer>(["luar"]), match: () => true }).filter((e) => e.holiday);
    // Satu baris per hari raya: utamakan tanggal liburnya, bukan cuti bersamanya.
    const pick = new Map<string, CalEvent>();
    for (const e of evs.sort((x, y) => x.date.localeCompare(y.date))) {
      const base = e.title.replace(/^Cuti bersama: /, "");
      const cur = pick.get(base);
      if (!cur || (cur.title.startsWith("Cuti bersama") && !e.title.startsWith("Cuti bersama"))) pick.set(base, e);
    }
    return [...pick.values()].sort((x, y) => x.date.localeCompare(y.date)).slice(0, 4);
  }, [data, today]);

  return (
    <Ctx.Provider value={ctx}>
      <div className={`page page-cal ${embedded ? "cal-embedded" : ""}`} style={{ "--cal-month-height": `${dimensions.monthHeight}px`, "--cal-height": `${dimensions.height}px` } as React.CSSProperties}>
        <header className="cal-bar">
          <h1 className="cal-h1">Kalender</h1>
          <button className="btn btn-sm" onClick={() => setAnchor(dateKey())} title="Hari ini (T)">
            Hari ini
          </button>
          <div className="cal-nav">
            <button className="icon-btn" onClick={() => setAnchor(shiftAnchor(view, anchor, -1))} aria-label="Sebelumnya (←)">
              <ChevronLeft size={18} />
            </button>
            <button className="icon-btn" onClick={() => setAnchor(shiftAnchor(view, anchor, 1))} aria-label="Berikutnya (→)">
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="cal-title">
            <b>{viewTitle(view, anchor)}</b>
            {(view === "hari" || view === "bulan") && <small>{view === "hari" ? hj : `${hijriDay(range.days[7]).month} – ${hijriDay(range.days[34]).month} ${hijri(a.getFullYear(), a.getMonth() + 1, 15, ib.config.hijriOffset ?? 0)[0]} H`}</small>}
          </div>
          <span className="spacer" />
          <LayoutMenu title="Atur tampilan kalender" compact>
            <label className="field">Tinggi kalender: {dimensions.height} px<input aria-label="Tinggi kalender" type="range" min="400" max="1000" step="20" value={dimensions.height} onChange={(e) => saveSize({ ...dimensions, height: Number(e.target.value) })} /></label>
            <label className="field">Tinggi minggu (bulan): {dimensions.monthHeight} px<input aria-label="Tinggi minggu pada kalender bulan" type="range" min="80" max="220" step="10" value={dimensions.monthHeight} onChange={(e) => saveSize({ ...dimensions, monthHeight: Number(e.target.value) })} /></label>
            <label className="field">Tinggi per jam: {dimensions.hourHeight} px<input aria-label="Tinggi per jam" type="range" min="32" max="100" step="2" value={dimensions.hourHeight} onChange={(e) => saveSize({ ...dimensions, hourHeight: Number(e.target.value) })} /></label>
            <button className="btn btn-sm" onClick={() => saveSize(CALENDAR_SIZE)}>Ukuran bawaan</button>
            <LayoutCheck label="Panel kiri (kalender mini, lapisan, libur)" checked={calSide} onChange={setCalSide} />
            <LayoutCheck label="Sembunyikan tugas selesai" checked={hideDone} onChange={setHideDone} />
            <span className="lay-opt-label">Lapisan</span>
            {LAYERS.map((l) => (
              <LayoutCheck key={l.id} label={l.label} checked={layers.has(l.id)} onChange={() => toggleLayer(l.id)} />
            ))}
          </LayoutMenu>
          <div className="seg" role="tablist" aria-label="Tampilan">
            {VIEWS.map((v) => (
              <button key={v.id} role="tab" aria-selected={view === v.id} className={view === v.id ? "active" : ""} onClick={() => setView(v.id)} title={`${v.label} (${v.key.toUpperCase()})`}>
                {v.label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm btn-primary" onClick={(e) => setCreate({ slot: { date: view === "bulan" || view === "tahun" ? (anchor >= today ? anchor : today) : anchor, start: 9 * 60, end: 10 * 60 }, at: anchorOf(e.currentTarget) })} title="Buat (N)">
            <Plus size={15} /> Buat
          </button>
        </header>

        <div className={`cal-body pane-host ${calSide ? "" : "side-off"}`} style={{ "--pane-l": `${sideW}px` } as React.CSSProperties}>
          {calSide && <PaneResizer value={sideW} onChange={setSideW} onReset={resetSideW} min={190} max={420} label="Lebar panel kalender" />}
          <aside className="cal-side" aria-label="Panel kalender">
            <MiniMonth anchor={anchor} onPick={(d) => setAnchor(d)} onShift={(dir) => setAnchor(shiftAnchor("bulan", anchor, dir))} marks={marks} />

            <section className="cal-sec">
              <h2>Ruangku</h2>
              {LAYERS.filter((l) => l.id !== "luar").map((l) => (
                <label key={l.id} className="cal-layer" title={l.hint}>
                  <input type="checkbox" checked={layers.has(l.id)} onChange={() => toggleLayer(l.id)} />
                  {(() => {
                    const I = LAYER_ICON[l.id];
                    return <I size={14} />;
                  })()}
                  {l.label}
                </label>
              ))}
              <label className="cal-layer" title="Arsir waktu sholat di tampilan hari/minggu dan peringatkan bila blok menimpanya">
                <input type="checkbox" checked={guard.cfg.enabled} onChange={(e) => guard.save({ enabled: e.target.checked })} />
                <ShieldCheck size={14} />
                Lindungi waktu sholat
              </label>
              <label className="cal-layer">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
                <EyeOff size={14} />
                Sembunyikan tugas selesai
              </label>
              {!ib.config.setup && layers.has("sholat") && (
                <button className="link small" onClick={() => go("ibadah")}>
                  Atur lokasi di Ibadah untuk waktu sholat
                </button>
              )}
            </section>

            <section className="cal-sec">
              <h2>
                Kalender luar
                <button className="icon-btn sm" onClick={() => setManage(true)} aria-label="Kelola kalender luar">
                  <CalendarCog size={15} />
                </button>
              </h2>
              <label className="cal-layer">
                <input type="checkbox" checked={layers.has("luar")} onChange={() => toggleLayer("luar")} />
                <Globe size={14} />
                Tampilkan semua
              </label>
              {extSubs.map((s) => (
                <label key={s.id} className={`cal-layer sub ${!layers.has("luar") ? "dim" : ""}`}>
                  <input type="checkbox" checked={s.enabled} onChange={(e) => ext.subs.save({ ...strip(s), enabled: e.target.checked }, s.id)} />
                  <i className={`cal-swatch cc-${s.color}`} />
                  <span className="cal-layer-name">{s.name}</span>
                  {ext.caches.get(s.id)?.error && <span className="cal-dot-err" title={ext.caches.get(s.id)!.error} />}
                </label>
              ))}
              <button className="link small" onClick={() => setManage(true)}>
                + Langganan ICS / Google Calendar
              </button>
              {gcal?.connected && (
                <p className="cal-gstat">
                  Google: {gcal.email}
                  {gcal.lastError ? <span className="cal-err"> · {gcal.lastError}</span> : null}
                </p>
              )}
              {ext.subs.items.some((s) => s.source === "ics") && (
                <button className="link small" onClick={() => ext.refreshAll()} disabled={ext.busy}>
                  <RefreshCw size={12} className={ext.busy ? "spin" : ""} /> Muat ulang langganan
                </button>
              )}
            </section>

            {upcomingHol.length > 0 && (
              <section className="cal-sec">
                <h2>Libur terdekat</h2>
                <ul className="cal-hols">
                  {upcomingHol.map((h) => (
                    <li key={h.key}>
                      <button onClick={() => pickDay(h.date, "bulan")}>
                        <b>{parseDateKey(h.date).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</b>
                        <span>{h.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>

          <section className="cal-main" aria-label={viewTitle(view, anchor)}>
            {view === "bulan" && <MonthView days={range.days} month={a.getMonth()} events={events} />}
            {(view === "minggu" || view === "hari") && (
              <div className={view === "hari" ? "cal-dayview" : "cal-weekview"}>
                <TimeGridView days={range.days} events={events} now={now} hourH={dimensions.hourHeight} />
                {view === "hari" && (
                  <aside className="cal-dayside">
                    <h3>{parseDateKey(anchor).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long" })}</h3>
                    <p className="muted small">{hj}</p>
                    {holidays.get(anchor) && <p className="cal-holname">{holidays.get(anchor)!.join(" · ")}</p>}
                    {ib.config.setup && ib.times(anchor) && (
                      <div className="cal-prayers">
                        {(["subuh", "dzuhur", "ashar", "maghrib", "isya"] as const).map((k) => (
                          <span key={k}>
                            <small>{k[0].toUpperCase() + k.slice(1)}</small>
                            {fmtMin(ib.times(anchor)![k])}
                          </span>
                        ))}
                      </div>
                    )}
                    <h4>Agenda</h4>
                    <DayList date={anchor} events={events} />
                  </aside>
                )}
              </div>
            )}
            {view === "agenda" && <AgendaView days={range.days} events={events} />}
            {view === "tahun" && <YearView year={a.getFullYear()} events={events} />}
          </section>
        </div>

        {pop && <EventPopover key={pop.ev.key} ev={pop.ev} at={pop.at} ops={ops} onClose={() => setPop(null)} />}
        {create && <QuickCreate slot={create.slot} at={create.at} projects={tk.projects} defaultProject={scope.defaultProjectId} onSave={saveNew} onClose={() => setCreate(null)} />}
        {manage && <CalendarsDialog subs={ext.subs} caches={ext.caches} onClose={() => setManage(false)} exportItems={exportItems} />}
      </div>
    </Ctx.Provider>
  );
}


