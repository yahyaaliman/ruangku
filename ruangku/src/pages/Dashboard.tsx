import { ReactNode, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff, Plus, Settings2 } from "lucide-react";
import { ClassesPanel, MeetingsPanel, MoneyPanel, PANEL_LABEL, ProjectsPanel, TasksPanel, TimePanel, useDashLayout } from "./DashPanels";
import { useModules } from "../lib/modules";
import type { Page } from "../App";
import type { Item, KeyResult, Kpi, KpiEntry, Note, Objective, Reminder } from "../lib/types";
import { useRecords } from "../lib/useRecords";
import { dateKey, dayLong, greeting, quarterElapsed, quarterLabel, quarterOf, relativeAgo, startOfDay, time } from "../lib/date";
import { entriesByDate, formatNumber, kpiMet, objectiveProgress, okrHealth } from "../lib/metrics";
import { Progress } from "../components/ui";
import { ReminderRow, useNow } from "./Schedule";
import { completeReminder, ReminderForm } from "./reminderActions";
import { entryId } from "./Kpi";
import { nextPrayer, useIbadah } from "../lib/useIbadah";
import { dayScore, PRAYERS, STATUS } from "../lib/ibadah";
import { fmtMin } from "../lib/timeblocks";
import { hijriLabel } from "../lib/prayer";
import { useScope } from "../lib/scope";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

const DAY_START = 6;
const DAY_END = 22;

function DayRuler({ items, now }: { items: Item<Reminder>[]; now: number }) {
  const d0 = startOfDay(now);
  const pos = (ms: number) => {
    const h = (ms - d0) / 3600000;
    return ((Math.min(DAY_END, Math.max(DAY_START, h)) - DAY_START) / (DAY_END - DAY_START)) * 100;
  };
  const hours = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
  // Label yang berdekatan diletakkan selang-seling di dua baris supaya tidak bertumpuk.
  const sorted = [...items].sort((a, b) => a.dueAt - b.dueAt);
  const lastInRow = [-Infinity, -Infinity];
  const rows = sorted.map((r) => {
    const p = pos(r.dueAt);
    const row = p - lastInRow[0] >= 14 ? 0 : p - lastInRow[1] >= 14 ? 1 : lastInRow[0] <= lastInRow[1] ? 0 : 1;
    lastInRow[row] = p;
    return { r, p, row };
  });
  // Lebar label dibatasi oleh jarak ke tanda berikutnya di baris yang sama
  // (trek kira-kira 75% lebar jendela).
  const placed = rows.map((x, i) => {
    // Garis tanda baris atas melewati label baris bawah, jadi label baris bawah
    // dibatasi tanda berikutnya di baris mana pun.
    const next = rows.slice(i + 1).find((y) => x.row === 0 || y.row === x.row);
    const gap = (next ? next.p : 100 + 10) - x.p;
    return { r: x.r, row: x.row, room: Math.max(5, Math.floor(gap * 0.75 - 1.5)) };
  });
  return (
    <div className="ruler" aria-label="Garis waktu hari ini">
      <div className="ruler-track">
        <div className="ruler-past" style={{ width: `${pos(now)}%` }} />
        {placed.map(({ r, row, room }) => (
          <div
            key={r.id}
            className={`ruler-mark rem-p-${r.priority ?? "sedang"} ${r.done ? "done" : ""} ${row ? "row2" : ""}`}
            style={{ left: `${pos(r.dueAt)}%` }}
            title={`${time(r.dueAt)} ${r.title}`}
          >
            <span className="ruler-label" style={{ maxWidth: `min(170px, ${room}vw)` }}>{r.title}</span>
          </div>
        ))}
        <div className="ruler-now" style={{ left: `${pos(now)}%` }}>
          <span>{time(now)}</span>
        </div>
      </div>
      <div className="ruler-hours" aria-hidden="true">
        {hours.map((h) => (
          <span key={h} style={{ left: `${((h - DAY_START) / (DAY_END - DAY_START)) * 100}%` }}>{h % 3 === 0 ? String(h).padStart(2, "0") : ""}</span>
        ))}
      </div>
    </div>
  );
}

const NO_SECTIONS: SectionDef[] = [];

