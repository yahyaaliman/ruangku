import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, FolderKanban, Layers, Plus, Search } from "lucide-react";
import { useScope } from "../lib/scope";
import { flatTree, projectPath } from "../lib/projects";
import type { Item } from "../lib/types";
import type { Project } from "../lib/tasks";

/** Titik warna / ikon proyek. */
export function ProjectMark({ p, size = "md" }: { p: Pick<Project, "color" | "icon"> | null | undefined; size?: "sm" | "md" | "lg" }) {
  if (!p) return <Layers size={size === "lg" ? 18 : 14} className="pm-all" aria-hidden="true" />;
  if (p.icon) return <span className={`pm-icon pm-${size}`} aria-hidden="true">{p.icon}</span>;
  return <i className={`tk-pdot bc-${p.color} pm-${size}`} aria-hidden="true" />;
}

/** Pilihan proyek untuk formulir (pohon + "tanpa proyek"). */
export function ProjectSelect({
  value,
  onChange,
  projects,
  emptyLabel = "Tanpa proyek",
  allowEmpty = true,
  id,
}: {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  projects: Item<Project>[];
  emptyLabel?: string;
  allowEmpty?: boolean;
  id?: string;
}) {
  const tree = flatTree(projects.filter((p) => !p.archived && p.id !== "inbox"));
  return (
    <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)}>
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {tree.map(({ p, depth }) => (
        <option key={p.id} value={p.id}>
          {"   ".repeat(depth)}
          {depth ? "└ " : ""}
          {p.icon ? `${p.icon} ` : ""}
          {p.name}
        </option>
      ))}
    </select>
  );
}

/** Label proyek kecil ("chip") dengan jalur induk di tooltip. */
export function ProjectChip({ id }: { id: string | undefined }) {
  const s = useScope();
  const p = s.byId(id);
  if (!p) return null;
  return (
    <span className="tk-chip pchip" title={projectPath(s.allProjects, id)}>
      <ProjectMark p={p} size="sm" /> {p.name}
    </span>
  );
}

/** Pemilih ruang lingkup proyek di sidebar: Semua proyek / proyek / subproyek. */
export default function ProjectSwitcher({ onNew, onManage, counts, quick }: { onNew: () => void; onManage: () => void; counts?: (id: string) => number; quick?: boolean }) {
  const s = useScope();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setCursor(0);
    window.setTimeout(() => input.current?.focus(), 20);
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const tree = useMemo(() => flatTree(s.projects), [s.projects]);
  const term = q.trim().toLowerCase();
  const rows: { id: string; label: string; depth: number; p: Item<Project> | null; path?: string }[] = [
    ...(term ? [] : [{ id: "all", label: "Semua proyek", depth: 0, p: null }]),
    ...tree
      .filter(({ p }) => !term || projectPath(s.allProjects, p.id).toLowerCase().includes(term))
      .map(({ p, depth }) => ({ id: p.id, label: p.name, depth: term ? 0 : depth, p, path: term ? projectPath(s.allProjects, p.id) : undefined })),
  ];
  const pick = (id: string) => {
    s.setScope(id);
    setOpen(false);
  };

  return (
    <div className={`pswitch ${quick ? "quick" : ""}`} ref={ref} hidden={quick && !open}>
      {!quick && (
        <button className="pswitch-btn" onClick={() => setOpen(!open)} aria-haspopup="listbox" aria-expanded={open} title="Pilih proyek (Ctrl+P)">
          <ProjectMark p={s.current} />
          <span className="pswitch-text">
            <span className="pswitch-kicker">{s.current?.parentId ? projectPath(s.allProjects, s.current.parentId) : "Proyek"}</span>
            <span className="pswitch-name">{s.current?.name ?? "Semua proyek"}</span>
          </span>
          <ChevronDown size={15} />
        </button>
      )}
      {open && (
        <div className="pswitch-pop" role="listbox" aria-label="Pilih proyek">
          <label className="search search-sm pswitch-search">
            <Search size={14} />
            <input
              ref={input}
              value={q}
              onChange={(e) => (setQ(e.target.value), setCursor(0))}
              placeholder="Cari proyek…"
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") (e.preventDefault(), setCursor((c) => Math.min(rows.length - 1, c + 1)));
                if (e.key === "ArrowUp") (e.preventDefault(), setCursor((c) => Math.max(0, c - 1)));
                if (e.key === "Enter" && rows[cursor]) pick(rows[cursor].id);
                if (e.key === "Escape") setOpen(false);
              }}
            />
          </label>
          <ul>
            {rows.map((r, i) => (
              <li key={r.id}>
                <button
                  role="option"
                  aria-selected={s.scope === r.id}
                  className={`pswitch-row ${i === cursor ? "cur" : ""}`}
                  style={{ paddingLeft: 10 + r.depth * 16 }}
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(r.id)}
                >
                  {r.depth > 0 && <span className="pswitch-branch" aria-hidden="true">└</span>}
                  <ProjectMark p={r.p} size="sm" />
                  <span className="pswitch-label">
                    {r.label}
                    {r.path && r.path !== r.label && <small>{r.path}</small>}
                  </span>
                  {counts && r.p && counts(r.p.id) > 0 && <span className="side-count">{counts(r.p.id)}</span>}
                  {s.scope === r.id && <Check size={14} className="pswitch-check" />}
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="muted small pswitch-empty">Tidak ada proyek "{q}".</li>}
          </ul>
          <footer>
            <button onClick={() => (setOpen(false), onNew())}><Plus size={14} /> Proyek baru</button>
            <button onClick={() => (setOpen(false), onManage())}><FolderKanban size={14} /> Kelola & timeline</button>
          </footer>
        </div>
      )}
    </div>
  );
}
