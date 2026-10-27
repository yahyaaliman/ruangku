// Palet perintah (Ctrl+K): cari tugas, catatan, proyek, OKR, KPI, halaman, dan jalankan aksi.
import "./palette.css";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarDays, GraduationCap, Handshake, CheckCircle2, Circle, CornerDownLeft, FilePlus2, FileText, Gauge, Plus, Search, Target } from "lucide-react";
import type { Item, Kpi, Note, Objective, TimeBlock } from "../lib/types";
import type { Task } from "../lib/tasks";
import { isTaskDone, projectOf } from "../lib/tasks";
import { useRecords } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { highlight, rank } from "../lib/fuzzy";
import { parseQuick } from "../lib/quickParse";
import { dateKey, dayLong, parseDateKey, quarterLabel, relativeDay } from "../lib/date";
import { projectPath } from "../lib/projects";
import { fmtMin } from "../lib/timeblocks";
import { requestOpen } from "../lib/deeplink";
import { ProjectMark } from "../projects/ProjectSwitcher";
import { newId } from "../lib/api";

export interface PaletteAction {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  keywords?: string;
  run: () => void | Promise<void>;
  /** Tampil di daftar awal (tanpa kueri) */
  featured?: boolean;
}

export interface PalettePage {
  id: string;
  label: string;
  icon: typeof Search;
  key?: string;
}

interface Row {
  key: string;
  group: string;
  icon: ReactNode;
  label: string;
  sub?: string;
  hint?: string;
  score: number;
  run: (mod: "enter" | "ctrl" | "shift") => void | Promise<void>;
  alt?: string;
  alt2?: string;
}

const RECENT = "ruangku-palette-recent";
function recent(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT) ?? "[]");
  } catch {
    return [];
  }
}
function pushRecent(key: string) {
  try {
    localStorage.setItem(RECENT, JSON.stringify([key, ...recent().filter((k) => k !== key)].slice(0, 8)));
  } catch {
    /* abaikan */
  }
}

/** Sorot elemen yang baru dibuka (mis. kartu OKR/KPI) setelah halaman tampil. */
export function flashElement(id: string, tries = 12) {
  const el = document.querySelector<HTMLElement>(`[data-oid="${CSS.escape(id)}"]`);
  if (!el) {
    if (tries > 0) window.setTimeout(() => flashElement(id, tries - 1), 80);
    return;
  }
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.classList.remove("flash");
  void el.offsetWidth;
  el.classList.add("flash");
}

