import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Palette, ZoomIn, ZoomOut, BookOpen, Bot, CalendarClock, CalendarDays, CheckSquare, ClipboardCheck, Coffee, Compass, DatabaseBackup, FolderKanban, FolderOpen, FolderPlus, Gauge, GraduationCap, Handshake, LayoutPanelLeft, MoonStar, NotebookPen, PanelLeft, Settings as Cog, Square, Wallet, Sun, Target, RefreshCw, Users, X } from "lucide-react";
import { api, errorText, isDesktop, onEvent } from "./lib/api";
import { loadTeam, Pb, saveTeam } from "./team/pb";
import { syncTeam } from "./team/teamSync";
import { startBotHost } from "./team/bot";
import type { SyncStatus } from "./lib/types";
import { relativeAgo } from "./lib/date";
import { ToastProvider, useToast } from "./components/ui";
import Dashboard from "./pages/Dashboard";
// Halaman selain dasbor dimuat saat pertama dibuka, supaya aplikasi (dan jendela widget) cepat terbuka.
const Schedule = lazy(() => import("./pages/Schedule"));
const Okr = lazy(() => import("./pages/Okr"));
const Kpi = lazy(() => import("./pages/Kpi"));
const Notes = lazy(() => import("./pages/Notes"));
const Files = lazy(() => import("./pages/Files"));
const Settings = lazy(() => import("./pages/Settings"));
const Ibadah = lazy(() => import("./pages/Ibadah"));
const Review = lazy(() => import("./pages/Review"));
const TasksPage = lazy(() => import("./pages/TasksPage"));
const Projects = lazy(() => import("./pages/Projects"));
const Team = lazy(() => import("./pages/Team"));
const Assistant = lazy(() => import("./pages/Assistant"));
const Guide = lazy(() => import("./pages/Guide"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Ledger = lazy(() => import("./pages/Ledger"));
const Meetings = lazy(() => import("./pages/Meetings"));
const Courses = lazy(() => import("./pages/Courses"));
import Tour from "./guide/Tour";
import { useTimer } from "./lib/timer";
import { TimerPill } from "./tasks/TimeTracking";
import { useTasks } from "./lib/useTasks";
import { ScopeProvider, useScope } from "./lib/scope";
import { MembersProvider } from "./lib/members";
import ProjectSwitcher from "./projects/ProjectSwitcher";
import Sidebar, { NavItem, SidebarOpener, useSidebarPrefs } from "./sidebar/Sidebar";
import { useModules } from "./lib/modules";
import type { Item } from "./lib/types";
import type { Project } from "./lib/tasks";
import ProjectForm from "./projects/ProjectForm";
import { DEMO_STATE_KEY, demoConfigRecords, demoRecords } from "./lib/demo";
import { firstDoneStatus, firstOpenStatus, isTaskDone, projectOf } from "./lib/tasks";
import { subtreeIds } from "./lib/projects";
import CommandPalette, { PaletteAction } from "./components/CommandPalette";
import { parseQuick } from "./lib/quickParse";
import { breakAction } from "./breaks/BreakScreen";
import { consumeRemoteOpen, NEW_ID, requestOpen } from "./lib/deeplink";
import { useAccountSyncLoop } from "./account/useAccount";
import { useGoogleSyncLoop } from "./calendar/useGoogle";
import { dailyUpdateCheck } from "./lib/update";
import { useWriteGuard } from "./lib/access";
import InboxButton from "./collab/Inbox";
import { useAgendaSync } from "./lib/agendaSync";
import { useMcpServer } from "./ai/mcp";
import { stepZoom } from "./lib/appearance";
import { openSettings } from "./lib/deeplink";

export type Page = "today" | "projects" | "tasks" | "calendar" | "schedule" | "meetings" | "courses" | "ledger" | "ibadah" | "okr" | "kpi" | "review" | "notes" | "files" | "team" | "assistant" | "guide" | "settings";

type PageNav = NavItem & { id: Page };
/** Menu utama di atas sidebar. */
const MAIN_NAV: PageNav[] = [
  { id: "today", label: "Hari ini", icon: Sun, key: "1" },
  { id: "tasks", label: "Tugas", icon: CheckSquare, key: "3" },
  { id: "calendar", label: "Kalender", icon: CalendarDays, key: "4" },
  { id: "schedule", label: "Jadwal harian", icon: CalendarClock, key: "0" },
  { id: "projects", label: "Proyek & timeline", icon: FolderKanban, key: "2" },
];
/** Modul: bisa disembunyikan/diurutkan di sidebar dan dimatikan di Pengaturan → Plugin. */
const MODULE_NAV: PageNav[] = [
  { id: "meetings", label: "Rapat", icon: Handshake },
  { id: "courses", label: "Kuliah", icon: GraduationCap },
  { id: "notes", label: "Catatan", icon: NotebookPen, key: "8" },
  { id: "files", label: "File", icon: FolderOpen, key: "9" },
  { id: "ledger", label: "Keuangan", icon: Wallet },
  { id: "okr", label: "OKR", icon: Target, key: "5" },
  { id: "kpi", label: "KPI harian", icon: Gauge, key: "6" },
  { id: "review", label: "Evaluasi", icon: ClipboardCheck, key: "7" },
  { id: "ibadah", label: "Ibadah", icon: MoonStar },
  { id: "team", label: "Tim & bot", icon: Users },
  { id: "assistant", label: "Asisten AI", icon: Bot, key: "J" },
];
const NAV_ITEMS: PageNav[] = [...MAIN_NAV, ...MODULE_NAV];
const ALL_PAGES: Page[] = [...NAV_ITEMS.map((i) => i.id), "guide", "settings"];

function useAutoSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const refresh = () => api.syncStatus().then(setStatus).catch(() => {});

  useEffect(() => {
    refresh();
    const stopSync = onEvent("sync-done", refresh);
    // Setelah ada perubahan, sinkronkan 15 detik kemudian (digabung jika beruntun).
    const stopChange = onEvent("records-changed", () => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(async () => {
        const s = await api.syncStatus();
        if (s.folder) api.syncNow().catch(() => refresh());
      }, 15000);
    });
    const tick = window.setInterval(refresh, 30000);
    return () => {
      stopSync();
      stopChange();
      window.clearInterval(tick);
      window.clearTimeout(timer.current);
    };
  }, []);

  const syncNow = async () => {
    setBusy(true);
    try {
      await api.syncNow();
    } finally {
      setBusy(false);
      refresh();
    }
  };
  return { status, busy, syncNow, refresh };
}

