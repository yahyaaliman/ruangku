// Halaman Kuliah: jadwal mingguan, mata kuliah (pertemuan & presensi, tugas, ujian, nilai), IPS/IPK.
// Pertemuan dan ujian dibuat otomatis sebagai blok jadwal (kind "kuliah") sehingga tampil di semua fitur.
import { Fragment, useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ExternalLink, FileText, GraduationCap, MapPin, Plus, Settings2, Trash2, Video, X } from "lucide-react";
import type { BlockColor, Item, Note, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { useTasks } from "../lib/useTasks";
import { api, newId } from "../lib/api";
import { dateKey, parseDateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { NEW_ID, requestOpen, useOpenRequest } from "../lib/deeplink";
import { DEFAULT_STATUSES, isTaskDone } from "../lib/tasks";
import {
  ATTENDANCE_LABEL, attendanceStats, COURSE_KIND, courseGrade, courseLabel, DAY_NAMES, gpa, GRADE_SCALES, numberedMeetings, scaleById, semesterOf, SESSION_TYPE_LABEL, weightedScore,
  type Attendance, type Course, type CourseExam, type CourseSession, type GradePart,
} from "../lib/courses";
import { COURSE_NOTE_TEMPLATE } from "../notes/BlockEditor";
import { Confirm, Field, Modal, Progress, useToast } from "../components/ui";
import { TimeInput } from "../components/TimeInput";
import { ProjectSelect } from "../projects/ProjectSwitcher";
import { useJsonSetting } from "../lib/useSetting";
import { linkPlatform, normalizeLink } from "../lib/meetings";
import type { Page } from "../App";
import "../courses/courses.css";
import { PaneResizer, usePaneWidth } from "../components/Pane";
import { usePageLayout, type SectionDef } from "../lib/pageLayout";
import { LayoutCheck, LayoutMenu, LayoutSeg } from "../components/LayoutMenu";

const COLORS: BlockColor[] = ["laut", "nila", "daun", "kunyit", "bata", "jambu", "ungu", "kopi", "abu"];
type Tab = "jadwal" | "matkul" | "nilai";
const CRS_TABS: { id: Tab; label: string }[] = [
  { id: "jadwal", label: "Jadwal mingguan" },
  { id: "matkul", label: "Mata kuliah" },
  { id: "nilai", label: "Nilai & IPK" },
];
const CRS_SECTIONS: SectionDef[] = [
  { id: "tiles", label: "Kartu IPS, IPK & ringkasan" },
  { id: "today", label: "Kelas hari ini" },
];

export default function Courses({ go }: { go: (p: Page) => void }) {
  const courses = useRecords<Course>(COURSE_KIND);
  const blocks = useRecords<TimeBlock>("timeblock");
  const scope = useScope();
  const [prefs, setPrefs] = useJsonSetting<{ scale: string; semester: string }>("kuliah_prefs", { scale: "itb", semester: "" });
  const [tab, setTab] = useState<Tab>(() => (localStorage.getItem("ruangku-kuliah-tab") as Tab) || "jadwal");
  const cl = usePageLayout("kuliah", CRS_SECTIONS);
  const hiddenTabs = cl.opt<string[]>("hideTabs", []);
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState<null | { initial?: Item<Course> }>(null);
  const scale = scaleById(prefs.scale);
  const today = dateKey();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  useOpenRequest("course", (id) => (id === NEW_ID ? setForm({}) : setOpen(id)), !courses.loading);

  const semesters = useMemo(() => [...new Set([semesterOf(), ...courses.items.map((c) => c.semester)])].sort().reverse(), [courses.items]);
  const semester = prefs.semester && semesters.includes(prefs.semester) ? prefs.semester : semesterOf();
  const visible = courses.items.filter((c) => scope.match(c.projectId) || !c.projectId);
  const inSem = visible.filter((c) => c.semester === semester && !c.archived);
  const ips = gpa(visible, scale, semester);
  const ipk = gpa(visible, scale);
  const setTabP = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("ruangku-kuliah-tab", t);
    } catch {
      /* abaikan */
    }
  };
  const todayClasses = blocks.items.filter((b) => b.kind === "kuliah" && b.date === today && inSem.some((c) => c.id === b.courseId)).sort((a, b) => a.start - b.start);
  const current = courses.items.find((c) => c.id === open);

  return (
    <div className="page page-wide crs-page">
      <header className="page-head">
        <div>
          <h1>Kuliah</h1>
          <p className="page-sub">Jadwal mingguan satu semester, presensi, tugas, ujian, dan nilai. Pertemuan otomatis masuk Kalender, Jadwal harian, widget, pengingat, dan rangkuman pagi.</p>
        </div>
        <div className="btn-row">
          <select value={semester} onChange={(e) => setPrefs((p) => ({ ...p, semester: e.target.value }))} aria-label="Semester">
            {semesters.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Plus size={16} /> Mata kuliah
          </button>
        </div>
      </header>

      {cl.visible.map((sec) =>
        sec.id === "tiles" ? (
          <Fragment key="tiles">
      <section className="crs-tiles">
        <div className="crs-tile main">
          <span>IPS {semester}</span>
          <b>{ips.ip?.toFixed(2) ?? "–"}</b>
          <small>{ips.sks} SKS{ips.projected ? " · perkiraan dari nilai sementara" : ""}</small>
        </div>
        <div className="crs-tile">
          <span>IPK</span>
          <b>{ipk.ip?.toFixed(2) ?? "–"}</b>
          <small>{ipk.sks} SKS tercatat</small>
        </div>
        <div className="crs-tile">
          <span>Mata kuliah</span>
          <b>{inSem.length}</b>
          <small>{inSem.reduce((s, c) => s + (c.sks || 0), 0)} SKS semester ini</small>
        </div>
        <div className="crs-tile">
          <span>Kelas hari ini</span>
          <b>{todayClasses.filter((b) => b.attendance !== "batal").length}</b>
          <small>{todayClasses.find((b) => b.end > nowMin && b.attendance !== "batal") ? `Berikutnya ${fmtMin(todayClasses.find((b) => b.end > nowMin && b.attendance !== "batal")!.start)}` : "Tidak ada lagi hari ini"}</small>
        </div>
      </section>
          </Fragment>
        ) : sec.id === "today" ? (
          <Fragment key="today">
      {todayClasses.length > 0 && (
        <section className="crs-today">
          {todayClasses.map((b) => (
            <ClassRow key={b.id} b={b} course={courses.items.find((c) => c.id === b.courseId)} onOpen={() => setOpen(b.courseId!)} go={go} />
          ))}
        </section>
      )}
          </Fragment>
        ) : null,
      )}

      <div className="toolbar">
        <div className="seg" role="tablist">
          {CRS_TABS.filter((t) => t.id === tab || !hiddenTabs.includes(t.id)).map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTabP(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <LayoutMenu layout={cl} title="Atur tampilan Kuliah" compact>
          <span className="lay-opt-label">Tab yang tampil</span>
          {CRS_TABS.map((t) => (
            <LayoutCheck key={t.id} label={t.label} checked={!hiddenTabs.includes(t.id)} onChange={(v) => cl.setOpt("hideTabs", v ? hiddenTabs.filter((x) => x !== t.id) : [...hiddenTabs, t.id])} />
          ))}
          <LayoutSeg label="Tinggi jam di jadwal mingguan" value={String(cl.opt("rowH", 52))} options={[["38", "Pendek"], ["52", "Sedang"], ["72", "Tinggi"]]} onChange={(v) => cl.setOpt("rowH", Number(v))} />
          <LayoutCheck label="Jadwal mingguan: tampilkan Minggu" checked={cl.opt("sunday", false)} onChange={(v) => cl.setOpt("sunday", v)} />
          <LayoutCheck label="Kartu mata kuliah: bilah kehadiran" checked={cl.opt("attBar", true)} onChange={(v) => cl.setOpt("attBar", v)} />
        </LayoutMenu>
      </div>

      {inSem.length === 0 && !courses.loading && (
        <div className="empty">
          <GraduationCap size={28} />
          <p className="empty-title">Belum ada mata kuliah di {semester}</p>
          <p className="empty-text">Tambahkan mata kuliah dengan jadwal mingguannya (hari, jam, ruang). Ruangku membuat semua pertemuan semester ini, melewati hari libur nasional.</p>
          <button className="btn btn-primary" onClick={() => setForm({})}>
            <Plus size={16} /> Mata kuliah
          </button>
        </div>
      )}

      {tab === "jadwal" && inSem.length > 0 && <WeekTimetable courses={inSem} onOpen={setOpen} sunday={cl.opt("sunday", false)} rowH={cl.opt("rowH", 52)} />}
      {tab === "matkul" && inSem.length > 0 && (
        <div className="crs-cards">
          {inSem.map((c) => {
            const st = attendanceStats(blocks.items, c.id, today, nowMin);
            const next = blocks.items.filter((b) => b.courseId === c.id && b.attendance !== "batal" && (b.date > today || (b.date === today && b.end > nowMin))).sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)[0];
            const g = courseGrade(c, scale);
            return (
              <button key={c.id} className={`crs-card cc-${c.color}`} onClick={() => setOpen(c.id)}>
                <span className="crs-card-top">
                  <b>{c.name}</b>
                  {g && <span className={`crs-grade ${g.projected ? "proj" : ""}`}>{g.letter}</span>}
                </span>
                <span className="muted small">
                  {[c.code, `${c.sks} SKS`, c.lecturer].filter(Boolean).join(" · ")}
                </span>
                <span className="crs-sess">
                  {c.sessions.map((s) => (
                    <span key={s.id}>
                      {DAY_NAMES[s.weekday].slice(0, 3)} {fmtMin(s.start)}–{fmtMin(s.end)}
                      {s.location ? ` · ${s.location}` : ""}
                    </span>
                  ))}
                </span>
                <span className="crs-att">
                  Kehadiran {st.percent ?? "–"}%{st.held ? ` (${st.hadir}/${st.held - st.unrecorded})` : ""}
                  {st.percent !== null && st.percent < c.minAttendance && <span className="crs-warn">di bawah {c.minAttendance}%</span>}
                </span>
                {st.percent !== null && cl.opt("attBar", true) && <Progress value={st.percent / 100} tone={st.percent < c.minAttendance ? "tertinggal" : "aman"} />}
                {next && <span className="small">Berikutnya: {parseDateKey(next.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })} {fmtMin(next.start)}</span>}
              </button>
            );
          })}
        </div>
      )}
      {tab === "nilai" && inSem.length > 0 && <GradesTable courses={visible} semester={semester} scaleId={prefs.scale} setScale={(s) => setPrefs((p) => ({ ...p, scale: s }))} onOpen={setOpen} />}

      {current && <CourseDrawer c={current} onClose={() => setOpen(null)} onEdit={() => setForm({ initial: current })} go={go} scaleId={prefs.scale} />}
      {form && <CourseForm initial={form.initial} onClose={() => setForm(null)} onSaved={(id) => (setForm(null), setOpen(id))} defaultSemester={semester} />}
    </div>
  );
}

// ---------- Baris kelas (hari ini / pertemuan) ----------
function ClassRow({ b, course, onOpen, go, n }: { b: Item<TimeBlock>; course?: Item<Course>; onOpen?: () => void; go: (p: Page) => void; n?: number | null }) {
  const blocks = useRecords<TimeBlock>("timeblock");
  const notes = useRecords<Note>("note");
  const toast = useToast();
  const set = (patch: Partial<TimeBlock>) => blocks.save({ ...strip(b), ...patch }, b.id);
  const exam = b.sessionId?.startsWith("ujian:");
  const makeNote = async () => {
    if (b.noteId && notes.items.some((x) => x.id === b.noteId)) return (requestOpen("note", b.noteId), go("notes"));
    const id = newId();
    const title = `${course ? courseLabel(course) : b.title}${n ? ` — Pertemuan ${n}` : ""}${b.topic ? `: ${b.topic}` : ""}`;
    const body = COURSE_NOTE_TEMPLATE.replace("**Mata kuliah:** ", `**Mata kuliah:** ${course ? courseLabel(course) : b.title}`)
      .replace("**Pertemuan ke-:** ", `**Pertemuan ke-:** ${n ?? ""} (${parseDateKey(b.date).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })})`)
      .replace("**Topik:** ", `**Topik:** ${b.topic ?? ""}`);
    await notes.save({ title, body, tags: ["kuliah"], icon: "🎓", projectId: course?.projectId }, id);
    await set({ noteId: id });
    toast("Catatan pertemuan dibuat");
    requestOpen("note", id);
    go("notes");
  };
  const past = b.date < dateKey() || (b.date === dateKey() && b.start <= new Date().getHours() * 60 + new Date().getMinutes());
  return (
    <div className={`crs-row ${b.attendance === "batal" ? "batal" : ""} ${exam ? "exam" : ""}`}>
      <span className="crs-row-n">{exam ? "📝" : n ?? (b.attendance === "batal" ? "–" : "")}</span>
      <span className="crs-row-when">
        <b>{parseDateKey(b.date).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" })}</b>
        <small>
          {fmtMin(b.start)}–{fmtMin(b.end)}
        </small>
      </span>
      <span className="crs-row-main">
        {onOpen ? (
          <button className="link crs-row-title" onClick={onOpen}>
            {b.title}
          </button>
        ) : (
          <input className="crs-topic" value={b.topic ?? ""} onChange={(e) => set({ topic: e.target.value || undefined })} placeholder={exam ? b.title : "Topik pertemuan…"} aria-label="Topik" />
        )}
        <span className="muted small">
          {b.location && (
            <>
              <MapPin size={11} /> {b.location}{" "}
            </>
          )}
          {b.link && (
            <button className="link small" onClick={() => api.openUrl(b.link!)}>
              <Video size={11} /> {linkPlatform(b.link)}
            </button>
          )}
        </span>
      </span>
      {!exam && (
        <select className={`crs-att-sel a-${b.attendance ?? "none"}`} value={b.attendance ?? ""} onChange={(e) => set({ attendance: (e.target.value || undefined) as Attendance | undefined })} aria-label="Presensi">
          <option value="">{past ? "Belum diisi" : "Presensi…"}</option>
          {(Object.keys(ATTENDANCE_LABEL) as Attendance[]).map((k) => (
            <option key={k} value={k}>{ATTENDANCE_LABEL[k]}</option>
          ))}
        </select>
      )}
      {!exam && (
        <button className={`icon-btn sm ${b.noteId ? "on" : ""}`} title={b.noteId ? "Buka catatan pertemuan" : "Buat catatan pertemuan"} aria-label="Catatan pertemuan" onClick={makeNote}>
          <FileText size={14} />
        </button>
      )}
    </div>
  );
}

// ---------- Jadwal mingguan ----------
function WeekTimetable({ courses, onOpen, sunday, rowH = 52 }: { courses: Item<Course>[]; onOpen: (id: string) => void; sunday?: boolean; rowH?: number }) {
  const sessions = courses.flatMap((c) => c.sessions.map((s) => ({ c, s })));
  const days = [1, 2, 3, 4, 5, 6, 0].filter((d) => d !== 0 || sunday || sessions.some((x) => x.s.weekday === 0));
  const minH = Math.max(6, Math.floor(Math.min(...sessions.map((x) => x.s.start), 7 * 60) / 60));
  const maxH = Math.min(23, Math.ceil(Math.max(...sessions.map((x) => x.s.end), 17 * 60) / 60));
  const hours = Array.from({ length: maxH - minH }, (_, i) => minH + i);
  const H = rowH;
  const todayDow = new Date().getDay();
  return (
    <div className="crs-week" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
      <div />
      {days.map((d) => (
        <div key={d} className={`crs-wd ${d === todayDow ? "today" : ""}`}>{DAY_NAMES[d]}</div>
      ))}
      <div className="crs-hours" style={{ height: hours.length * H }}>
        {hours.map((h) => (
          <span key={h} style={{ top: (h - minH) * H }}>{String(h).padStart(2, "0")}.00</span>
        ))}
      </div>
      {days.map((d) => (
        <div key={d} className={`crs-col ${d === todayDow ? "today" : ""}`} style={{ height: hours.length * H }}>
          {hours.map((h) => (
            <i key={h} className="crs-line" style={{ top: (h - minH) * H }} />
          ))}
          {sessions
            .filter((x) => x.s.weekday === d)
            .map(({ c, s }) => (
              <button key={c.id + s.id} className={`crs-slot cc-${c.color}`} style={{ top: ((s.start - minH * 60) / 60) * H, height: Math.max(26, ((s.end - s.start) / 60) * H - 3) }} onClick={() => onOpen(c.id)} title={`${courseLabel(c)} · ${fmtMin(s.start)}–${fmtMin(s.end)}${s.location ? ` · ${s.location}` : ""}`}>
                <b>{c.code || c.name}</b>
                <span>{c.code ? c.name : ""}</span>
                <small>
                  {fmtMin(s.start)}–{fmtMin(s.end)}
                  {s.location ? ` · ${s.location}` : ""}
                  {s.type && s.type !== "kuliah" ? ` · ${SESSION_TYPE_LABEL[s.type]}` : ""}
                </small>
              </button>
            ))}
        </div>
      ))}
    </div>
  );
}

// ---------- Nilai & IPK ----------
function GradesTable({ courses, semester, scaleId, setScale, onOpen }: { courses: Item<Course>[]; semester: string; scaleId: string; setScale: (s: string) => void; onOpen: (id: string) => void }) {
  const scale = scaleById(scaleId);
  const sems = [...new Set(courses.map((c) => c.semester))].sort().reverse();
  return (
    <div className="crs-grades">
      <div className="btn-row" style={{ alignItems: "center", marginBottom: 10 }}>
        <span className="muted small">Skala nilai</span>
        <select value={scaleId} onChange={(e) => setScale(e.target.value)}>
          {GRADE_SCALES.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <span className="muted small">{scale.steps.map((s) => `${s.letter} ≥ ${s.min}`).join(" · ")}</span>
      </div>
      {sems.map((sem) => {
        const list = courses.filter((c) => c.semester === sem);
        const ip = gpa(list, scale);
        return (
          <section key={sem} className={sem === semester ? "cur" : ""}>
            <h3>
              {sem} <span className="muted small">IPS {ip.ip?.toFixed(2) ?? "–"} · {ip.sks} SKS</span>
            </h3>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Mata kuliah</th>
                  <th className="num">SKS</th>
                  <th>Komponen</th>
                  <th className="num">Nilai</th>
                  <th>Huruf</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => {
                  const w = weightedScore(c.grading);
                  const g = courseGrade(c, scale);
                  return (
                    <tr key={c.id} onClick={() => onOpen(c.id)} className="clickable">
                      <td>
                        <b>{c.name}</b> <span className="muted small">{c.code}</span>
                      </td>
                      <td className="num">{c.sks}</td>
                      <td className="small">{c.grading.map((p) => `${p.name} ${p.weight}%${typeof p.score === "number" ? `: ${p.score}` : ""}`).join(" · ") || "–"}</td>
                      <td className="num">{c.finalLetter ? "–" : w.score ?? "–"}</td>
                      <td>
                        {g ? (
                          <span className={`crs-grade ${g.projected ? "proj" : ""}`} title={g.projected ? `Perkiraan dari ${w.covered}% komponen` : "Nilai akhir"}>
                            {g.letter}
                          </span>
                        ) : (
                          "–"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      <p className="muted small">Nilai bergaris putus-putus adalah perkiraan karena belum semua komponen terisi. Isi "Nilai akhir" di mata kuliah bila sudah keluar dari portal akademik.</p>
    </div>
  );
}

// ---------- Detail mata kuliah ----------
type DTab = "pertemuan" | "tugas" | "ujian" | "nilai";
function CourseDrawer({ c, onClose, onEdit, go, scaleId }: { c: Item<Course>; onClose: () => void; onEdit: () => void; go: (p: Page) => void; scaleId: string }) {
  const courses = useRecords<Course>(COURSE_KIND);
  const blocks = useRecords<TimeBlock>("timeblock");
  const tk = useTasks();
  const toast = useToast();
  const [tab, setTab] = useState<DTab>("pertemuan");
  const [newTask, setNewTask] = useState("");
  const [newDue, setNewDue] = useState("");
  const set = (patch: Partial<Course>) => courses.save({ ...strip(c), ...patch }, c.id);
  const today = dateKey();
  const meetings = numberedMeetings(blocks.items, c.id);
  const exams = blocks.items.filter((b) => b.courseId === c.id && b.sessionId?.startsWith("ujian:")).sort((a, b) => a.date.localeCompare(b.date));
  const st = attendanceStats(blocks.items, c.id, today, new Date().getHours() * 60 + new Date().getMinutes());
  const tasks = c.projectId ? tk.tasks.filter((t) => t.projectId === c.projectId && !t.parentId) : [];
  const scale = scaleById(scaleId);
  const w = weightedScore(c.grading);
  const g = courseGrade(c, scale);
  const upcomingIdx = meetings.findIndex((m) => m.block.date >= today);
  const [drawerW, setDrawerW, resetDrawerW] = usePaneWidth("course-drawer", 680, 460, 1100);
  useEffect(() => {
    if (tab === "pertemuan") window.setTimeout(() => document.querySelector(".crs-meetings [data-upcoming]")?.scrollIntoView({ block: "center" }), 50);
  }, [tab, c.id]);

  return (
    <div className="crs-drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="crs-drawer" role="dialog" aria-label={c.name} style={{ width: `min(${drawerW}px, 96vw)` }}>
        <PaneResizer value={drawerW} onChange={setDrawerW} onReset={resetDrawerW} edge="right" min={460} max={1100} label="Lebar panel mata kuliah" style={{ left: 0, right: "auto" }} />
        <header className={`crs-d-head cc-${c.color}`}>
          <div>
            <p className="muted small">{[c.code, `${c.sks} SKS`, c.semester].filter(Boolean).join(" · ")}</p>
            <h2>{c.name}</h2>
            <p className="small">
              {c.lecturer && <>👤 {c.lecturer} </>}
              {c.link && (
                <button className="link small" onClick={() => api.openUrl(c.link!)}>
                  <ExternalLink size={12} /> {linkPlatform(c.link) === "Tautan" ? "Kelas daring / LMS" : linkPlatform(c.link)}
                </button>
              )}
            </p>
          </div>
          <div className="btn-row">
            <button className="icon-btn" onClick={onEdit} aria-label="Ubah mata kuliah" title="Ubah mata kuliah">
              <Settings2 size={16} />
            </button>
            <button className="icon-btn" onClick={onClose} aria-label="Tutup">
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="crs-d-stats">
          <span>
            Kehadiran <b>{st.percent ?? "–"}%</b> <small className="muted">min. {c.minAttendance}%</small>
          </span>
          <span>
            Pertemuan <b>{meetings.filter((m) => m.n).length}</b>
          </span>
          <span>
            Nilai <b>{g ? g.letter : "–"}</b> {w.score !== null && !c.finalLetter && <small className="muted">({w.score})</small>}
          </span>
          {c.projectId && (
            <button className="link small" onClick={() => go("projects")}>
              Proyek mata kuliah
            </button>
          )}
        </div>
        <div className="seg seg-full" role="tablist">
          {(["pertemuan", "tugas", "ujian", "nilai"] as DTab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
              {t === "pertemuan" ? "Pertemuan" : t === "tugas" ? `Tugas${tasks.filter((x) => !isTaskDone(x, tk.projects)).length ? ` (${tasks.filter((x) => !isTaskDone(x, tk.projects)).length})` : ""}` : t === "ujian" ? "Ujian" : "Nilai"}
            </button>
          ))}
        </div>
        <div className="crs-d-body">
          {tab === "pertemuan" && (
            <div className="crs-meetings">
              {meetings.length === 0 && <p className="muted small pad">Belum ada pertemuan. Atur jadwal mingguan dan periode kuliah di pengaturan mata kuliah.</p>}
              {meetings.map((m, i) => (
                <div key={m.block.id} data-upcoming={i === upcomingIdx ? "" : undefined}>
                  <ClassRow b={m.block} course={c} n={m.n} go={go} />
                </div>
              ))}
              <p className="muted small">Hapus pertemuan di Kalender = kelas batal (tidak dihitung presensi). Presensi: {st.hadir} hadir, {st.izin} izin, {st.sakit} sakit, {st.alpa} alpa{st.unrecorded ? `, ${st.unrecorded} belum diisi` : ""}.</p>
            </div>
          )}
          {tab === "tugas" && (
            <div className="crs-tasks">
              {!c.projectId ? (
                <div className="pad">
                  <p className="small">Hubungkan mata kuliah ke proyek supaya tugas, catatan, dan file kuliah terkumpul di satu tempat.</p>
                  <button
                    className="btn btn-sm"
                    onClick={async () => {
                      const parent = tk.projects.find((p) => /kuliah|kampus|akademik/i.test(p.name) && !p.parentId);
                      const pid = await tk.saveProject({ name: c.name, color: c.color, statuses: parent?.statuses ?? DEFAULT_STATUSES, parentId: parent?.id, icon: "🎓" });
                      await set({ projectId: pid });
                      toast(`Subproyek "${c.name}" dibuat${parent ? ` di bawah ${parent.name}` : ""}`);
                    }}
                  >
                    <Plus size={14} /> Buat subproyek untuk mata kuliah ini
                  </button>
                </div>
              ) : (
                <>
                  <form
                    className="crs-addtask"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!newTask.trim()) return;
                      await tk.create({ title: newTask.trim(), projectId: c.projectId!, due: newDue || undefined, tags: ["kuliah"] });
                      setNewTask("");
                      setNewDue("");
                    }}
                  >
                    <input className="grow" value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Tugas kuliah baru, mis. Laporan praktikum 3" />
                    <input type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} aria-label="Tenggat" />
                    <button className="btn btn-sm btn-primary" type="submit">
                      <Plus size={14} /> Tambah
                    </button>
                  </form>
                  <ul className="crs-tasklist">
                    {tasks
                      .sort((a, b) => Number(isTaskDone(a, tk.projects)) - Number(isTaskDone(b, tk.projects)) || (a.due ?? "9").localeCompare(b.due ?? "9"))
                      .map((t) => {
                        const done = isTaskDone(t, tk.projects);
                        return (
                          <li key={t.id} className={done ? "done" : ""}>
                            <button className="crs-check" aria-label={done ? "Buka lagi" : "Selesai"} onClick={() => tk.update(t.id, { status: done ? (tk.projects.find((p) => p.id === t.projectId)?.statuses ?? DEFAULT_STATUSES).find((s) => !s.done)!.id : (tk.projects.find((p) => p.id === t.projectId)?.statuses ?? DEFAULT_STATUSES).find((s) => s.done)!.id })}>
                              {done && <Check size={12} />}
                            </button>
                            <button className="link" onClick={() => (requestOpen("task", t.id), go("tasks"))}>
                              {t.title}
                            </button>
                            {t.due && <span className={`small ${!done && t.due < today ? "text-danger" : "muted"}`}>{parseDateKey(t.due).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}</span>}
                          </li>
                        );
                      })}
                    {tasks.length === 0 && <li className="muted small pad">Belum ada tugas.</li>}
                  </ul>
                </>
              )}
            </div>
          )}
          {tab === "ujian" && (
            <div className="crs-exams">
              {c.exams.map((e) => (
                <ExamRow key={e.id} e={e} onChange={(x) => set({ exams: c.exams.map((y) => (y.id === e.id ? x : y)) })} onRemove={() => set({ exams: c.exams.filter((y) => y.id !== e.id) })} />
              ))}
              <div className="btn-row">
                {(["UTS", "UAS", "Kuis", "Presentasi"] as CourseExam["kind"][]).map((k) => (
                  <button key={k} className="chip-btn" onClick={() => set({ exams: [...c.exams, { id: newId(), kind: k, date: today, start: 8 * 60, end: 10 * 60, location: c.sessions[0]?.location }] })}>
                    <Plus size={12} /> {k}
                  </button>
                ))}
              </div>
              {exams.length > 0 && <p className="muted small">Ujian tampil di Kalender dan rangkuman pagi, dengan pengingat sebelum mulai.</p>}
            </div>
          )}
          {tab === "nilai" && (
            <div className="crs-grading">
              {c.grading.map((p) => (
                <GradeRow key={p.id} p={p} onChange={(x) => set({ grading: c.grading.map((y) => (y.id === p.id ? x : y)) })} onRemove={() => set({ grading: c.grading.filter((y) => y.id !== p.id) })} />
              ))}
              <button className="chip-btn" onClick={() => set({ grading: [...c.grading, { id: newId(), name: "Komponen", weight: 10 }] })}>
                <Plus size={12} /> Komponen nilai
              </button>
              <p className="small">
                Total bobot {w.totalWeight}%{w.totalWeight !== 100 && <span className="text-danger"> (sebaiknya 100%)</span>}. Nilai sementara: <b>{w.score ?? "–"}</b>
                {w.score !== null && ` → ${courseGrade({ grading: c.grading }, scale)?.letter}`} dari {w.covered}% komponen.
              </p>
              <label className="inline-field">
                Nilai akhir resmi
                <input value={c.finalLetter ?? ""} onChange={(e) => set({ finalLetter: e.target.value.toUpperCase() || undefined })} placeholder="mis. AB" style={{ width: 80 }} />
              </label>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function ExamRow({ e, onChange, onRemove }: { e: CourseExam; onChange: (e: CourseExam) => void; onRemove: () => void }) {
  return (
    <div className="crs-exam">
      <select value={e.kind} onChange={(x) => onChange({ ...e, kind: x.target.value as CourseExam["kind"] })} aria-label="Jenis">
        {["UTS", "UAS", "Kuis", "Presentasi", "Lainnya"].map((k) => (
          <option key={k}>{k}</option>
        ))}
      </select>
      <input type="date" value={e.date} onChange={(x) => x.target.value && onChange({ ...e, date: x.target.value })} aria-label="Tanggal" />
      <TimeInput value={e.start} onChange={(v) => onChange({ ...e, start: v, end: Math.max(e.end, v + 30) })} label="Mulai" />
      <TimeInput value={e.end} onChange={(v) => onChange({ ...e, end: Math.max(v, e.start + 15) })} label="Selesai" />
      <input className="grow" value={e.location ?? ""} onChange={(x) => onChange({ ...e, location: x.target.value || undefined })} placeholder="Ruang" />
      <button className="icon-btn sm" onClick={onRemove} aria-label="Hapus ujian">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function GradeRow({ p, onChange, onRemove }: { p: GradePart; onChange: (p: GradePart) => void; onRemove: () => void }) {
  return (
    <div className="crs-gr">
      <input className="grow" value={p.name} onChange={(e) => onChange({ ...p, name: e.target.value })} aria-label="Komponen" />
      <label className="inline-field">
        Bobot <input type="number" min={0} max={100} value={p.weight} onChange={(e) => onChange({ ...p, weight: Number(e.target.value) || 0 })} style={{ width: 64 }} />%
      </label>
      <label className="inline-field">
        Nilai <input type="number" min={0} max={100} step="0.1" value={p.score ?? ""} onChange={(e) => onChange({ ...p, score: e.target.value === "" ? undefined : Number(e.target.value) })} style={{ width: 70 }} placeholder="–" />
      </label>
      <button className="icon-btn sm" onClick={onRemove} aria-label="Hapus komponen">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ---------- Formulir mata kuliah ----------
function CourseForm({ initial, onClose, onSaved, defaultSemester }: { initial?: Item<Course>; onClose: () => void; onSaved: (id: string) => void; defaultSemester: string }) {
  const courses = useRecords<Course>(COURSE_KIND);
  const scope = useScope();
  const tk = useTasks();
  const toast = useToast();
  const [del, setDel] = useState(false);
  const now = new Date();
  const [c, setC] = useState<Course>(
    initial
      ? strip(initial)
      : {
          name: "",
          sks: 3,
          semester: defaultSemester,
          start: dateKey(now),
          end: dateKey(new Date(now.getFullYear(), now.getMonth() + 4, now.getDate())),
          sessions: [{ id: newId(), weekday: 1, start: 7 * 60 + 30, end: 9 * 60 + 10, type: "kuliah" }],
          color: COLORS[courses.items.length % COLORS.length],
          skipHolidays: true,
          exams: [],
          grading: [
            { id: newId(), name: "Tugas", weight: 30 },
            { id: newId(), name: "UTS", weight: 30 },
            { id: newId(), name: "UAS", weight: 40 },
          ],
          minAttendance: 75,
        },
  );
  const [makeProject, setMakeProject] = useState(!initial);
  const kuliahRoot = tk.projects.find((p) => /kuliah|kampus|akademik/i.test(p.name) && !p.parentId);
  const [parentId, setParentId] = useState<string | undefined>(kuliahRoot?.id);
  const up = (patch: Partial<Course>) => setC((x) => ({ ...x, ...patch }));
  const upS = (id: string, patch: Partial<CourseSession>) => up({ sessions: c.sessions.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  const save = async () => {
    if (!c.name.trim()) return toast("Isi nama mata kuliah", "error");
    let projectId = c.projectId;
    if (!initial && makeProject && !projectId) {
      const parent = tk.projects.find((p) => p.id === parentId);
      projectId = await tk.saveProject({ name: c.name.trim(), color: c.color, statuses: parent?.statuses ?? DEFAULT_STATUSES, parentId, icon: "🎓" });
    }
    const id = initial?.id ?? newId();
    await courses.save({ ...c, name: c.name.trim(), link: normalizeLink(c.link), projectId }, id);
    toast(initial ? "Mata kuliah diperbarui. Pertemuan mendatang ikut menyesuaikan." : "Mata kuliah dibuat. Pertemuan satu semester sedang ditambahkan ke jadwal.");
    onSaved(id);
  };

  return (
    <Modal
      title={initial ? "Ubah mata kuliah" : "Mata kuliah baru"}
      onClose={onClose}
      wide
      footer={
        <>
          {initial && (
            <button className="btn btn-danger" style={{ marginRight: "auto" }} onClick={() => setDel(true)}>
              <Trash2 size={14} /> Hapus
            </button>
          )}
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={save}>{initial ? "Simpan" : "Buat mata kuliah"}</button>
        </>
      }
    >
      <div className="form">
        <div className="form-row">
          <Field label="Nama mata kuliah">
            <input value={c.name} onChange={(e) => up({ name: e.target.value })} placeholder="Mis. Pemrograman untuk AI & Data Science" />
          </Field>
          <div className="form-row">
            <Field label="Kode">
              <input value={c.code ?? ""} onChange={(e) => up({ code: e.target.value || undefined })} placeholder="AI5101" />
            </Field>
            <Field label="SKS">
              <input type="number" min={0} max={24} value={c.sks} onChange={(e) => up({ sks: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        </div>
        <div className="form-row">
          <Field label="Dosen">
            <input value={c.lecturer ?? ""} onChange={(e) => up({ lecturer: e.target.value || undefined })} placeholder="Nama dosen" />
          </Field>
          <Field label="Kontak dosen">
            <input value={c.lecturerContact ?? ""} onChange={(e) => up({ lecturerContact: e.target.value || undefined })} placeholder="Email / WA (opsional)" />
          </Field>
        </div>
        <div className="form-row form-row-4">
          <Field label="Semester">
            <input value={c.semester} onChange={(e) => up({ semester: e.target.value })} />
          </Field>
          <Field label="Kuliah mulai">
            <input type="date" value={c.start} onChange={(e) => up({ start: e.target.value })} />
          </Field>
          <Field label="Kuliah selesai">
            <input type="date" value={c.end} onChange={(e) => up({ end: e.target.value })} />
          </Field>
          <Field label="Min. kehadiran">
            <input type="number" min={0} max={100} value={c.minAttendance} onChange={(e) => up({ minAttendance: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <Field label="Jadwal mingguan">
          <div className="crs-sessions">
            {c.sessions.map((s) => (
              <div key={s.id} className="crs-session">
                <select value={s.weekday} onChange={(e) => upS(s.id, { weekday: Number(e.target.value) })} aria-label="Hari">
                  {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                    <option key={d} value={d}>{DAY_NAMES[d]}</option>
                  ))}
                </select>
                <TimeInput value={s.start} onChange={(v) => upS(s.id, { start: v, end: v + (s.end - s.start) })} label="Mulai" />
                <span>–</span>
                <TimeInput value={s.end} onChange={(v) => upS(s.id, { end: Math.max(v, s.start + 15) })} label="Selesai" />
                <input className="grow" value={s.location ?? ""} onChange={(e) => upS(s.id, { location: e.target.value || undefined })} placeholder="Ruang, mis. 7602" />
                <select value={s.type ?? "kuliah"} onChange={(e) => upS(s.id, { type: e.target.value as CourseSession["type"] })} aria-label="Jenis">
                  {Object.entries(SESSION_TYPE_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <button className="icon-btn sm" disabled={c.sessions.length < 2} onClick={() => up({ sessions: c.sessions.filter((x) => x.id !== s.id) })} aria-label="Hapus sesi">
                  <X size={13} />
                </button>
              </div>
            ))}
            <button className="chip-btn" onClick={() => up({ sessions: [...c.sessions, { ...c.sessions[c.sessions.length - 1], id: newId(), weekday: (c.sessions[c.sessions.length - 1]?.weekday ?? 1) + 2 > 6 ? 1 : (c.sessions[c.sessions.length - 1]?.weekday ?? 1) + 2 }] })}>
              <Plus size={12} /> Sesi lain (mis. praktikum)
            </button>
          </div>
        </Field>
        <div className="form-row">
          <Field label="Tautan kelas daring / LMS" hint={c.link ? linkPlatform(normalizeLink(c.link)) ?? undefined : "Zoom, Meet, Teams, Edunex, Classroom…"}>
            <input value={c.link ?? ""} onChange={(e) => up({ link: e.target.value || undefined })} placeholder="https://…" />
          </Field>
          <Field label="Warna">
            <div className="btn-row">
              {COLORS.map((col) => (
                <button key={col} type="button" className={`crs-color cc-${col} ${c.color === col ? "on" : ""}`} onClick={() => up({ color: col })} aria-label={col} />
              ))}
            </div>
          </Field>
        </div>
        <div className="form-row">
          {initial ? (
            <Field label="Proyek">
              <ProjectSelect value={c.projectId} onChange={(projectId) => up({ projectId })} projects={scope.allProjects} />
            </Field>
          ) : (
            <Field label="Proyek" hint="Tugas, catatan, dan file kuliah terkumpul di subproyek ini">
              <label className="check-row">
                <input type="checkbox" checked={makeProject} onChange={(e) => setMakeProject(e.target.checked)} /> Buat subproyek di bawah
              </label>
              {makeProject && <ProjectSelect value={parentId} onChange={setParentId} projects={scope.allProjects} emptyLabel="(tingkat atas)" />}
            </Field>
          )}
          <Field label="Pilihan">
            <label className="check-row">
              <input type="checkbox" checked={c.skipHolidays} onChange={(e) => up({ skipHolidays: e.target.checked })} /> Lewati hari libur nasional
            </label>
            <label className="check-row">
              <input type="checkbox" checked={c.notify !== "off"} onChange={(e) => up({ notify: e.target.checked ? undefined : "off" })} /> Ingatkan sebelum kelas
            </label>
          </Field>
        </div>
        <p className="muted small">
          <CalendarClock size={12} /> Ruangku membuat {c.sessions.length} sesi × pekan antara {c.start} dan {c.end}. Pertemuan yang sudah diisi presensi/topik/catatan tidak diubah bila jadwal diganti.
        </p>
      </div>
      {del && initial && (
        <Confirm
          title="Hapus mata kuliah?"
          text={`"${initial.name}" dan pertemuan mendatangnya dihapus dari jadwal. Pertemuan yang sudah berisi presensi atau catatan tetap disimpan. Subproyek, tugas, dan catatannya tidak ikut terhapus.`}
          confirmLabel="Hapus mata kuliah"
          onConfirm={async () => {
            await courses.remove(initial.id);
            onClose();
          }}
          onClose={() => setDel(false)}
        />
      )}
    </Modal>
  );
}