export default function CommandPalette({
  onClose,
  go,
  pages,
  actions,
  createTask,
  toggleTask,
  startTimer,
}: {
  onClose: () => void;
  go: (page: string) => void;
  pages: PalettePage[];
  actions: PaletteAction[];
  createTask: (title: string) => Promise<void>;
  toggleTask: (t: Item<Task>) => Promise<void>;
  startTimer: (t: Item<Task>) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const scope = useScope();
  const tasks = useRecords<Task>("task");
  const notes = useRecords<Note>("note");
  const objectives = useRecords<Objective>("objective");
  const kpis = useRecords<Kpi>("kpi");
  const blocks = useRecords<TimeBlock>("timeblock");
  const projects = scope.allProjects;

  useEffect(() => input.current?.focus(), []);

  const rows = useMemo<Row[]>(() => {
    const query = q.trim();
    const isAction = query.startsWith(">");
    const term = isAction ? query.slice(1).trim() : query;
    const out: Row[] = [];
    const add = (r: Row) => out.push(r);
    const pIcon = (id?: string) => <ProjectMark p={id ? projects.find((p) => p.id === id) : undefined} />;

    // --- Aksi
    for (const r of rank(actions, term, (a) => `${a.label} ${a.keywords ?? ""}`)) {
      if (!term && !isAction && !r.item.featured) continue;
      add({ key: `a:${r.item.id}`, group: "Aksi", icon: <r.item.icon size={15} />, label: r.item.label, hint: r.item.hint, score: r.score + (isAction ? 50 : 4), run: () => r.item.run() });
    }
    if (isAction) return out;

    if (term) {
      const parsed = parseQuick(term, new Date(), projects.map((p) => p.name));
      add({
        key: "new-task",
        group: "Buat",
        icon: <Plus size={15} />,
        label: `Tugas baru: ${parsed.title || term}`,
        sub: [parsed.due && relativeDay(parseDateKey(parsed.due).getTime()), parsed.project && `@${parsed.project}`, parsed.priority && `!${parsed.priority}`].filter(Boolean).join(" · ") || (scope.current ? `di ${scope.current.name}` : "di Inbox"),
        score: 1,
        run: () => createTask(term),
      });
      add({
        key: "new-note",
        group: "Buat",
        icon: <FilePlus2 size={15} />,
        label: `Catatan baru: ${term}`,
        score: 0.5,
        run: async () => {
          const id = newId();
          await notes.save({ title: term, body: "", tags: [], projectId: scope.defaultProjectId }, id);
          requestOpen("note", id);
          go("notes");
        },
      });
      // Tanggal → buka kalender pada hari itu.
      const d = parsed.due && parsed.title.length < term.length ? parsed.due : /^\d{4}-\d{2}-\d{2}$/.test(term) ? term : null;
      if (d)
        add({
          key: `date:${d}`,
          group: "Kalender",
          icon: <CalendarDays size={15} />,
          label: `Buka kalender: ${dayLong(parseDateKey(d).getTime())}`,
          score: 40,
          run: () => {
            requestOpen("date", d);
            go("calendar");
          },
        });
    }

    // --- Halaman
    for (const r of rank(pages, term, (p) => p.label)) {
      if (!term) continue;
      add({ key: `p:${r.item.id}`, group: "Halaman", icon: <r.item.icon size={15} />, label: r.item.label, hint: r.item.key ? `Ctrl+${r.item.key}` : undefined, score: r.score + 6, run: () => go(r.item.id) });
    }

    if (!term) {
      // Daftar awal: item terakhir dibuka lalu tugas yang mendesak.
      const keys = recent();
      const today = dateKey();
      const urgent = tasks.items
        .filter((t) => !t.parentId && !isTaskDone(t, projects) && scope.match(t.projectId) && t.due && t.due <= today)
        .sort((a, b) => (a.due ?? "").localeCompare(b.due ?? ""))
        .slice(0, 5);
      const recentTasks = keys.filter((k) => k.startsWith("t:")).map((k) => tasks.items.find((t) => t.id === k.slice(2))).filter(Boolean) as Item<Task>[];
      const recentNotes = keys.filter((k) => k.startsWith("n:")).map((k) => notes.items.find((n) => n.id === k.slice(2))).filter(Boolean) as Item<Note>[];
      for (const t of [...recentTasks, ...urgent.filter((u) => !recentTasks.includes(u))].slice(0, 7)) out.push(taskRow(t, 0, recentTasks.includes(t) ? "Terakhir dibuka" : "Tenggat hari ini & terlewat"));
      for (const n of recentNotes.slice(0, 3)) out.push(noteRow(n, 0, "Terakhir dibuka"));
      return out;
    }

    // --- Proyek
    for (const r of rank(projects, term, (p) => projectPath(projects, p.id))) {
      const p = r.item;
      add({
        key: `pj:${p.id}`,
        group: "Proyek",
        icon: pIcon(p.id),
        label: p.name,
        sub: p.parentId ? projectPath(projects, p.parentId) : undefined,
        hint: "Pilih",
        alt: "Ctrl+Enter: buka timeline",
        score: r.score + 3,
        run: (mod) => {
          scope.setScope(p.id);
          go(mod === "ctrl" ? "projects" : "tasks");
        },
      });
    }

    function taskRow(t: Item<Task>, s: number, group = "Tugas"): Row {
      const done = isTaskDone(t, projects);
      const proj = projectOf(projects, t.projectId);
      return {
        key: `t:${t.id}`,
        group,
        icon: done ? <CheckCircle2 size={15} className="ok" /> : <Circle size={15} />,
        label: t.title,
        sub: [proj.name, t.due && relativeDay(parseDateKey(t.due).getTime())].filter(Boolean).join(" · "),
        alt: done ? "Ctrl+Enter: buka lagi" : "Ctrl+Enter: selesai",
        alt2: done ? undefined : "Shift+Enter: mulai timer",
        score: s - (done ? 6 : 0),
        run: async (mod) => {
          if (mod === "ctrl") return toggleTask(t);
          if (mod === "shift" && !done) return startTimer(t);
          requestOpen("task", t.id);
          go("tasks");
        },
      };
    }
    function noteRow(n: Item<Note>, s: number, group = "Catatan"): Row {
      return {
        key: `n:${n.id}`,
        group,
        icon: n.icon ? <span className="cp-emoji">{n.icon}</span> : <FileText size={15} />,
        label: n.title || "Tanpa judul",
        sub: n.date ? `Catatan harian · ${n.date}` : n.projectId ? projectOf(projects, n.projectId).name : undefined,
        score: s,
        run: () => {
          requestOpen("note", n.id);
          go("notes");
        },
      };
    }

    for (const r of rank(tasks.items, term, (t) => `${t.title} ${(t.tags ?? []).join(" ")}`, 30)) out.push(taskRow(r.item, r.score + (scope.match(r.item.projectId) ? 2 : 0)));
    for (const r of rank(notes.items.filter((n) => !n.isTemplate), term, (n) => `${n.title} ${n.tags.join(" ")}`, 20)) out.push(noteRow(r.item, r.score));
    // Isi catatan: hanya bila judul tidak cocok, skor lebih rendah.
    if (term.length >= 3) {
      const titleHits = new Set(out.filter((x) => x.key.startsWith("n:")).map((x) => x.key));
      for (const r of rank(notes.items.filter((n) => !n.isTemplate && !titleHits.has(`n:${n.id}`)), term, (n) => n.body.replace(/<[^>]+>/g, " "), 8)) {
        const row = noteRow(r.item, r.score - 12);
        const body = r.item.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
        const i = body.toLowerCase().indexOf(term.toLowerCase().split(/\s+/)[0]);
        row.sub = `…${body.slice(Math.max(0, i - 20), i + 50)}…`;
        out.push(row);
      }
    }
    const openOkrKpi = (page: "okr" | "kpi", id: string, projectId?: string) => {
      if (!scope.match(projectId)) scope.setScope(projectId ?? "all");
      if (page === "okr") requestOpen("objective", id);
      go(page);
      if (page === "kpi") flashElement(id);
    };
    for (const r of rank(objectives.items, term, (o) => o.title, 8))
      add({ key: `o:${r.item.id}`, group: "OKR", icon: <Target size={15} />, label: r.item.title, sub: quarterLabel(r.item.period), score: r.score, run: () => openOkrKpi("okr", r.item.id, r.item.projectId) });
    // Blok jadwal ±60 hari dari hari ini → buka kalender pada tanggalnya.
    const today = dateKey();
    const near = (d: string) => Math.abs(parseDateKey(d).getTime() - parseDateKey(today).getTime()) / 86400000;
    for (const r of rank(blocks.items.filter((b) => !b.tracked && near(b.date) <= 60), term, (b) => b.title, 12)
      .sort((a, b) => b.score - a.score || near(a.item.date) - near(b.item.date))
      .slice(0, 5))
      add({
        key: `b:${r.item.id}`,
        group: r.item.meetingId ? "Rapat" : r.item.courseId ? "Kuliah" : "Jadwal",
        icon: r.item.meetingId ? <Handshake size={15} /> : r.item.courseId ? <GraduationCap size={15} /> : <CalendarDays size={15} />,
        label: r.item.title,
        sub: `${r.item.meetingId ? "Rapat · " : r.item.courseId ? "Kuliah · " : ""}${relativeDay(parseDateKey(r.item.date).getTime())} · ${fmtMin(r.item.start)}–${fmtMin(r.item.end)}${r.item.location ? ` · ${r.item.location}` : ""}`,
        score: r.score - near(r.item.date) / 30,
        run: () => {
          if (r.item.meetingId) return requestOpen("meeting", r.item.meetingId), go("meetings");
          if (r.item.courseId) return requestOpen("course", r.item.courseId), go("courses");
          requestOpen("date", r.item.date);
          go("calendar");
        },
      });
    for (const r of rank(kpis.items, term, (k) => k.name, 8))
      add({ key: `k:${r.item.id}`, group: "KPI", icon: <Gauge size={15} />, label: r.item.name, sub: r.item.unit, score: r.score, run: () => openOkrKpi("kpi", r.item.id, r.item.projectId) });
    return out;
  }, [q, actions, pages, projects, tasks.items, notes.items, objectives.items, kpis.items, blocks.items, scope, go, createTask, toggleTask, startTimer, notes.save]);

  // Kelompokkan: urutan grup ikut skor tertinggi di grup itu.
  const grouped = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of rows) (groups.get(r.group) ?? groups.set(r.group, []).get(r.group)!).push(r);
    const order = q.trim() ? [...groups.entries()].sort((a, b) => Math.max(...b[1].map((x) => x.score)) - Math.max(...a[1].map((x) => x.score))) : [...groups.entries()];
    return order.map(([g, rs]) => [g, q.trim() ? rs.sort((a, b) => b.score - a.score).slice(0, g === "Tugas" ? 8 : 6) : rs] as const);
  }, [rows, q]);
  const flat = grouped.flatMap(([, rs]) => rs);

  useEffect(() => setSel(0), [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  const run = async (r: Row | undefined, mod: "enter" | "ctrl" | "shift") => {
    if (!r) return;
    if (/^(t|n|o|k|pj):/.test(r.key)) pushRecent(r.key);
    onClose();
    await r.run(mod);
  };

  const term = q.trim().replace(/^>/, "").trim();
  const cur = flat[sel];
  let i = -1;
  return (
    <div className="cp-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cp" role="dialog" aria-modal="true" aria-label="Palet perintah">
        <label className="cp-input">
          <Search size={17} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari tugas, catatan, proyek… atau ketik > untuk aksi"
            role="combobox"
            aria-expanded="true"
            aria-controls="cp-list"
            aria-activedescendant={cur ? `cp-${sel}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSel((s) => Math.min(flat.length - 1, s + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === "PageDown") {
                e.preventDefault();
                setSel((s) => Math.min(flat.length - 1, s + 8));
              } else if (e.key === "PageUp") {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 8));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(cur, e.ctrlKey || e.metaKey ? "ctrl" : e.shiftKey ? "shift" : "enter");
              }
            }}
          />
          <kbd>Esc</kbd>
        </label>
        <ul className="cp-list" id="cp-list" role="listbox" ref={list}>
          {grouped.map(([g, rs]) => (
            <li key={g} role="presentation">
              <p className="cp-group">{g}</p>
              <ul role="presentation">
                {rs.map((r) => {
                  i++;
                  const idx = i;
                  return (
                    <li
                      key={r.key}
                      id={`cp-${idx}`}
                      data-i={idx}
                      role="option"
                      aria-selected={idx === sel}
                      className={`cp-row ${idx === sel ? "on" : ""}`}
                      onMouseMove={() => idx !== sel && setSel(idx)}
                      onClick={(e) => run(r, e.ctrlKey || e.metaKey ? "ctrl" : e.shiftKey ? "shift" : "enter")}
                    >
                      <span className="cp-icon">{r.icon}</span>
                      <span className="cp-text">
                        <span className="cp-label">
                          {highlight(r.label, term).map((h, j) => (h.hit ? <mark key={j}>{h.text}</mark> : <span key={j}>{h.text}</span>))}
                        </span>
                        {r.sub && <small>{r.sub}</small>}
                      </span>
                      {r.hint && <span className="cp-hint">{r.hint}</span>}
                      {idx === sel && <CornerDownLeft size={13} className="cp-enter" />}
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}
          {flat.length === 0 && <li className="cp-empty">Tidak ada yang cocok dengan "{term}".</li>}
        </ul>
        <footer className="cp-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> pilih
          </span>
          <span>
            <kbd>Enter</kbd> buka
          </span>
          {cur?.alt && <span>{cur.alt}</span>}
          {cur?.alt2 && <span>{cur.alt2}</span>}
          <span className="cp-foot-r">
            <ArrowRight size={12} /> <kbd>&gt;</kbd> hanya aksi
          </span>
        </footer>
      </div>
    </div>
  );
}