/** Sinkron proyek tim tiap 30 detik (dan 8 detik setelah ada perubahan). */
function useTeamSync() {
  const toast = useToast();
  useEffect(() => {
    let alive = true;
    let pending: number | undefined;
    let running = false;
    const run = async () => {
      if (running) return;
      const team = await loadTeam();
      if (!team) return;
      running = true;
      try {
        // Perbarui token sehari sekali.
        if (Date.now() - team.tokenAt > 86400000) {
          const pb = new Pb(team.serverUrl, team.token);
          const r = await pb.refresh();
          await saveTeam({ ...team, token: r.token, tokenAt: Date.now() });
          team.token = r.token;
        }
        const r = await syncTeam(team);
        await api.setSetting("team_status", JSON.stringify({ at: Date.now(), ok: true, text: `${r.workspaces} ruang kerja · ${r.pushed} terkirim · ${r.pulled} diterima` }));
        if (r.rejected.length) toast(`Server tim menolak ${r.rejected.length} perubahan karena peran Anda (${r.rejected.slice(0, 2).join(", ")}). Data dikembalikan ke versi tim.`, "error");
      } catch (e) {
        await api.setSetting("team_status", JSON.stringify({ at: Date.now(), ok: false, text: errorText(e) }));
      } finally {
        running = false;
      }
    };
    run();
    const loop = (async () => {
      while (alive) {
        await api.sleep(30000);
        if (alive) await run();
      }
    })();
    const stop = onEvent<string>("records-changed", () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(run, 8000);
    });
    // Realtime: perubahan dari anggota lain langsung ditarik (1,5 detik, digabung).
    let realtimeKey = "";
    const startRealtime = async () => {
      const team = await loadTeam();
      const key = team ? `${team.serverUrl}|${team.token}` : "";
      if (key === realtimeKey) return;
      realtimeKey = key;
      if (team) api.teamRealtimeStart(team.serverUrl, team.token).catch(() => {});
      else api.teamRealtimeStop().catch(() => {});
    };
    startRealtime();
    const stopCfg = onEvent<string>("setting-changed", (k) => k === "team_config" && startRealtime());
    const stopRemote = onEvent("team-remote-change", () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(run, 1500);
    });
    return () => {
      alive = false;
      stop();
      stopCfg();
      stopRemote();
      api.teamRealtimeStop().catch(() => {});
      void loop;
    };
  }, [toast]);
}

