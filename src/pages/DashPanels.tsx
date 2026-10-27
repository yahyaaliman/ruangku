import { useEffect, useState } from "react";
import type { Page } from "../App";
import type { TimeBlock } from "../lib/types";
import { api, onEvent } from "../lib/api";
import { useRecords } from "../lib/useRecords";
import { useTasks } from "../lib/useTasks";
import { addDays, dateKey, parseDateKey } from "../lib/date";
import { firstDoneStatus, fmtDuration, isTaskDone, priorityRank, projectOf } from "../lib/tasks";
import { useScope } from "../lib/scope";
import { blockProject, childrenOf, subtreeProgress } from "../lib/projects";
import { ProjectMark } from "../projects/ProjectSwitcher";
import { PriorityFlag, TaskCheck, DueChip } from "../tasks/shared";
import { Progress } from "../components/ui";
import { MapPin, Video } from "lucide-react";
import { fmtMin } from "../lib/timeblocks";
import { nextMeetings, MEETING_KIND, type Meeting } from "../lib/meetings";
import { attendanceStats, COURSE_KIND, courseLabel, nextClasses, type Course } from "../lib/courses";
import { accountBalances, ACCOUNT_KIND, BUDGET_KIND, budgetStatus, dueRecurring, RECURRING_KIND, type Account, type Budget, type Recurring } from "../lib/finance";
import { rupiah, summary, type LedgerEntry } from "../lib/ledger";
import { requestOpen } from "../lib/deeplink";
import { compactRp } from "../finance/FinanceCharts";

export type PanelId = "agenda" | "tasks" | "meetings" | "classes" | "money" | "ibadah" | "kpi" | "okr" | "time" | "projects" | "notes";
export const PANEL_LABEL: Record<string, string> = {
  agenda: "Agenda",
  tasks: "Tugas hari ini",
  meetings: "Rapat berikutnya",
  classes: "Kuliah",
  money: "Keuangan",
  ibadah: "Ibadah",
  kpi: "KPI hari ini",
  okr: "OKR",
  time: "Waktu minggu ini",
  projects: "Proyek",
  notes: "Catatan terbaru",
};
export interface PanelCfg {
  id: string;
  on: boolean;
  wide?: boolean;
}
const DEFAULT_LAYOUT: PanelCfg[] = [
  { id: "agenda", on: true },
  { id: "tasks", on: true },
  { id: "meetings", on: true },
  { id: "classes", on: true },
  { id: "money", on: true },
  { id: "ibadah", on: true },
  { id: "kpi", on: true },
  { id: "okr", on: true },
  { id: "time", on: true },
  { id: "projects", on: true },
  { id: "notes", on: true },
];

export function normalizeLayout(raw: unknown): PanelCfg[] {
  const list = Array.isArray(raw) ? (raw as PanelCfg[]).filter((x) => x && PANEL_LABEL[x.id]) : [];
  const seen = new Set(list.map((x) => x.id));
  const out = list.filter((x, i) => list.findIndex((y) => y.id === x.id) === i);
  DEFAULT_LAYOUT.forEach((d, i) => !seen.has(d.id) && out.splice(Math.min(i, out.length), 0, d));
  return out;
}

const KEY = "dashboard_layout";
export function useDashLayout() {
  const [layout, setLayout] = useState<PanelCfg[]>(DEFAULT_LAYOUT);
  const load = () =>
    api.getSetting(KEY).then((v) => {
      try {
        setLayout(normalizeLayout(v ? JSON.parse(v) : null));
      } catch {
        setLayout(DEFAULT_LAYOUT);
      }
    });
  useEffect(() => {
    load();
    return onEvent<string>("setting-changed", (k) => k === KEY && load());
  }, []);
  const saveLayout = (l: PanelCfg[]) => {
    setLayout(l);
    api.setSetting(KEY, JSON.stringify(l));
  };
  return { layout, saveLayout };
}

