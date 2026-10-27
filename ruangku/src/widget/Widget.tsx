import { CSSProperties, ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Coffee, EyeOff, Lock, LockOpen, Maximize2, Minimize2, Pin, Play, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import type { KeyResult, Kpi, KpiEntry, Note, Objective, WidgetConfig, WidgetPrefs, WidgetSection } from "../lib/types";
import { api, isDesktop, onEvent, ResizeDir, windowDrag, windowResize } from "../lib/api";
import { useRecords } from "../lib/useRecords";
import { dateKey, dayLong, dayShort, quarterElapsed, quarterOf, time } from "../lib/date";
import { entriesByDate, formatNumber, kpiMet, objectiveProgress, okrHealth } from "../lib/metrics";
import { accentHex, ACCENTS, MINI_SIZE, moveSection, PLACES, PRESETS, SECTION_LABEL, SIZE_PRESETS, toggleCollapsed, useWidgetPrefs } from "../lib/widgetPrefs";
import { ScopeProvider, useScope } from "../lib/scope";
import { MembersProvider } from "../lib/members";
import { flatTree } from "../lib/projects";
import { useTasks } from "../lib/useTasks";
import { firstDoneStatus, isTaskDone, priorityRank, projectOf } from "../lib/tasks";
import { strip } from "../lib/useRecords";
import { newId } from "../lib/api";
import { entryId } from "../pages/Kpi";
import { Calendar, DayView } from "./DayView";
import { IbadahWidget } from "./IbadahWidget";
import { hijriLabel } from "../lib/prayer";
import { nextPrayer, useIbadah } from "../lib/useIbadah";
import { fmtClock, useTimer } from "../lib/timer";
import { Square } from "lucide-react";
import { parseQuick } from "../lib/quickParse";
import { fmtMin } from "../lib/timeblocks";
import { breakAction, breakStatus, type BreakStatus } from "../breaks/BreakScreen";
import { AgendaToday, inText, useTodayEvents } from "./WidgetAgenda";
import { CollapseCtx, SecTitle } from "./SecTitle";
import { useWriteGuard } from "../lib/access";

function useClock(seconds: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), seconds ? 1000 : 10000);
    return () => window.clearInterval(t);
  }, [seconds]);
  return now;
}

// ---------- Bagian isi ----------