/** Naikkan bila contoh demo baru ditambahkan, supaya pengguna lama yang masih memakai demo ikut mendapatkannya. */
const DEMO_REV = "4";

/** Tambahkan contoh demo baru (buku kas, komentar, rapat, kuliah, keuangan) ke demo versi lama tanpa menyentuh data yang sudah ada. */
async function topUpDemo() {
  if ((await api.getSetting("demo_rev")) === DEMO_REV) return;
  // Blok lama yang kini menjadi rapat.
  for (const id of ["b-9", "b-11"]) await api.remove(id, "timeblock").catch(() => {});
  const fresh = demoRecords().filter((r) => /^(ld|cm|ob|mt|ms|crs|kls|n-notulen|acc|bud|rec)-/.test(r.id));
  const kinds = [...new Set(fresh.map((r) => r.kind))];
  const have = new Set((await Promise.all(kinds.map((k) => api.list(k)))).flat().map((r) => r.id));
  const add = fresh.filter((r) => !have.has(r.id));
  if (add.length) await api.importRecords(add);
  await api.setSetting("demo_rev", DEMO_REV);
}

/** Isi database demo saat pertama kali dijalankan dengan database kosong. */
function useDemoBootstrap() {
  const [state, setState] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const cur = await api.getSetting(DEMO_STATE_KEY);
      if (cur) {
        if (cur === "loaded") topUpDemo().catch(() => {});
        return setState(cur);
      }
      const n = await api.countRecords();
      if (n === 0) {
        await api.importRecords([...demoRecords(), ...demoConfigRecords()]);
        await api.setSetting(DEMO_STATE_KEY, "loaded");
        await api.setSetting("demo_rev", DEMO_REV);
        setState("loaded");
      } else {
        await api.setSetting(DEMO_STATE_KEY, "skipped");
        setState("skipped");
      }
    })().catch(() => {});
    return onEvent<string>("setting-changed", (k) => k === DEMO_STATE_KEY && api.getSetting(DEMO_STATE_KEY).then(setState));
  }, []);
  return state;
}

function DemoBanner({ go }: { go: (p: Page) => void }) {
  const toast = useToast();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("ruangku-demo-hide") === "1");
  if (hidden) return null;
  return (
    <div className="demo-banner" role="note">
      <span>
        <b>Data demo.</b> Enam proyek contoh (Internal, Jitu, Kuliah, Penitipan Infaq, Recruitment, Riset Thesis) sudah terisi supaya Anda bisa langsung mencoba.
      </span>
      <button className="link" onClick={() => go("guide")}>Lihat panduan</button>
      <button
        className="btn btn-sm"
        onClick={async () => {
          const n = await api.removeDemo();
          await api.setSetting(DEMO_STATE_KEY, "removed");
          await api.setSetting("project_scope", "all");
          toast(`${n} data demo dihapus. Selamat memulai dengan data Anda sendiri.`);
        }}
      >
        Hapus data demo
      </button>
      <button className="icon-btn sm" aria-label="Sembunyikan" onClick={() => (sessionStorage.setItem("ruangku-demo-hide", "1"), setHidden(true))}><X size={14} /></button>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ScopeProvider>
        <MembersProvider>
          <Shell />
        </MembersProvider>
      </ScopeProvider>
    </ToastProvider>
  );
}