export function TasksPanel({ go }: { go: (p: Page) => void }) {
  const t = useTasks();
  const scope = useScope();
  const today = dateKey();
  const list = t.tasks
    .filter((x) => !x.parentId && !isTaskDone(x, t.projects) && x.due && x.due <= today && (!scope.ids || scope.ids.has(x.projectId)))
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || (a.dueTime ?? 9999) - (b.dueTime ?? 9999));
  const doneToday = t.tasks.filter((x) => x.completedAt && dateKey(x.completedAt) === today).length;
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Tugas hari ini</h2>
        <span className="muted small">{doneToday ? `${doneToday} selesai hari ini` : ""}</span>
      </header>
      {list.length === 0 ? (
        <p className="muted small">Tidak ada tugas jatuh tempo. Ambil satu dari Inbox atau rencanakan besok.</p>
      ) : (
        <ul className="dash-tasks">
          {list.slice(0, 7).map((x) => (
            <li key={x.id}>
              <TaskCheck done={false} label={x.title} onToggle={() => t.update(x.id, { status: firstDoneStatus(projectOf(t.projects, x.projectId)) })} />
              <span className="dash-task-title">{x.title}</span>
              <DueChip t={x} />
              <PriorityFlag p={x.priority} />
            </li>
          ))}
          {list.length > 7 && <li className="muted small">+{list.length - 7} lainnya</li>}
        </ul>
      )}
      <button className="link" onClick={() => go("tasks")}>Buka tugas</button>
    </section>
  );
}