function KpiBlock({ now }: { now: number }) {
  const kpis = useRecords<Kpi>("kpi");
  const entries = useRecords<KpiEntry>("kpientry");
  const today = dateKey(now);
  const scope = useScope();
  const list = kpis.items.filter((k) => !k.archived && scope.match(k.projectId)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  if (list.length === 0) return null;
  const vals = list.map((k) => ({ k, v: entriesByDate(entries.items, k.id).get(today) }));
  const met = vals.filter((x) => x.v !== undefined && kpiMet(x.k, x.v)).length;
  return (
    <section className="w-sec">
      <SecTitle id="kpi" extra={`${met}/${list.length} tercapai`}>
        KPI
      </SecTitle>
      <ul className="w-kpis">
        {vals.map(({ k, v }) => (
          <li key={k.id}>
            <span className="w-kpi-name">{k.name}</span>
            <input
              key={`${k.id}-${v ?? ""}`}
              className={`w-kpi-input ${v === undefined ? "" : kpiMet(k, v) ? "met" : "miss"}`}
              defaultValue={v ?? ""}
              inputMode="decimal"
              placeholder={`${k.direction === "naik" ? "≥" : "≤"}${formatNumber(k.target)}`}
              aria-label={`Nilai ${k.name} hari ini`}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              onBlur={(e) => {
                const t = e.target.value.trim().replace(",", ".");
                const n = Number(t);
                if (t !== "" && !Number.isNaN(n) && n !== v) entries.save({ kpiId: k.id, date: today, value: n }, entryId(k.id, today));
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function OkrBlock({ now }: { now: number }) {
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const period = quarterOf(new Date(now));
  const elapsed = quarterElapsed(period, new Date(now));
  const scope = useScope();
  const list = objectives.items.filter((o) => o.period === period && !o.archived && scope.match(o.projectId));
  if (list.length === 0) return null;
  return (
    <section className="w-sec">
      <SecTitle id="okr" extra={`${Math.round(elapsed * 100)}% kuartal berjalan`}>
        OKR
      </SecTitle>
      <ul className="w-okr">
        {list.map((o) => {
          const p = objectiveProgress(krs.items.filter((k) => k.objectiveId === o.id));
          return (
            <li key={o.id}>
              <div className="w-okr-top">
                <span>{o.title}</span>
                <b>{Math.round(p * 100)}%</b>
              </div>
              <div className={`w-bar ${okrHealth(p, elapsed)}`}>
                <i style={{ width: `${Math.round(p * 100)}%` }} />
                <em style={{ left: `${elapsed * 100}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotesBlock() {
  const { items, save } = useRecords<Note>("note");
  const scope = useScope();
  const [text, setText] = useState("");
  const mine = items.filter((n) => !n.isTemplate && scope.match(n.projectId));
  const pinned = mine.filter((n) => n.pinned || n.sticky).slice(0, 5);
  const list = pinned.length ? pinned : [...mine].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
  const add = async () => {
    const t = text.trim();
    if (!t) return;
    const [first, ...rest] = t.split("\n");
    await save({ title: first.slice(0, 80), body: rest.join("\n") || first, tags: ["cepat"], date: dateKey(), projectId: scope.defaultProjectId, pinned: true }, newId());
    setText("");
  };
  return (
    <section className="w-sec">
      <SecTitle id="notes">{pinned.length ? "Catatan disematkan" : "Catatan terbaru"}</SecTitle>
      <form className="w-note-add w-nodrag" onSubmit={(e) => (e.preventDefault(), add())}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Catatan cepat… (Enter)" aria-label="Catatan cepat" />
      </form>
      {list.length > 0 && (
        <ul className="w-notes">
          {list.map((n) => (
            <li key={n.id}>
              <button onClick={async () => (await api.setSetting("open_note", `${n.id}:${Date.now()}`), api.openMain("notes"))}>{n.icon ? `${n.icon} ` : ""}{n.title || "Tanpa judul"}</button>
              <button
                className={`w-icon w-pin ${n.sticky ? "on" : ""}`}
                title={n.sticky ? "Sudah ditempel di desktop" : "Tempel di desktop sebagai sticky note"}
                aria-label={`Tempel ${n.title} di desktop`}
                onClick={async () => {
                  if (!n.sticky) await save({ ...strip(n), sticky: { color: "kunyit" } }, n.id);
                  await api.stickyOpen(n.id);
                }}
              >
                <Pin size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TasksBlock({ now }: { now: number }) {
  const t = useTasks();
  const scope = useScope();
  const timer = useTimer();
  const [text, setText] = useState("");
  const today = dateKey(now);
  const list = t.tasks
    .filter((x) => !x.parentId && !isTaskDone(x, t.projects) && x.due && x.due <= today && (scope.ids ? scope.match(x.projectId) : true))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueTime ?? 9999) - (b.dueTime ?? 9999));
  const add = async () => {
    const raw = text.trim();
    if (!raw) return;
    const p = parseQuick(raw, new Date(), t.projects.map((x) => x.name));
    const proj = p.project ? t.projects.find((x) => x.name.toLowerCase().startsWith(p.project!.toLowerCase())) : undefined;
    await t.create({ title: p.title || raw, projectId: proj?.id ?? scope.defaultProjectId ?? "inbox", due: p.due ?? today, dueTime: p.dueTime, tags: p.tags, priority: p.priority, estimate: p.estimate, recurrence: p.recurrence });
    setText("");
  };
  return (
    <section className="w-sec">
      <SecTitle id="tasks" extra={list.length || ""}>
        Tugas
      </SecTitle>
      {list.length === 0 ? (
        <p className="w-empty">Tidak ada tugas jatuh tempo.</p>
      ) : (
        <ul className="w-agenda w-nodrag">
          {list.slice(0, 7).map((x) => {
            const running = timer.active?.taskId === x.id;
            return (
              <li key={x.id} className={`w-rem w-task ${x.due! < today ? "late" : ""} ${x.priority === "urgent" || x.priority === "tinggi" ? "high" : ""}`}>
                <button className="w-check" onClick={() => t.update(x.id, { status: firstDoneStatus(projectOf(t.projects, x.projectId)) })} aria-label={`Selesaikan: ${x.title}`} />
                <span className="w-rem-time">{x.due! < today ? "Telat" : x.dueTime !== undefined ? fmtMin(x.dueTime) : "Hari ini"}</span>
                <span className="w-rem-title">
                  {projectOf(t.projects, x.projectId).icon ? `${projectOf(t.projects, x.projectId).icon} ` : ""}
                  {x.title}
                </span>
                <button className={`w-icon w-play ${running ? "on" : ""}`} onClick={() => (running ? timer.stop() : timer.start(x))} aria-label={running ? `Hentikan timer ${x.title}` : `Mulai timer ${x.title}`} title={running ? "Hentikan timer" : "Mulai timer"}>
                  {running ? <Square size={12} /> : <Play size={12} />}
                </button>
              </li>
            );
          })}
          {list.length > 7 && <li className="w-more">+{list.length - 7} lainnya</li>}
        </ul>
      )}
      <form className="w-note-add w-nodrag" onSubmit={(e) => (e.preventDefault(), add())}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Tugas baru… mis. kirim draf besok jam 9 !tinggi" aria-label="Tambah tugas" />
      </form>
    </section>
  );
}

/** Status timer & istirahat di bawah tab. */
function StatusStrip({ now }: { now: number }) {
  const timer = useTimer();
  const [brk, setBrk] = useState<BreakStatus | null>(null);
  useEffect(() => {
    if (!isDesktop) return;
    let alive = true;
    const load = () => breakStatus().then((b) => alive && setBrk(b)).catch(() => {});
    load();
    const t = window.setInterval(load, 30000);
    const stop = onEvent("break-state", load);
    return () => {
      alive = false;
      window.clearInterval(t);
      stop();
    };
  }, []);
  const onBreak = brk?.onBreakUntil && brk.onBreakUntil > now;
  if (!timer.active && !(brk?.enabled)) return null;
  return (
    <div className="w-status w-nodrag" role="status">
      {timer.active && (
        <div className="w-timer">
          <span>⏱ {timer.active.title}</span>
          <b>{fmtClock(timer.elapsed)}</b>
          <button className="w-icon" onClick={() => timer.stop()} aria-label="Hentikan timer" title="Hentikan dan catat waktu">
            <Square size={13} />
          </button>
        </div>
      )}
      {brk?.enabled && (
        <div className="w-break">
          <Coffee size={13} />
          <span>{onBreak ? `Istirahat · ${inText((brk.onBreakUntil! - now) / 60000)} lagi` : brk.nextBreakMin > 0 ? `Istirahat dalam ${inText(brk.nextBreakMin)}` : "Waktunya istirahat"}</span>
          {!onBreak && (
            <button className="w-link" onClick={() => breakAction("start")}>
              Sekarang
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Mode mini: jam, agenda berikutnya, sholat berikutnya, timer. */
function MiniView({ now, onExpand }: { now: number; onExpand: () => void }) {
  const a = useTodayEvents(now);
  const ib = useIbadah();
  const timer = useTimer();
  const t = ib.config.setup ? ib.times(dateKey(now)) : null;
  const np = t ? nextPrayer(t, a.nowMin) : null;
  const focus = a.current ?? a.upcoming[0];
  return (
    <div className="w-mini" onDoubleClick={onExpand} title="Klik dua kali untuk tampilan penuh">
      <div className="w-mini-top">
        <b className="w-mini-time">{time(now)}</b>
        <span className="w-mini-date">{dayShort(now)}</span>
      </div>
      {focus ? (
        <p className={`w-mini-ev c-${focus.color}`}>
          <i />
          <span>{a.current ? `Sekarang: ${focus.title}` : `${fmtMin(focus.start!)} ${focus.title}`}</span>
          <small>{a.current ? `sisa ${inText((focus.end ?? a.nowMin) - a.nowMin)}` : `${inText(focus.start! - a.nowMin)} lagi`}</small>
        </p>
      ) : (
        <p className="w-mini-ev muted">Tidak ada agenda tersisa hari ini</p>
      )}
      <p className="w-mini-sub">
        {timer.active ? (
          <>
            ⏱ <b>{fmtClock(timer.elapsed)}</b> {timer.active.title}
          </>
        ) : np ? (
          <>
            {np.label} {fmtMin(np.at)} · {inText(np.inMin)} lagi
          </>
        ) : null}
      </p>
    </div>
  );
}

function ScopeSelect() {
  const s = useScope();
  const tree = flatTree(s.projects);
  return (
    <select className="w-scope w-nodrag" value={s.scope} onChange={(e) => s.setScope(e.target.value)} aria-label="Proyek yang ditampilkan">
      <option value="all">Semua proyek</option>
      {tree.map(({ p, depth }) => (
        <option key={p.id} value={p.id}>{"\u00a0\u00a0".repeat(depth)}{p.icon ? `${p.icon} ` : ""}{p.name}</option>
      ))}
    </select>
  );
}

// ---------- Panel pengaturan ----------

function Slider({ label, value, min, max, step = 1, unit, onChange }: { label: string; value: number; min: number; max: number; step?: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="w-field">
      <span className="w-field-row">
        {label} <b>{value}{unit}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="w-seg" role="radiogroup">
      {options.map(([v, l]) => (
        <button key={v} role="radio" aria-checked={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="w-toggle">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SettingsPanel({
  prefs,
  update,
  config,
  setConfig,
  onClose,
}: {
  prefs: WidgetPrefs;
  update: (p: Partial<WidgetPrefs>) => void;
  config: WidgetConfig | null;
  setConfig: (c: WidgetConfig) => void;
  onClose: () => void;
}) {
  const [confirmClick, setConfirmClick] = useState(false);
  const effect = config?.effect ?? "none";
  return (
    <div className="w-panel" role="dialog" aria-label="Atur widget">
      <header className="w-panel-head">
        <h2>Atur widget</h2>
        <button className="w-icon" onClick={onClose} aria-label="Tutup pengaturan">
          <X size={16} />
        </button>
      </header>

      <div className="w-panel-body">
        <p className="w-group">Gaya cepat</p>
        <div className="w-presets">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              className="w-preset"
              onClick={() => {
                update(p.prefs);
                api.widgetSetEffect(p.effect).then(setConfig).catch(() => {});
              }}
            >
              <span className={`w-swatch sw-${p.prefs.tone}`} style={{ "--sw": (p.prefs.opacity ?? 0) / 100 } as CSSProperties} />
              {p.name}
            </button>
          ))}
        </div>

        <p className="w-group">Susunan & ukuran</p>
        <div className="w-field">
          <span className="w-field-row">Arah isi</span>
          <Seg value={prefs.orientation} options={[["vertikal", "Vertikal"], ["horizontal", "Horizontal"]]} onChange={(orientation) => update({ orientation })} />
          <small className="w-hint">Horizontal menjajarkan bagian ke samping dan grid jam ke kanan, cocok untuk widget lebar di atas/bawah layar.</small>
        </div>
        <div className="w-field">
          <span className="w-field-row">Ukuran jendela</span>
          <div className="w-sizes">
            {SIZE_PRESETS.map((sz) => (
              <button
                key={sz.id}
                className={`w-size ${config && config.width === sz.w && config.height === sz.h ? "on" : ""}`}
                onClick={() => {
                  update({ orientation: sz.orientation });
                  api.widgetSetSize(sz.w, sz.h).then(setConfig).catch(() => {});
                }}
                title={`${sz.w}×${sz.h}`}
              >
                <i className={sz.orientation === "horizontal" ? "wide" : "tall"} style={{ width: Math.round(sz.w / 50), height: Math.round(sz.h / 50) }} />
                {sz.label}
              </button>
            ))}
          </div>
          <small className="w-hint">Atau tarik tepi widget untuk ukuran bebas.</small>
        </div>
        <Slider label="Ukuran grid jam" value={prefs.gridSize} min={60} max={180} step={10} unit="%" onChange={(gridSize) => update({ gridSize })} />

        <p className="w-group">Tampilan</p>
        <div className="w-field">
          <span className="w-field-row">Warna</span>
          <Seg value={prefs.tone} options={[["gelap", "Gelap"], ["terang", "Terang"]]} onChange={(tone) => update({ tone })} />
        </div>
        <Slider label="Kepekatan latar" value={prefs.opacity} min={0} max={100} unit="%" onChange={(opacity) => update({ opacity })} />
        <Slider label="Ukuran teks" value={prefs.scale} min={70} max={150} step={5} unit="%" onChange={(scale) => update({ scale })} />
        <Slider label="Sudut membulat" value={prefs.radius} min={0} max={28} unit=" px" onChange={(radius) => update({ radius })} />
        <div className="w-field">
          <span className="w-field-row">Efek latar Windows</span>
          <Seg
            value={effect}
            options={[["none", "Tanpa"], ["blur", "Blur"], ["acrylic", "Acrylic"], ["mica", "Mica"]]}
            onChange={(e) => api.widgetSetEffect(e).then(setConfig).catch(() => {})}
          />
          <small className="w-hint">Acrylic dan Blur memburamkan desktop di belakang widget. Mica hanya di Windows 11.</small>
        </div>

        <div className="w-field">
          <span className="w-field-row">Warna aksen</span>
          <div className="w-accents" role="radiogroup" aria-label="Warna aksen">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                role="radio"
                aria-checked={prefs.accent === a.id}
                className={`w-accent ${prefs.accent === a.id ? "on" : ""}`}
                style={{ "--sw": prefs.tone === "gelap" ? a.dark : a.light } as CSSProperties}
                onClick={() => update({ accent: a.id })}
                title={a.label}
                aria-label={a.label}
              />
            ))}
          </div>
        </div>

        <p className="w-group">Isi</p>
        <Toggle label="Jam dan tanggal" checked={prefs.showClock} onChange={(showClock) => update({ showClock })} />
        {prefs.showClock && <Toggle label="Tampilkan detik" checked={prefs.showSeconds} onChange={(showSeconds) => update({ showSeconds })} />}
        <ul className="w-sections">
          {prefs.sections.map((s, i) => (
            <li key={s.id}>
              <label>
                <input type="checkbox" checked={s.on} onChange={(e) => update({ sections: prefs.sections.map((x) => (x.id === s.id ? { ...x, on: e.target.checked } : x)) })} />
                {SECTION_LABEL[s.id]}
              </label>
              <button className="w-icon" disabled={i === 0} onClick={() => update({ sections: moveSection(prefs.sections, s.id, -1) })} aria-label={`Naikkan ${SECTION_LABEL[s.id]}`}>
                <ChevronUp size={15} />
              </button>
              <button className="w-icon" disabled={i === prefs.sections.length - 1} onClick={() => update({ sections: moveSection(prefs.sections, s.id, 1) })} aria-label={`Turunkan ${SECTION_LABEL[s.id]}`}>
                <ChevronDown size={15} />
              </button>
            </li>
          ))}
        </ul>
        <Slider label="Jumlah agenda" value={prefs.agendaCount} min={1} max={12} unit="" onChange={(agendaCount) => update({ agendaCount })} />

        <p className="w-group">Posisi</p>
        <div className="w-field">
          <span className="w-field-row">Letak lapisan</span>
          <Seg
            value={config?.layer ?? "desktop"}
            options={[["desktop", "Di desktop"], ["normal", "Biasa"], ["top", "Selalu di atas"]]}
            onChange={(layer) => api.widgetSetLayer(layer).then(setConfig).catch(() => {})}
          />
          <small className="w-hint">"Di desktop" menaruh widget di bawah semua jendela, seperti bagian dari wallpaper.</small>
        </div>
        <Toggle label="Kunci posisi dan ukuran" hint="Mencegah widget tergeser tidak sengaja" checked={prefs.locked} onChange={(locked) => update({ locked })} />
        <Toggle
          label="Klik tembus"
          hint="Klik diteruskan ke desktop di belakang widget"
          checked={!!config?.clickThrough}
          onChange={(v) => (v ? setConfirmClick(true) : api.widgetSetClickThrough(false).then(setConfig))}
        />
        {confirmClick && (
          <div className="w-warn">
            <p>Setelah ini widget tidak bisa diklik. Untuk mengubahnya lagi, klik kanan ikon Ruangku di tray lalu pilih <b>Buka kunci widget</b>.</p>
            <div className="w-btns">
              <button className="w-btn" onClick={() => setConfirmClick(false)}>Batal</button>
              <button
                className="w-btn primary"
                onClick={() => {
                  setConfirmClick(false);
                  onClose();
                  api.widgetSetClickThrough(true).then(setConfig);
                }}
              >
                Aktifkan klik tembus
              </button>
            </div>
          </div>
        )}
        <div className="w-field">
          <span className="w-field-row">Letakkan di</span>
          <div className="w-places">
            {PLACES.map((pl) => (
              <button key={pl.id} className={`w-place p-${pl.id}`} onClick={() => api.widgetSnap(pl.id).then(setConfig).catch(() => {})} title={pl.label} aria-label={pl.label}>
                <i />
              </button>
            ))}
          </div>
          <small className="w-hint">Menempel ke pojok atau sisi layar tempat widget berada, di luar taskbar.</small>
        </div>
        <div className="w-btns">
          <button className="w-btn" onClick={() => api.widgetResetPosition().then(setConfig)}>
            <RotateCcw size={14} /> Kembalikan posisi
          </button>
        </div>
      </div>
      <footer className="w-panel-foot">
        <button className="w-btn primary" onClick={onClose}>Selesai</button>
      </footer>
    </div>
  );
}

// ---------- Widget ----------

const EDGES: { dir: ResizeDir; cls: string }[] = [
  { dir: "East", cls: "e" },
  { dir: "West", cls: "w" },
  { dir: "South", cls: "s" },
  { dir: "SouthEast", cls: "se" },
  { dir: "SouthWest", cls: "sw" },
];

export default function Widget() {
  return (
    <ScopeProvider settingKey="widget_scope">
      <MembersProvider>
        <WidgetInner />
      </MembersProvider>
    </ScopeProvider>
  );
}

function WidgetInner() {
  const { prefs, update, config, setConfig } = useWidgetPrefs();
  const [panel, setPanel] = useState(false);
  const [denied, setDenied] = useState<string | null>(null);
  useWriteGuard(
    useCallback((msg: string) => {
      setDenied(msg);
      window.setTimeout(() => setDenied(null), 4000);
    }, []),
  );
  const now = useClock(prefs.showSeconds && prefs.showClock);
  const [view, setViewState] = useState<"today" | "calendar" | "day">(() => {
    try {
      const v = localStorage.getItem("ruangku-widget-view");
      return v === "calendar" || v === "day" ? v : "today";
    } catch {
      return "today";
    }
  });
  const [day, setDay] = useState(() => dateKey());
  const ibCfg = useIbadah().config;
  const setView = (v: "today" | "calendar" | "day") => {
    setViewState(v);
    try {
      localStorage.setItem("ruangku-widget-view", v);
    } catch {
      /* abaikan */
    }
  };
  const openDay = (d: string) => {
    setDay(d);
    setView("day");
  };

  useEffect(() => onEvent("widget-open-settings", () => setPanel(true)), []);

  const dark = prefs.tone === "gelap";
  const horizontal = prefs.orientation === "horizontal";
  const scroller = useRef<HTMLDivElement>(null);
  const toggle = useCallback((id: WidgetSection) => update({ collapsed: toggleCollapsed(prefs.collapsed, id) }), [update, prefs.collapsed]);

  // Mode mini mengecilkan jendela; keluar mengembalikan ukuran sebelumnya.
  const setMini = async (on: boolean) => {
    if (on) {
      const cfg = config ?? (await api.widgetConfig().catch(() => null));
      update({ mini: true, restore: cfg ? { w: cfg.width, h: cfg.height } : null });
      api.widgetSetSize(MINI_SIZE.w, MINI_SIZE.h).then(setConfig).catch(() => {});
    } else {
      const r = prefs.restore;
      update({ mini: false, restore: null });
      if (r) api.widgetSetSize(r.w, r.h).then(setConfig).catch(() => {});
    }
  };

  // Horizontal: roda tetikus menggeser ke samping bila bagian di bawah kursor tidak bisa digulir.
  useEffect(() => {
    const el = scroller.current;
    if (!el || !horizontal) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
      let n = e.target as HTMLElement | null;
      while (n && n !== el) {
        if (n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowY)) return;
        n = n.parentElement;
      }
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [horizontal, prefs.mini]);

  const style = {
    "--w-accent": accentHex(prefs.accent, dark),
    "--w-alpha": prefs.opacity / 100,
    "--w-radius": `${prefs.radius}px`,
    "--tg-hour": `${Math.round((horizontal ? 56 : 46) * (prefs.gridSize / 100))}px`,
    "--tg-lane": `${Math.round(110 * (prefs.gridSize / 100))}px`,
  } as CSSProperties;

  const startDrag = (e: React.MouseEvent) => {
    if (prefs.locked || e.button !== 0) return;
    const t = e.target as HTMLElement;
    if (t.closest("button, input, textarea, a, label, .w-agenda, .w-kpis, .w-notes, .w-nodrag")) return;
    windowDrag();
  };

  const sections: Record<WidgetSection, ReactNode> = {
    ibadah: <IbadahWidget now={now} onOpenDay={() => openDay(dateKey(now))} />,
    agenda: <AgendaToday now={now} count={prefs.agendaCount} title={<SecTitle id="agenda">Agenda</SecTitle>} />,
    tasks: <TasksBlock now={now} />,
    kpi: <KpiBlock now={now} />,
    okr: <OkrBlock now={now} />,
    notes: <NotesBlock />,
  };
  const shown = prefs.sections.filter((s) => s.on);
  const clock = prefs.showSeconds ? new Date(now).toLocaleTimeString("id-ID", { hour12: false }).replace(/\./g, ":") : time(now);

  return (
    <CollapseCtx.Provider value={{ collapsed: prefs.collapsed, toggle }}>
    <div
      className={`widget ${dark ? "w-dark" : "w-light"} ${prefs.opacity < 25 ? "w-thin" : ""} ${prefs.locked ? "w-locked" : ""} ${!isDesktop ? "w-preview" : ""} ${prefs.mini ? "w-is-mini" : horizontal ? "w-horizontal" : "w-vertical"}`}
      style={style}
      onMouseDown={startDrag}
    >
      <div className="w-tools">
        <button className="w-icon" onClick={() => update({ locked: !prefs.locked })} title={prefs.locked ? "Buka kunci posisi" : "Kunci posisi"} aria-label={prefs.locked ? "Buka kunci posisi" : "Kunci posisi"}>
          {prefs.locked ? <Lock size={15} /> : <LockOpen size={15} />}
        </button>
        <button className="w-icon" onClick={() => setMini(!prefs.mini)} title={prefs.mini ? "Tampilan penuh" : "Mode mini"} aria-label={prefs.mini ? "Tampilan penuh" : "Mode mini"}>
          {prefs.mini ? <Maximize2 size={15} /> : <Minimize2 size={15} />}
        </button>
        <button className="w-icon" onClick={() => setPanel(true)} title="Atur widget" aria-label="Atur widget">
          <SlidersHorizontal size={15} />
        </button>
        <button className="w-icon" onClick={() => api.openMain()} title="Buka Ruangku" aria-label="Buka Ruangku">
          <span className="w-brand" aria-hidden="true" />
        </button>
        <button className="w-icon" onClick={() => api.widgetSetVisible(false).then(setConfig)} title="Sembunyikan widget (tampilkan lagi dari tray)" aria-label="Sembunyikan widget">
          <EyeOff size={15} />
        </button>
      </div>

      {prefs.mini ? (
        <div className="w-scroll" style={{ zoom: prefs.scale / 100 }}>
          <MiniView now={now} onExpand={() => setMini(false)} />
        </div>
      ) : (
      <div className="w-scroll" ref={scroller} style={{ zoom: prefs.scale / 100 }}>
        <nav className="w-tabs" aria-label="Tampilan widget">
          <button className={view === "today" ? "on" : ""} aria-current={view === "today" ? "page" : undefined} onClick={() => setView("today")}>
            Hari ini
          </button>
          <button className={view !== "today" ? "on" : ""} aria-current={view !== "today" ? "page" : undefined} onClick={() => setView("calendar")}>
            Kalender
          </button>
          <ScopeSelect />
        </nav>

        <StatusStrip now={now} />

        {view === "today" && (
          <div className="w-flow">
            {prefs.showClock && (
              <header className="w-clock">
                <p className="w-time">{clock}</p>
                <button className="w-date" onClick={() => openDay(dateKey(now))} title="Lihat jadwal per jam hari ini">
                  {dayLong(now)}
                </button>
                {ibCfg.setup && <p className="w-hijri">{hijriLabel(dateKey(now), ibCfg.hijriOffset)}</p>}
              </header>
            )}
            {shown.map((s) => (
              <div key={s.id} className={`w-cell ${prefs.collapsed.includes(s.id) ? "collapsed" : ""}`}>
                {sections[s.id]}
              </div>
            ))}
            {!prefs.showClock && shown.length === 0 && <p className="w-empty">Widget kosong. Buka pengaturan untuk memilih isi.</p>}
          </div>
        )}
        {view === "calendar" && <Calendar selected={day} onPick={openDay} now={now} />}
        {view === "day" && <DayView date={day} setDate={setDay} now={now} orientation={horizontal ? "horizontal" : "vertical"} />}
      </div>
      )}

      {!prefs.locked &&
        EDGES.map((e) => (
          <div key={e.dir} className={`w-edge w-edge-${e.cls}`} onMouseDown={(ev) => (ev.stopPropagation(), windowResize(e.dir))} aria-hidden="true" />
        ))}

      {denied && (
        <p className="w-denied" role="alert">
          {denied}
        </p>
      )}
      {panel && <SettingsPanel prefs={prefs} update={update} config={config} setConfig={setConfig} onClose={() => setPanel(false)} />}
    </div>
    </CollapseCtx.Provider>
  );
}