function Shell() {
  const [page, setPage] = useState<Page>(() => {
    const fromHash = window.location.hash.replace(/^#\/?/, "") as Page;
    if (ALL_PAGES.includes(fromHash)) return fromHash;
    try {
      const saved = localStorage.getItem("ruangku-page") as Page;
      return ALL_PAGES.includes(saved) ? saved : "today";
    } catch {
      return "today";
    }
  });
  const sync = useAutoSync();
  const toast = useToast();
  const timer = useTimer();
  const demo = useDemoBootstrap();
  useTeamSync();
  useGoogleSyncLoop();
  useAccountSyncLoop();
  useAgendaSync();
  useMcpServer();
  useWriteGuard(useCallback((msg: string) => toast(msg, "error"), [toast]));
  useEffect(() => (isDesktop ? startBotHost() : undefined), []);
  // Cek pembaruan sekali sehari (bila repo rilis sudah diatur).
  useEffect(() => {
    if (!isDesktop) return;
    const t = window.setTimeout(async () => {
      try {
        const d = await api.diagnostics();
        const r = await dailyUpdateCheck(d.version);
        if (r) toast(`Ruangku ${r.version} tersedia`, "info", { label: "Lihat", run: () => setPage("settings") });
      } catch {
        /* tanpa internet: abaikan */
      }
    }, 15000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const scope = useScope();
  const modules = useModules();
  const [sbPrefs, setSbPrefs] = useSidebarPrefs();
  const [newProject, setNewProject] = useState<false | { parentId?: string; initial?: Item<Project> }>(false);
  const [tour, setTour] = useState(false);
  const [palette, setPalette] = useState(false);
  // Tur pertama kali setelah data demo dimuat.
  useEffect(() => {
    if (demo !== "loaded") return;
    api.getSetting("tour_done").then((v) => !v && window.setTimeout(() => setTour(true), 600));
  }, [demo]);
  // Otomasi "saat tenggat tiba": cek saat dibuka dan tiap 10 menit (hanya jendela utama).
  const tk = useTasks();
  const dueRef = useRef(tk.runDueToday);
  dueRef.current = tk.runDueToday;
  useEffect(() => {
    if (tk.loading) return;
    dueRef.current();
    const i = window.setInterval(() => dueRef.current(), 10 * 60 * 1000);
    return () => window.clearInterval(i);
  }, [tk.loading]);

  useEffect(() => {
    try {
      localStorage.setItem("ruangku-page", page);
    } catch {
      /* abaikan */
    }
  }, [page]);

  // Widget / bot / asisten bisa meminta jendela utama membuka halaman tertentu.
  useEffect(() => onEvent<Page>("navigate", (p) => ALL_PAGES.includes(p) && setPage(p)), []);
  useEffect(() => {
    const f = (e: Event) => {
      const p = (e as CustomEvent<Page>).detail;
      if (ALL_PAGES.includes(p)) setPage(p);
    };
    window.addEventListener("ruangku-go", f);
    return () => window.removeEventListener("ruangku-go", f);
  }, []);
  useEffect(() => onEvent<string>("setting-changed", (k) => k === "open_request" && consumeRemoteOpen()), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        setPage("guide");
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "=" || e.key === "+" || e.key === "-" || e.key === "_")) {
        e.preventDefault();
        const z = stepZoom(e.key === "-" || e.key === "_" ? -1 : 1);
        toast(`Ukuran tampilan ${z}%`);
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (e.key === "\\") {
        e.preventDefault();
        setSbPrefs((x) => ({ ...x, hidden: !x.hidden }));
        return;
      }
      const item = NAV_ITEMS.find((i) => i.key && i.key.toLowerCase() === e.key.toLowerCase());
      if (item) {
        e.preventDefault();
        setPage(item.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const actions: PaletteAction[] = [
    { id: "new-project", label: "Proyek baru", icon: FolderPlus, keywords: "buat tambah subproyek", featured: true, run: () => setNewProject({}) },
    { id: "appearance", label: "Atur tampilan (tema, warna, ukuran, kepadatan)", icon: Palette, keywords: "tema gelap terang aksen warna zoom ukuran teks huruf font lebar halaman kepadatan ringkas", featured: true, run: () => openSettings("umum") },
    { id: "zoom-in", label: "Perbesar tampilan", hint: "Ctrl + =", icon: ZoomIn, keywords: "zoom ukuran teks besar", run: () => void toast(`Ukuran tampilan ${stepZoom(1)}%`) },
    { id: "zoom-out", label: "Perkecil tampilan", hint: "Ctrl + −", icon: ZoomOut, keywords: "zoom ukuran teks kecil", run: () => void toast(`Ukuran tampilan ${stepZoom(-1)}%`) },
    { id: "zoom-reset", label: "Ukuran tampilan 100%", icon: ZoomIn, keywords: "zoom reset normal", run: () => void toast(`Ukuran tampilan ${stepZoom(0)}%`) },
    { id: "toggle-sidebar", label: "Tampilkan / ciutkan sidebar", icon: PanelLeft, keywords: "sidebar panel menu ctrl+\\", run: () => setSbPrefs((x) => ({ ...x, hidden: !x.hidden })) },
    ...(modules.isOn("meetings") ? [{ id: "new-meeting", label: "Rapat baru", icon: Handshake, keywords: "buat jadwalkan meeting undangan", featured: true, run: () => (requestOpen("meeting", NEW_ID), setPage("meetings")) }] : []),
    ...(modules.isOn("courses") ? [{ id: "new-course", label: "Mata kuliah baru", icon: GraduationCap, keywords: "kuliah kelas matkul semester", run: () => (requestOpen("course", NEW_ID), setPage("courses")) }] : []),
    ...(modules.isOn("ledger")
      ? [
          { id: "new-expense", label: "Catat pengeluaran", icon: Wallet, keywords: "keuangan kas bayar beli uang", featured: true, run: () => (requestOpen("finance", "keluar"), setPage("ledger")) },
          { id: "new-income", label: "Catat pemasukan", icon: Wallet, keywords: "keuangan kas terima gaji uang", run: () => (requestOpen("finance", "masuk"), setPage("ledger")) },
        ]
      : []),
    { id: "today-cal", label: "Kalender hari ini", icon: CalendarDays, keywords: "jadwal agenda", featured: true, run: () => (requestOpen("date", new Date().toISOString().slice(0, 10)), setPage("calendar")) },
    ...(timer.active ? [{ id: "stop-timer", label: `Hentikan timer: ${timer.active.title}`, icon: Square, keywords: "stop waktu", featured: true, run: () => timer.stop() }] : []),
    ...(isDesktop
      ? [
          {
            id: "widget",
            label: "Tampilkan / sembunyikan widget",
            icon: LayoutPanelLeft,
            keywords: "desktop toggle",
            featured: true,
            run: async () => {
              const c = await api.widgetConfig();
              await api.widgetSetVisible(!c.visible);
            },
          },
          { id: "break", label: "Istirahat sekarang", icon: Coffee, keywords: "rehat jeda break", run: () => breakAction("start") },
        ]
      : []),
    ...(isDesktop
      ? [
          {
            id: "backup",
            label: "Backup sekarang",
            icon: DatabaseBackup,
            keywords: "cadangan simpan data",
            run: async () => {
              try {
                toast(`Backup dibuat: ${await api.backupNow()}`);
              } catch (e) {
                toast(errorText(e), "error");
              }
            },
          },
        ]
      : []),
    { id: "sync", label: "Sinkronkan sekarang", icon: RefreshCw, keywords: "sync cloud folder", run: () => sync.syncNow().catch(() => toast("Sinkronisasi belum diatur", "error")) },
    { id: "tour", label: "Mulai tur pengenalan", icon: Compass, keywords: "bantuan", run: () => setTour(true) },
    { id: "guide", label: "Buka panduan", icon: BookOpen, keywords: "bantuan help f1", run: () => setPage("guide") },
    { id: "all-projects", label: "Tampilkan semua proyek", icon: FolderKanban, keywords: "lingkup scope reset", run: () => scope.setScope("all") },
  ];

  const openCount = (id: string) => {
    const ids = subtreeIds(scope.allProjects, id);
    return tk.tasks.filter((x) => ids.has(x.projectId) && !x.parentId && !isTaskDone(x, tk.projects)).length;
  };

  const s = sync.status;
  const go = (p: string) => ALL_PAGES.includes(p as Page) && setPage(p as Page);
  return (
    <div className={`shell ${sbPrefs.hidden ? "sb-hidden" : ""}`}>
      <Sidebar
        page={page}
        go={go}
        mainNav={MAIN_NAV}
        moduleNav={MODULE_NAV.filter((n) => modules.pageOn(n.id))}
        onSearch={() => setPalette(true)}
        onNewProject={(parentId) => setNewProject({ parentId })}
        onEditProject={(p) => setNewProject({ initial: p })}
        brandExtra={<InboxButton go={setPage} />}
        footer={
          <>
            <TimerPill timer={timer} onOpen={() => setPage("tasks")} />
            <button
              className="sync-pill"
              onClick={() => (s?.folder ? sync.syncNow().catch(() => {}) : setPage("settings"))}
              title={s?.lastError ?? (s?.folder ? `Folder: ${s.folder}` : "Atur folder sinkronisasi")}
            >
              <RefreshCw size={14} className={sync.busy ? "spin" : ""} />
              <span>
                {!s?.folder
                  ? "Sinkronisasi belum diatur"
                  : s.lastError
                    ? "Sinkronisasi gagal"
                    : s.lastSync
                      ? `Tersinkron ${relativeAgo(s.lastSync)}`
                      : "Belum pernah sinkron"}
              </span>
            </button>
            {!isDesktop && <p className="preview-note">Mode pratinjau browser: data demo, file manager tiruan.</p>}
          </>
        }
      />
      <SidebarOpener />
      <ProjectSwitcher quick onNew={() => setNewProject({})} onManage={() => setPage("projects")} counts={openCount} />
      <main className="main">
        {demo === "loaded" && <DemoBanner go={setPage} />}
        <Suspense fallback={<div className="page page-loading" aria-busy="true" />}>
        {page === "today" && <Dashboard go={setPage} />}
        {page === "projects" && <Projects go={setPage} />}
        {page === "calendar" && <Calendar go={setPage} />}
        {page === "schedule" && <Schedule />}
        {page === "tasks" && <TasksPage />}
        {page === "ibadah" && <Ibadah />}
        {page === "review" && <Review />}
        {page === "okr" && <Okr />}
        {page === "kpi" && <Kpi />}
        {page === "notes" && <Notes />}
        {page === "files" && <Files />}
        {page === "ledger" && <Ledger />}
        {page === "meetings" && <Meetings go={setPage} />}
        {page === "courses" && <Courses go={setPage} />}
        {page === "team" && <Team />}
        {page === "assistant" && <Assistant />}
        {page === "guide" && <Guide go={setPage} startTour={() => setTour(true)} />}
        {page === "settings" && <Settings sync={sync} go={(p) => go(p as Page)} moduleNav={MODULE_NAV.filter((n) => modules.pageOn(n.id))} />}
        </Suspense>
      </main>
      {tour && <Tour onDone={() => setTour(false)} />}
      {palette && (
        <CommandPalette
          onClose={() => setPalette(false)}
          go={(p) => ALL_PAGES.includes(p as Page) && setPage(p as Page)}
          pages={[...NAV_ITEMS.filter((n) => modules.pageOn(n.id)), { id: "guide", label: "Panduan", icon: BookOpen }, { id: "settings", label: "Pengaturan", icon: Cog }]}
          actions={actions}
          createTask={async (text) => {
            const parsed = parseQuick(text, new Date(), tk.projects.map((p) => p.name));
            const proj = parsed.project ? tk.projects.find((x) => x.name.toLowerCase().startsWith(parsed.project!.toLowerCase())) : undefined;
            const id = await tk.create({ title: parsed.title || text, projectId: proj?.id ?? scope.defaultProjectId, due: parsed.due, dueTime: parsed.dueTime, tags: parsed.tags, priority: parsed.priority, estimate: parsed.estimate, recurrence: parsed.recurrence });
            toast(`Tugas "${parsed.title || text}" ditambahkan`, "info", { label: "Buka", run: () => (requestOpen("task", id), setPage("tasks")) });
          }}
          toggleTask={async (t) => {
            const done = isTaskDone(t, tk.projects);
            const proj = projectOf(tk.projects, t.projectId);
            await tk.update(t.id, { status: done ? firstOpenStatus(proj) : firstDoneStatus(proj) });
            toast(done ? `"${t.title}" dibuka lagi` : `"${t.title}" selesai`);
          }}
          startTimer={async (t) => {
            await timer.start(t);
            toast(`Timer berjalan: ${t.title}`);
          }}
        />
      )}
      {newProject && (
        <ProjectForm
          projects={scope.allProjects}
          initial={newProject.initial}
          parentId={newProject.initial ? undefined : newProject.parentId ?? scope.current?.id}
          onClose={() => setNewProject(false)}
          onSave={async (p) => {
            if (newProject.initial) return void (await tk.saveProject(p, newProject.initial.id));
            const id = await tk.saveProject(p);
            scope.setScope(id);
          }}
        />
      )}
    </div>
  );
}