export function TimePanel() {
  const all = useRecords<TimeBlock>("timeblock");
  const t = useTasks();
  const scope = useScope();
  const blocks = { items: all.items.filter((b) => scope.match(blockProject(b, t.tasks)) || (!scope.ids && !blockProject(b, t.tasks))) };
  const today = parseDateKey(dateKey());
  const days = Array.from({ length: 7 }, (_, i) => dateKey(addDays(today, i - 6)));
  const tracked = days.map((d) => blocks.items.filter((b) => b.tracked && b.date === d).reduce((s, b) => s + b.end - b.start, 0));
  const planned = days.map((d) => blocks.items.filter((b) => !b.tracked && b.date === d).reduce((s, b) => s + b.end - b.start, 0));
  const max = Math.max(60, ...tracked, ...planned);
  const total = tracked.reduce((a, b) => a + b, 0);
  const byTask = new Map<string, number>();
  for (const b of blocks.items) if (b.tracked && b.taskId && days.includes(b.date)) byTask.set(b.taskId, (byTask.get(b.taskId) ?? 0) + b.end - b.start);
  const top = [...byTask.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Waktu minggu ini</h2>
        <span className="muted small">{total ? `${fmtDuration(total)} tercatat` : ""}</span>
      </header>
      <div className="dash-time" role="img" aria-label="Waktu tercatat dan direncanakan 7 hari terakhir">
        {days.map((d, i) => (
          <div key={d} className="dash-time-col" title={`${d}: tercatat ${fmtDuration(tracked[i])}, rencana ${fmtDuration(planned[i])}`}>
            <div className="dash-time-bars">
              <i className="plan" style={{ height: `${(planned[i] / max) * 100}%` }} />
              <i className="real" style={{ height: `${(tracked[i] / max) * 100}%` }} />
            </div>
            <span>{["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][parseDateKey(d).getDay()]}</span>
          </div>
        ))}
      </div>
      <p className="muted small dash-time-legend"><i className="plan" /> rencana <i className="real" /> tercatat timer</p>
      {top.length > 0 && (
        <ul className="dash-top">
          {top.map(([id, m]) => <li key={id}><span>{t.tasks.find((x) => x.id === id)?.title ?? "Tugas dihapus"}</span><b>{fmtDuration(m)}</b></li>)}
        </ul>
      )}
      {!total && <p className="muted small">Jalankan timer pada tugas untuk melihat ke mana waktu Anda pergi.</p>}
    </section>
  );
}

export function ProjectsPanel({ go }: { go: (p: Page) => void }) {
  const t = useTasks();
  const scope = useScope();
  // Semua proyek: tampilkan proyek utama. Fokus proyek: tampilkan subproyeknya.
  const list = scope.current ? childrenOf(t.projects, scope.current.id) : childrenOf(t.projects, undefined);
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Proyek</h2>
      </header>
      {list.length === 0 ? (
        <p className="muted small">Belum ada proyek. Buat dari halaman Tugas atau dari template.</p>
      ) : (
        <ul className="mini-okr">
          {list.map((p) => {
            const pr = subtreeProgress(t.projects, t.tasks, p.id, (x) => isTaskDone(x, t.projects));
            const late = pr.late;
            return (
              <li key={p.id}>
                <div className="mini-okr-top">
                  <button className="link-plain" onClick={() => (scope.setScope(p.id), go("projects"))}><ProjectMark p={p} size="sm" /> {p.name}</button>
                  <b>{pr.done}/{pr.total}{late ? <span className="dash-late"> · {late} terlambat</span> : null}</b>
                </div>
                <Progress value={pr.total ? pr.done / pr.total : 0} />
              </li>
            );
          })}
        </ul>
      )}
      <button className="link" onClick={() => go("projects")}>Buka proyek & timeline</button>
    </section>
  );
}

const dayWord = (d: string, today: string) => (d === today ? "Hari ini" : d === dateKey(addDays(parseDateKey(today), 1)) ? "Besok" : parseDateKey(d).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" }));

export function MeetingsPanel({ go }: { go: (p: Page) => void }) {
  const meetings = useRecords<Meeting>(MEETING_KIND);
  const scope = useScope();
  const today = dateKey();
  const list = nextMeetings(meetings.items.filter((m) => scope.match(m.projectId) || !m.projectId), new Date(), 4);
  const open = (id: string) => (requestOpen("meeting", id), go("meetings"));
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Rapat berikutnya</h2>
        <span className="muted small">{meetings.items.filter((m) => m.date === today && m.status === "terjadwal").length || ""}{meetings.items.some((m) => m.date === today && m.status === "terjadwal") ? " hari ini" : ""}</span>
      </header>
      {list.length === 0 ? (
        <p className="muted small">Tidak ada rapat terjadwal.</p>
      ) : (
        <ul className="dash-list">
          {list.map((m) => (
            <li key={m.id}>
              <button className="dash-li" onClick={() => open(m.id)}>
                <span className="dash-li-when">
                  <b>{fmtMin(m.start)}</b>
                  <small>{dayWord(m.date, today)}</small>
                </span>
                <span className="dash-li-main">
                  <b>{m.title}</b>
                  {m.location && (
                    <small>
                      <MapPin size={11} /> {m.location}
                    </small>
                  )}
                </span>
              </button>
              {m.link && (
                <button className="btn btn-sm" onClick={() => api.openUrl(m.link!)} title="Gabung rapat daring">
                  <Video size={13} /> Gabung
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button className="link" onClick={() => go("meetings")}>Buka rapat</button>
    </section>
  );
}

export function ClassesPanel({ go }: { go: (p: Page) => void }) {
  const blocks = useRecords<TimeBlock>("timeblock");
  const courses = useRecords<Course>(COURSE_KIND);
  const today = dateKey();
  const next = nextClasses(blocks.items, new Date(), 4);
  const live = courses.items.filter((c) => !c.archived && c.end >= today && c.start <= today);
  const warn = live
    .map((c) => ({ c, st: attendanceStats(blocks.items, c.id, today) }))
    .filter(({ c, st }) => st.percent !== null && st.held >= 3 && st.percent < c.minAttendance);
  const exams = blocks.items.filter((b) => b.sessionId?.startsWith("ujian:") && b.date >= today && b.date <= dateKey(addDays(parseDateKey(today), 14))).sort((a, b) => a.date.localeCompare(b.date));
  if (!courses.items.length) return (
    <section className="panel">
      <header className="panel-head"><h2>Kuliah</h2></header>
      <p className="muted small">Tambahkan mata kuliah beserta jadwal mingguannya; pertemuan, ujian, presensi, dan IPK diatur otomatis.</p>
      <button className="link" onClick={() => go("courses")}>Buka kuliah</button>
    </section>
  );
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Kuliah</h2>
        <span className="muted small">{live.length} mata kuliah aktif</span>
      </header>
      {next.length === 0 ? (
        <p className="muted small">Tidak ada kelas dalam waktu dekat.</p>
      ) : (
        <ul className="dash-list">
          {next.map((b) => (
            <li key={b.id}>
              <button className="dash-li" onClick={() => (requestOpen("course", b.courseId!), go("courses"))}>
                <span className="dash-li-when">
                  <b>{fmtMin(b.start)}</b>
                  <small>{dayWord(b.date, today)}</small>
                </span>
                <span className="dash-li-main">
                  <b>{b.sessionId?.startsWith("ujian:") ? "🎯 " : ""}{b.title}</b>
                  {b.location && (
                    <small>
                      <MapPin size={11} /> {b.location}
                    </small>
                  )}
                </span>
              </button>
              {b.link && b.date === today && (
                <button className="btn btn-sm" onClick={() => api.openUrl(b.link!)}>
                  <Video size={13} /> Gabung
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {exams.length > 0 && <p className="small dash-note">🎯 Ujian 14 hari: {exams.map((e) => `${e.title} (${dayWord(e.date, today)})`).join(", ")}</p>}
      {warn.length > 0 && <p className="small dash-note warn">⚠ Kehadiran di bawah minimal: {warn.map(({ c, st }) => `${courseLabel(c)} ${st.percent}%`).join(", ")}</p>}
      <button className="link" onClick={() => go("courses")}>Buka kuliah</button>
    </section>
  );
}

export function MoneyPanel({ go }: { go: (p: Page) => void }) {
  const ledger = useRecords<LedgerEntry>("ledger");
  const accounts = useRecords<Account>(ACCOUNT_KIND);
  const budgets = useRecords<Budget>(BUDGET_KIND);
  const recurring = useRecords<Recurring>(RECURRING_KIND);
  const scope = useScope();
  const today = dateKey();
  const ym = today.slice(0, 7);
  const personal = !scope.current;
  const inView = (pid?: string) => (personal ? !pid : scope.match(pid));
  const accs = accounts.items.filter((a) => !a.archived && inView(a.projectId));
  const bal = accountBalances(accounts.items, ledger.items);
  const entries = ledger.items.filter((e) => inView(e.projectId));
  const month = summary(entries, `${ym}-01`, `${ym}-31`);
  const total = budgets.items.find((b) => b.category === "*" && b.period === "bulanan" && inView(b.projectId));
  const st = total ? budgetStatus([total], ledger.items, ym, (bp, ep) => (bp ? ep === bp : !ep))[0] : null;
  const due = dueRecurring(recurring.items.filter((r) => inView(r.projectId)), dateKey(addDays(parseDateKey(today), 7)));
  if (!ledger.items.length && !accounts.items.length)
    return (
      <section className="panel">
        <header className="panel-head"><h2>Keuangan</h2></header>
        <p className="muted small">Catat pemasukan & pengeluaran pribadi atau proyek, pantau anggaran dan tagihan rutin.</p>
        <button className="link" onClick={() => go("ledger")}>Buka keuangan</button>
      </section>
    );
  return (
    <section className="panel">
      <header className="panel-head">
        <h2>Keuangan {personal ? "pribadi" : scope.current?.name}</h2>
        {accs.length > 0 && <b className="dash-money-bal">{rupiah(accs.reduce((s, a) => s + (bal.get(a.id) ?? 0), 0))}</b>}
      </header>
      <div className="dash-money">
        <span>
          <small>Masuk bulan ini</small>
          <b>{compactRp(month.masuk)}</b>
        </span>
        <span>
          <small>Keluar bulan ini</small>
          <b>{compactRp(month.keluar)}</b>
        </span>
      </div>
      {st && (
        <div className="dash-budget">
          <Progress value={Math.min(1, st.ratio)} tone={st.state === "lewat" ? "tertinggal" : st.state === "waspada" ? "waspada" : "aman"} />
          <small className="muted">
            {st.state === "lewat" ? "⚠ Anggaran bulan ini terlampaui" : `Anggaran terpakai ${Math.round(st.ratio * 100)}%`} · sisa {compactRp(Math.max(0, st.budget.amount - st.spent))}
          </small>
        </div>
      )}
      {due.length > 0 && (
        <ul className="dash-bills">
          {due.slice(0, 4).map((d) => (
            <li key={`${d.rec.id}-${d.date}`} className={d.date < today ? "late" : ""}>
              <span>{d.rec.title}</span>
              <small>{d.date < today ? "telat" : dayWord(d.date, today)}</small>
              <b>{d.rec.type === "masuk" ? "+" : "−"}{compactRp(d.rec.amount)}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="dash-money-act">
        <button className="link" onClick={() => go("ledger")}>Buka keuangan</button>
        <button className="chip-btn" onClick={() => (requestOpen("finance", "keluar"), go("ledger"))}>+ Pengeluaran</button>
        {due.length > 0 && <button className="chip-btn" onClick={() => (requestOpen("finance", "tagihan"), go("ledger"))}>Bayar tagihan</button>}
      </div>
    </section>
  );
}