export default function Dashboard({ go }: { go: (p: Page) => void }) {
  const now = useNow();
  const reminders = useRecords<Reminder>("reminder");
  const kpis = useRecords<Kpi>("kpi");
  const entries = useRecords<KpiEntry>("kpientry");
  const objectives = useRecords<Objective>("objective");
  const krs = useRecords<KeyResult>("keyresult");
  const notes = useRecords<Note>("note");
  const [adding, setAdding] = useState(false);
  const ib = useIbadah();
  const [editing, setEditing] = useState(false);
  const dl = usePageLayout("hari-ini", NO_SECTIONS);
  const modules = useModules();
  const PANEL_MODULE: Record<string, Parameters<typeof modules.isOn>[0]> = { meetings: "meetings", classes: "courses", money: "ledger", ibadah: "ibadah", kpi: "kpi", okr: "okr", notes: "notes" };
  const modOn = (id: string) => !PANEL_MODULE[id] || modules.isOn(PANEL_MODULE[id]);
  const { layout, saveLayout } = useDashLayout();
  const moveP = (id: string, d: -1 | 1) => {
    const i = layout.findIndex((x) => x.id === id);
    const j = i + d;
    if (j < 0 || j >= layout.length) return;
    const c = layout.slice();
    [c[i], c[j]] = [c[j], c[i]];
    saveLayout(c);
  };

  const today = dateKey(now);
  const scope = useScope();
  const endToday = startOfDay(now) + 86400000;
  const rems = reminders.items.filter((r) => scope.match(r.projectId));
  const agenda = useMemo(
    () => rems.filter((r) => !r.done && r.dueAt < endToday).sort((a, b) => a.dueAt - b.dueAt),
    [rems, endToday],
  );
  const todayAll = rems.filter((r) => r.dueAt >= startOfDay(now) && r.dueAt < endToday);
  const next = agenda.find((r) => r.dueAt >= now);
  const overdue = agenda.filter((r) => r.dueAt < startOfDay(now)).length;

  const activeKpis = kpis.items.filter((k) => !k.archived && scope.match(k.projectId)).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const kpiToday = activeKpis.map((k) => ({ k, v: entriesByDate(entries.items, k.id).get(today) }));
  const filled = kpiToday.filter((x) => x.v !== undefined);

  const period = quarterOf(new Date(now));
  const elapsed = quarterElapsed(period, new Date(now));
  const objs = objectives.items.filter((o) => o.period === period && !o.archived && scope.match(o.projectId));
  const recentNotes = notes.items.filter((n) => !n.isTemplate && scope.match(n.projectId)).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updatedAt - a.updatedAt).slice(0, 4);

  const summary = [
    agenda.length === 0 ? "Tidak ada agenda tersisa hari ini" : `${agenda.length} agenda tersisa`,
    next ? `berikutnya ${time(next.dueAt)} ${next.title}` : null,
    overdue ? `${overdue} terlewat dari hari sebelumnya` : null,
  ].filter(Boolean).join(", ");

  const panels: Record<string, ReactNode> = {
    agenda: (
        <section className="panel">
          <header className="panel-head">
            <h2>Agenda</h2>
            <button className="chip-btn" onClick={() => setAdding(true)}><Plus size={13} /> Reminder</button>
          </header>
          {agenda.length === 0 ? (
            <p className="muted small">Semua beres. Tambahkan reminder bila ada yang perlu diingat.</p>
          ) : (
            <ul className="rem-list">
              {agenda.slice(0, 8).map((r) => (
                <ReminderRow key={r.id} r={r} now={now} compact onDone={() => reminders.save(completeReminder(r), r.id)} />
              ))}
            </ul>
          )}
          <button className="link" onClick={() => go("schedule")}>Lihat semua jadwal</button>
        </section>
    ),
    ibadah: (
        <section className="panel">
          <header className="panel-head">
            <h2>Ibadah</h2>
            {ib.config.setup && <span className="muted small">{(() => { const sc = dayScore(ib.config, ib.logFor(today), today).total; return sc === null ? "" : `${Math.round(sc * 100)}% hari ini`; })()}</span>}
          </header>
          {!ib.config.setup ? (
            <p className="muted small">Pilih kota untuk jadwal sholat, reminder, dan catatan ibadah harian.</p>
          ) : (
            (() => {
              const t = ib.times(today)!;
              const nm = new Date(now).getHours() * 60 + new Date(now).getMinutes();
              const nx = nextPrayer(t, nm);
              const log = ib.logFor(today);
              return (
                <>
                  <p className="dash-next">{nx ? <><b>{nx.label}</b> pukul {fmtMin(nx.at)}, {nx.inMin >= 60 ? `${Math.floor(nx.inMin / 60)} jam ${nx.inMin % 60} menit lagi` : `${nx.inMin} menit lagi`}</> : <>Imsak besok sekitar {fmtMin(t.imsak)}</>}</p>
                  <ul className="dash-prayers">
                    {PRAYERS.map((p) => {
                      const st = log?.prayers[p.id];
                      return (
                        <li key={p.id} className={st ? `lv-${STATUS.find((x) => x.id === st)!.level}` : t[p.id] > nm ? "future" : "missing"} title={st ? STATUS.find((x) => x.id === st)!.label : "Belum dicatat"}>
                          <span>{p.label}</span>
                          <b>{fmtMin(t[p.id])}</b>
                        </li>
                      );
                    })}
                  </ul>
                </>
              );
            })()
          )}
          <button className="link" onClick={() => go("ibadah")}>{ib.config.setup ? "Catat ibadah" : "Atur jadwal sholat"}</button>
        </section>
    ),
    kpi: (
        <section className="panel">
          <header className="panel-head">
            <h2>KPI hari ini</h2>
            <span className="muted small">{activeKpis.length ? `${filled.length}/${activeKpis.length} terisi` : ""}</span>
          </header>
          {activeKpis.length === 0 ? (
            <p className="muted small">Belum ada KPI. Tentukan angka harian yang ingin Anda jaga.</p>
          ) : (
            <ul className="mini-kpis">
              {kpiToday.map(({ k, v }) => (
                <li key={k.id}>
                  <span className="mini-kpi-name">{k.name}</span>
                  <input
                    className={`kpi-input ${v !== undefined ? (kpiMet(k, v) ? "met" : "miss") : ""}`}
                    inputMode="decimal"
                    placeholder={`${k.direction === "naik" ? "≥" : "≤"} ${formatNumber(k.target)}`}
                    defaultValue={v ?? ""}
                    key={`${k.id}-${v ?? ""}`}
                    aria-label={`Nilai ${k.name} hari ini`}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    onBlur={(e) => {
                      const t = e.target.value.trim().replace(",", ".");
                      const n = Number(t);
                      if (t !== "" && !Number.isNaN(n) && n !== v) entries.save({ kpiId: k.id, date: today, value: n }, entryId(k.id, today));
                    }}
                  />
                  <span className="muted small">{k.unit}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="link" onClick={() => go("kpi")}>Buka KPI harian</button>
        </section>
    ),
    okr: (
        <section className="panel">
          <header className="panel-head">
            <h2>OKR {quarterLabel(period)}</h2>
            <span className="muted small">{Math.round(elapsed * 100)}% waktu berjalan</span>
          </header>
          {objs.length === 0 ? (
            <p className="muted small">Belum ada objective kuartal ini.</p>
          ) : (
            <ul className="mini-okr">
              {objs.map((o) => {
                const p = objectiveProgress(krs.items.filter((k) => k.objectiveId === o.id));
                return (
                  <li key={o.id}>
                    <div className="mini-okr-top">
                      <span>{o.title}</span>
                      <b>{Math.round(p * 100)}%</b>
                    </div>
                    <Progress value={p} tone={okrHealth(p, elapsed)} />
                  </li>
                );
              })}
            </ul>
          )}
          <button className="link" onClick={() => go("okr")}>Buka OKR</button>
        </section>
    ),
    notes: (
        <section className="panel">
          <header className="panel-head">
            <h2>Catatan terbaru</h2>
          </header>
          {recentNotes.length === 0 ? (
            <p className="muted small">Belum ada catatan.</p>
          ) : (
            <ul className="mini-notes">
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <button onClick={() => go("notes")}>
                    <span>{n.title || "Tanpa judul"}</span>
                    <span className="muted small">{relativeAgo(n.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="link" onClick={() => go("notes")}>Buka catatan</button>
        </section>
    ),
    tasks: <TasksPanel go={go} />,
    meetings: <MeetingsPanel go={go} />,
    classes: <ClassesPanel go={go} />,
    money: <MoneyPanel go={go} />,
    time: <TimePanel />,
    projects: <ProjectsPanel go={go} />,
  };
  return (
    <div className="page dash">
      <header className="dash-head" hidden={!dl.opt("head", true)}>
        <p className="dash-greet">{greeting(new Date(now))}{ib.config.setup ? ` · ${hijriLabel(dateKey(now), ib.config.hijriOffset)}` : ""}</p>
        <h1 className="dash-date">{dayLong(now)}</h1>
        {scope.current && <p className="dash-scope">Fokus proyek: <b>{scope.current.icon ? `${scope.current.icon} ` : ""}{scope.current.name}</b> · <button className="link" onClick={() => scope.setScope("all")}>Tampilkan semua proyek</button></p>}
        {dl.opt("summary", true) && <p className="dash-summary">{summary}.</p>}
      </header>

      {dl.opt("ruler", true) && <DayRuler items={todayAll} now={now} />}

      <div className="dash-tools">
        <LayoutMenu layout={dl} title="Atur tampilan Hari ini" compact>
          <LayoutCheck label="Salam & tanggal" checked={dl.opt("head", true)} onChange={(v) => dl.setOpt("head", v)} />
          <LayoutCheck label="Kalimat ringkasan hari" checked={dl.opt("summary", true)} onChange={(v) => dl.setOpt("summary", v)} />
          <LayoutCheck label="Garis waktu hari ini" checked={dl.opt("ruler", true)} onChange={(v) => dl.setOpt("ruler", v)} />
          <LayoutSeg label="Kolom panel" value={String(dl.opt("cols", 2))} options={[["1", "1"], ["2", "2"], ["3", "3"]]} onChange={(v) => dl.setOpt("cols", Number(v))} />
          <span className="lay-opt-label">Panel</span>
          {layout.filter((x) => modOn(x.id)).map((x) => (
            <LayoutCheck key={x.id} label={PANEL_LABEL[x.id]} checked={x.on} onChange={(v) => saveLayout(layout.map((y) => (y.id === x.id ? { ...y, on: v } : y)))} />
          ))}
          <button className="btn btn-sm" onClick={() => setEditing(true)}>
            <Settings2 size={13} /> Urutkan & atur lebar panel
          </button>
        </LayoutMenu>
        {editing ? (
          <button className="btn btn-primary btn-sm" onClick={() => setEditing(false)}>Selesai mengatur</button>
        ) : (
          <button className="chip-btn" onClick={() => setEditing(true)}><Settings2 size={13} /> Atur dasbor</button>
        )}
      </div>

      <div className={`dash-grid ${editing ? "editing" : ""}`} style={{ "--dash-cols": dl.opt("cols", 2) } as React.CSSProperties}>
        {layout.filter((x) => (editing || x.on) && modOn(x.id)).map((x, i, arr) => (
          <div key={x.id} className={`dash-cell ${x.wide ? "wide" : ""} ${x.on ? "" : "hidden-panel"}`}>
            {editing && (
              <div className="dash-edit">
                <b>{PANEL_LABEL[x.id]}</b>
                <button className="icon-btn sm" disabled={i === 0} onClick={() => moveP(x.id, -1)} aria-label="Pindah ke atas"><ChevronUp size={14} /></button>
                <button className="icon-btn sm" disabled={i === arr.length - 1} onClick={() => moveP(x.id, 1)} aria-label="Pindah ke bawah"><ChevronDown size={14} /></button>
                <button className="chip-btn" onClick={() => saveLayout(layout.map((y) => (y.id === x.id ? { ...y, wide: !y.wide } : y)))}>{x.wide ? "Lebar penuh" : "Setengah"}</button>
                <button className="chip-btn" onClick={() => saveLayout(layout.map((y) => (y.id === x.id ? { ...y, on: !y.on } : y)))}>{x.on ? <><EyeOff size={13} /> Sembunyikan</> : <><Eye size={13} /> Tampilkan</>}</button>
              </div>
            )}
            {panels[x.id]}
          </div>
        ))}
      </div>

      {adding && (
        <ReminderForm
          categories={[...new Set(reminders.items.map((r) => r.category).filter(Boolean) as string[])]}
          onClose={() => setAdding(false)}
          onSave={(r) => reminders.save(r)}
        />
      )}
    </div>
  );
}
