// Sidebar ala Notion: menu utama, Favorit, pohon "Ruang" (proyek → subproyek → halaman) yang bisa
// dibuka-tutup, diseret, diberi ikon, diganti nama, dan punya menu konteks; lalu menu modul yang
// bisa diatur, Sampah, Panduan, dan Pengaturan. Lebar bisa ditarik dan sidebar bisa diciutkan.
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive, ChevronRight, ChevronsLeft, Copy, CopyPlus, FilePlus2, FolderInput, FolderPlus, Layers, Link2, ListChecks, MoreHorizontal,
  Palette, PanelLeftOpen, Pencil, Plus, Search, Settings2, SmilePlus, Star, StarOff, StickyNote, Trash2, Eye, EyeOff, ArrowUp, ArrowDown, BookOpen, Settings as Cog, LayoutTemplate, Crosshair, ExternalLink,
} from "lucide-react";
import type { Item, Note, BlockColor } from "../lib/types";
import type { Project, Task } from "../lib/tasks";
import { DEFAULT_STATUSES, isTaskDone } from "../lib/tasks";
import { useRecords, strip } from "../lib/useRecords";
import { useScope } from "../lib/scope";
import { useTasks } from "../lib/useTasks";
import { api, isDesktop, newId } from "../lib/api";
import { childrenOf, subtreeIds } from "../lib/projects";
import { useAccess } from "../lib/access";
import { requestOpen } from "../lib/deeplink";
import { useJsonSetting } from "../lib/useSetting";
import { TRASH_KIND } from "../lib/trash";
import { ContextMenu, MenuItem, useContextMenu } from "../components/ContextMenu";
import { EmojiPicker } from "../components/EmojiPicker";
import { Confirm, Modal, useToast } from "../components/ui";
import { ProjectMark } from "../projects/ProjectSwitcher";
import { dropWhere, DropTarget, DropWhere, NodeRef, parseRef, planDrop, subPages, topPages } from "./spaceTree";
import { duplicatePages, duplicateProject } from "./ops";
import TrashDialog from "./TrashDialog";
import { effectiveProject, useTrashNote } from "./useTrash";
import "./sidebar.css";
import { QuickAppearance } from "../components/QuickAppearance";

export interface NavItem {
  id: string;
  label: string;
  icon: typeof Search;
  key?: string;
}

export interface SidebarPrefs {
  width: number;
  hidden: boolean;
  expanded: string[];
  favorites: string[];
  navHidden: string[];
  navOrder: string[];
  closed: string[];
}
export const DEFAULT_SIDEBAR: SidebarPrefs = { width: 248, hidden: false, expanded: [], favorites: [], navHidden: [], navOrder: [], closed: [] };

export function useSidebarPrefs() {
  return useJsonSetting<SidebarPrefs>("sidebar_prefs", DEFAULT_SIDEBAR);
}

const COLORS: { id: BlockColor; label: string }[] = [
  { id: "nila", label: "Nila" }, { id: "laut", label: "Laut" }, { id: "daun", label: "Daun" }, { id: "kunyit", label: "Kunyit" }, { id: "bata", label: "Bata" },
  { id: "jambu", label: "Jambu" }, { id: "ungu", label: "Ungu" }, { id: "kopi", label: "Kopi" }, { id: "abu", label: "Abu" },
];
const NON_SCOPE_PAGES = new Set(["settings", "guide", "team", "assistant", "ibadah"]);
const DRAG_MIME = "application/x-ruangku-node";

interface Row {
  key: string;
  ref: NodeRef;
  depth: number;
  label: string;
  project?: Item<Project>;
  note?: Item<Note>;
  hasKids: boolean;
}

export default function Sidebar({
  page,
  go,
  mainNav,
  moduleNav,
  onSearch,
  onNewProject,
  onEditProject,
  brandExtra,
  footer,
}: {
  page: string;
  go: (p: string) => void;
  mainNav: NavItem[];
  moduleNav: NavItem[];
  onSearch: () => void;
  onNewProject: (parentId?: string) => void;
  onEditProject: (p: Item<Project>) => void;
  brandExtra?: ReactNode;
  footer?: ReactNode;
}) {
  const [prefs, setPrefs] = useSidebarPrefs();
  const scope = useScope();
  const tk = useTasks();
  const notesRec = useRecords<Note>("note");
  const trashRec = useRecords<unknown>(TRASH_KIND);
  const tasksRec = useRecords<Task>("task");
  const trashPage = useTrashNote();
  const access = useAccess();
  const toast = useToast();
  const menu = useContextMenu();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [emoji, setEmoji] = useState<{ key: string; at: { x: number; y: number } } | null>(null);
  const [delProject, setDelProject] = useState<Item<Project> | null>(null);
  const [drop, setDrop] = useState<{ key: string; where: DropWhere } | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [navEdit, setNavEdit] = useState(false);
  const [curNote, setCurNote] = useState<string | null>(() => {
    try {
      return localStorage.getItem("ruangku-notes-last");
    } catch {
      return null;
    }
  });
  useEffect(() => {
    const h = (e: Event) => setCurNote((e as CustomEvent<string | null>).detail);
    window.addEventListener("ruangku:note-current", h);
    return () => window.removeEventListener("ruangku:note-current", h);
  }, []);

  const notes = notesRec.items;
  const live = scope.projects;
  const projIds = useMemo(() => new Set(live.map((p) => p.id)), [live]);
  const expanded = useMemo(() => new Set(prefs.expanded), [prefs.expanded]);
  const favorites = prefs.favorites;

  // Proyek terpilih & induknya selalu terbuka.
  useEffect(() => {
    if (!scope.current) return;
    const anc: string[] = [];
    let cur: Item<Project> | undefined = scope.current;
    const seen = new Set<string>();
    while (cur?.parentId && !seen.has(cur.parentId)) {
      seen.add(cur.parentId);
      anc.push(`p:${cur.parentId}`);
      cur = live.find((p) => p.id === cur!.parentId);
    }
    if (anc.some((k) => !expanded.has(k))) setPrefs((x) => ({ ...x, expanded: [...new Set([...x.expanded, ...anc])] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.current?.id]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of live) {
      const ids = subtreeIds(live, p.id);
      m.set(p.id, tk.tasks.filter((x) => ids.has(x.projectId) && !x.parentId && !isTaskDone(x, tk.projects)).length);
    }
    return m;
  }, [live, tk.tasks, tk.projects]);

  const toggle = (key: string, open?: boolean) =>
    setPrefs((x) => {
      const s = new Set(x.expanded);
      const want = open ?? !s.has(key);
      if (want) s.add(key);
      else s.delete(key);
      return { ...x, expanded: [...s] };
    });

  // ---------- Baris pohon ----------
  const pageRows = useCallback(
    (list: Item<Note>[], depth: number, out: Row[], seen: Set<string>) => {
      for (const n of list) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        const kids = subPages(notes, n.id);
        const key = `n:${n.id}`;
        out.push({ key, ref: { t: "n", id: n.id }, depth, label: n.title || "Tanpa judul", note: n, hasKids: kids.length > 0 });
        if (expanded.has(key)) pageRows(kids, depth + 1, out, seen);
      }
    },
    [notes, expanded],
  );
  const rows = useMemo(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    const walk = (parent: string | undefined, depth: number, path: Set<string>) => {
      for (const p of childrenOf(live, parent)) {
        if (path.has(p.id)) continue;
        const subs = childrenOf(live, p.id);
        const pages = topPages(notes, p.id);
        const key = `p:${p.id}`;
        out.push({ key, ref: { t: "p", id: p.id }, depth, label: p.name, project: p, hasKids: subs.length + pages.length > 0 });
        if (expanded.has(key)) {
          walk(p.id, depth + 1, new Set([...path, p.id]));
          pageRows(pages, depth + 1, out, seen);
        }
      }
    };
    walk(undefined, 0, new Set());
    return out;
  }, [live, notes, expanded, pageRows]);
  const privateRows = useMemo(() => {
    const out: Row[] = [];
    pageRows(topPages(notes, undefined, projIds), 0, out, new Set());
    return out;
  }, [notes, projIds, pageRows]);

  // ---------- Tindakan ----------
  const openNote = (id: string) => {
    requestOpen("note", id);
    setCurNote(id);
    go("notes");
  };
  const selectProject = (id: string) => {
    scope.setScope(id);
    toggle(`p:${id}`, true);
    if (NON_SCOPE_PAGES.has(page)) go("projects");
  };
  const saveNote = (id: string, patch: Partial<Note>) => {
    const n = notes.find((x) => x.id === id);
    if (n) return notesRec.save({ ...strip(n), ...patch }, id);
  };
  const saveProject = (id: string, patch: Partial<Project>) => {
    const p = scope.allProjects.find((x) => x.id === id);
    if (p) return tk.saveProject({ ...strip(p), ...patch }, id);
  };
  const newPage = async (projectId?: string, parentId?: string) => {
    const id = newId();
    const sibs = parentId ? subPages(notes, parentId) : topPages(notes, projectId, projIds);
    await notesRec.save({ title: "", body: "", tags: [], projectId: parentId ? undefined : projectId, parentId, order: (sibs.length ? Math.max(...sibs.map((s) => s.order ?? 0)) : 0) + 10 }, id);
    if (parentId) toggle(`n:${parentId}`, true);
    if (projectId) toggle(`p:${projectId}`, true);
    openNote(id);
  };
  const newSubproject = async (parent?: Item<Project>) => {
    const id = newId();
    const sibs = childrenOf(live, parent?.id);
    await tk.saveProject({ name: parent ? "Subproyek baru" : "Proyek baru", color: parent?.color ?? "nila", statuses: parent?.statuses ?? DEFAULT_STATUSES, parentId: parent?.id, fields: undefined, order: (sibs.length ? Math.max(...sibs.map((s) => s.order ?? 0)) : 0) + 10 }, id);
    if (parent) toggle(`p:${parent.id}`, true);
    setRenaming(`p:${id}`);
  };
  const copyLink = async (r: Row) => {
    const text = r.note ? `[${r.note.icon ?? "📄"} ${r.label}](note:${r.note.id})` : `${r.label}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return toast("Tidak bisa menyalin ke papan klip", "error");
    }
    toast(r.note ? "Tautan halaman disalin. Tempel di catatan mana pun." : "Nama proyek disalin");
  };
  const toggleFav = (key: string) => setPrefs((x) => ({ ...x, favorites: x.favorites.includes(key) ? x.favorites.filter((k) => k !== key) : [...x.favorites, key] }));
  const applyPlan = async (drag: NodeRef, target: DropTarget, where: DropWhere) => {
    const plan = planDrop(scope.allProjects, notes, drag, target, where);
    if ("error" in plan) return toast(plan.error, "error");
    for (const x of plan.projects) await saveProject(x.id, x.patch);
    for (const x of plan.notes) await saveNote(x.id, x.patch);
    if (target.t === "p" && where === "inside") toggle(`p:${target.id}`, true);
    if (target.t === "n" && where === "inside") toggle(`n:${target.id}`, true);
  };
  const moveTargets = (r: Row): MenuItem[] => {
    const items: MenuItem[] = [];
    if (r.project) items.push({ label: "Tingkat atas", icon: <Layers size={14} />, run: () => applyPlan(r.ref, { t: "root" }, "after") });
    else items.push({ label: "Halaman pribadi", icon: <FilePlus2 size={14} />, run: () => applyPlan(r.ref, { t: "private" }, "inside") });
    for (const p of live) {
      if (r.project && subtreeIds(live, r.project.id).has(p.id)) continue;
      items.push({ label: `${"  ".repeat(depthOf(live, p))}${p.icon ? p.icon + " " : ""}${p.name}`, run: () => applyPlan(r.ref, { t: "p", id: p.id }, "inside") });
    }
    return items;
  };

  const rowMenu = (r: Row): MenuItem[] => {
    const fav = favorites.includes(r.key);
    if (r.project) {
      const p = r.project;
      const ro = access.readOnly(p.id);
      return [
        { label: "Fokuskan ke proyek ini", icon: <Crosshair size={14} />, run: () => selectProject(p.id) },
        { label: "Buka timeline", icon: <ExternalLink size={14} />, run: () => (scope.setScope(p.id), go("projects")) },
        { label: "Lihat tugas", icon: <ListChecks size={14} />, run: () => (scope.setScope(p.id), go("tasks")) },
        { type: "separator" },
        { label: "Tambah halaman", icon: <FilePlus2 size={14} />, disabled: ro, run: () => newPage(p.id) },
        { label: "Tambah subproyek", icon: <FolderPlus size={14} />, disabled: ro, run: () => newSubproject(p) },
        { type: "separator" },
        { label: fav ? "Hapus dari Favorit" : "Tambahkan ke Favorit", icon: fav ? <StarOff size={14} /> : <Star size={14} />, run: () => toggleFav(r.key) },
        { label: "Ganti nama", icon: <Pencil size={14} />, hint: "F2", disabled: ro, run: () => setRenaming(r.key) },
        { label: "Ganti ikon", icon: <SmilePlus size={14} />, disabled: ro, run: () => setEmoji({ key: r.key, at: anchorOf(r.key) }) },
        { label: "Warna", icon: <Palette size={14} />, disabled: ro, items: COLORS.map((c) => ({ label: c.label, checked: p.color === c.id, icon: <i className={`sb-swatch cc-${c.id}`} />, run: () => saveProject(p.id, { color: c.id }) })) },
        { label: "Pindahkan ke", icon: <FolderInput size={14} />, disabled: ro, items: moveTargets(r) },
        { label: "Duplikat", icon: <CopyPlus size={14} />, hint: "Ctrl+D", run: () => dupProject(p) },
        { label: "Salin nama", icon: <Copy size={14} />, run: () => copyLink(r) },
        { label: "Edit detail proyek…", icon: <Settings2 size={14} />, disabled: ro, run: () => onEditProject(p) },
        { type: "separator" },
        { label: "Arsipkan", icon: <Archive size={14} />, disabled: ro, run: () => (saveProject(p.id, { archived: true }), scope.scope === p.id && scope.setScope("all"), toast(`"${p.name}" diarsipkan. Lihat di Proyek → Daftar → Tampilkan arsip.`)) },
        { label: "Hapus proyek…", icon: <Trash2 size={14} />, danger: true, disabled: ro, run: () => setDelProject(p) },
      ];
    }
    const n = r.note!;
    const ro = access.readOnly(effectiveProject(notes, n));
    return [
      { label: "Buka", icon: <ExternalLink size={14} />, run: () => openNote(n.id) },
      { label: "Tambah subhalaman", icon: <FilePlus2 size={14} />, disabled: ro, run: () => newPage(undefined, n.id) },
      { type: "separator" },
      { label: fav ? "Hapus dari Favorit" : "Tambahkan ke Favorit", icon: fav ? <StarOff size={14} /> : <Star size={14} />, run: () => toggleFav(r.key) },
      { label: "Ganti nama", icon: <Pencil size={14} />, hint: "F2", disabled: ro, run: () => setRenaming(r.key) },
      { label: "Ganti ikon", icon: <SmilePlus size={14} />, disabled: ro, run: () => setEmoji({ key: r.key, at: anchorOf(r.key) }) },
      { label: "Pindahkan ke", icon: <FolderInput size={14} />, disabled: ro, items: moveTargets(r) },
      { label: "Duplikat", icon: <CopyPlus size={14} />, hint: "Ctrl+D", disabled: ro, run: () => dupPage(n) },
      { label: "Salin tautan", icon: <Link2 size={14} />, run: () => copyLink(r) },
      { label: n.sticky ? "Tampilkan sticky note" : "Tempel di desktop", icon: <StickyNote size={14} />, disabled: !isDesktop, run: async () => (n.sticky ? null : await saveNote(n.id, { sticky: { color: "kunyit" } }), api.stickyOpen(n.id)) },
      { label: "Jadikan template", icon: <LayoutTemplate size={14} />, disabled: ro, run: () => (saveNote(n.id, { isTemplate: true, parentId: undefined }), toast("Halaman dijadikan template. Pakai lewat Catatan → Dari template.")) },
      { type: "separator" },
      { label: "Pindahkan ke Sampah", icon: <Trash2 size={14} />, danger: true, hint: "Del", disabled: ro, run: () => trashPage(n) },
    ];
  };

  const dupPage = async (n: Item<Note>) => {
    const out = duplicatePages(notes, n.id, newId);
    for (const x of out) await notesRec.save(x.data, x.id);
    toast(`"${n.title || "Tanpa judul"}" diduplikat`, "info", { label: "Buka", run: () => openNote(out[0].id) });
  };
  const dupProject = async (p: Item<Project>) => {
    const out = duplicateProject(scope.allProjects, tk.tasks, p.id, newId);
    for (const x of out.projects) await tk.saveProject(x.data, x.id);
    for (const x of out.tasks) await tasksRec.save(x.data, x.id);
    toast(`"${p.name}" diduplikat beserta ${out.projects.length - 1} subproyek dan ${out.tasks.length} tugas`);
  };

  const anchorOf = (key: string) => {
    const el = document.querySelector<HTMLElement>(`[data-node="${CSS.escape(key)}"] .sb-ico`);
    const r = el?.getBoundingClientRect();
    return r ? { x: r.left, y: r.bottom + 4 } : { x: 60, y: 120 };
  };

  const commitRename = (key: string, value: string) => {
    setRenaming(null);
    const r = parseRef(key);
    const v = value.trim();
    if (!r) return;
    if (r.t === "p") {
      const p = scope.allProjects.find((x) => x.id === r.id);
      if (p && v && v !== p.name) saveProject(r.id, { name: v });
    } else {
      const n = notes.find((x) => x.id === r.id);
      if (n && v !== n.title) saveNote(r.id, { title: v });
    }
  };

  // Pintasan pada baris yang sedang difokus: F2 ganti nama, Del ke sampah, Ctrl+D duplikat.
  const onRowKey = (e: React.KeyboardEvent, r: Row) => {
    if (renaming) return;
    if (e.key === "F2") (e.preventDefault(), setRenaming(r.key));
    else if (e.key === "Delete" && r.note) (e.preventDefault(), trashPage(r.note));
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") (e.preventDefault(), r.note ? dupPage(r.note) : r.project && dupProject(r.project));
    else if (e.key === "ArrowRight" && r.hasKids && !expanded.has(r.key)) (e.preventDefault(), toggle(r.key, true));
    else if (e.key === "ArrowLeft" && expanded.has(r.key)) (e.preventDefault(), toggle(r.key, false));
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const all = [...document.querySelectorAll<HTMLElement>(".sb-row-main")];
      const i = all.indexOf(e.currentTarget as HTMLElement);
      all[e.key === "ArrowDown" ? Math.min(all.length - 1, i + 1) : Math.max(0, i - 1)]?.focus();
    }
  };

  // ---------- Seret-taruh ----------
  const dragProps = (r: Row) => ({
    draggable: renaming !== r.key,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(DRAG_MIME, r.key);
      e.dataTransfer.setData("text/plain", r.label);
      e.dataTransfer.effectAllowed = "move";
    },
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const where = dropWhere(e.clientY - rect.top, rect.height);
      if (drop?.key !== r.key || drop.where !== where) setDrop({ key: r.key, where });
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setDrop((d) => (d?.key === r.key ? null : d));
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const src = parseRef(e.dataTransfer.getData(DRAG_MIME));
      const where = drop?.key === r.key ? drop.where : "inside";
      setDrop(null);
      if (src) applyPlan(src, r.ref, where);
    },
    onDragEnd: () => setDrop(null),
  });
  const zoneProps = (target: DropTarget, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
      e.preventDefault();
      if (drop?.key !== key) setDrop({ key, where: "inside" });
    },
    onDragLeave: (e: React.DragEvent) => !(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node) && setDrop((d) => (d?.key === key ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDrop(null);
      const src = parseRef(e.dataTransfer.getData(DRAG_MIME));
      if (src) applyPlan(src, target, "inside");
    },
  });

  const renderRow = (r: Row, opts: { fav?: boolean } = {}) => {
    const isOpen = expanded.has(r.key);
    const active = r.project ? scope.scope === r.project.id : page === "notes" && curNote === r.note?.id;
    const count = r.project ? counts.get(r.project.id) ?? 0 : 0;
    const dz = !opts.fav && drop?.key === r.key ? `drop-${drop.where}` : "";
    return (
      <div
        key={(opts.fav ? "f-" : "") + r.key}
        data-node={opts.fav ? undefined : r.key}
        className={`sb-row ${active ? "active" : ""} ${dz}`}
        style={{ paddingLeft: 4 + (opts.fav ? 0 : r.depth) * 14 }}
        onContextMenu={(e) => menu.open(e, rowMenu(r))}
        {...(opts.fav ? {} : dragProps(r))}
      >
        <button className={`sb-chev ${r.hasKids && !opts.fav ? "" : "none"}`} tabIndex={-1} aria-label={isOpen ? "Tutup" : "Buka"} onClick={() => r.hasKids && toggle(r.key)}>
          {r.hasKids && !opts.fav && <ChevronRight size={13} className={isOpen ? "open" : ""} />}
        </button>
        {renaming === r.key ? (
          <span className="sb-row-main editing">
            <span className="sb-ico">{r.project ? <ProjectMark p={r.project} size="sm" /> : r.note?.icon ?? "📄"}</span>
            <input
              className="sb-rename"
              autoFocus
              defaultValue={r.note ? r.note.title : r.label}
              placeholder={r.note ? "Tanpa judul" : "Nama proyek"}
              onFocus={(e) => e.target.select()}
              onBlur={(e) => commitRename(r.key, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
            />
          </span>
        ) : (
          <>
            <button
              type="button" className="sb-ico sb-icon-edit"
              aria-label={`Ganti ikon ${r.label}`} title="Ganti ikon"
              disabled={r.project ? access.readOnly(r.project.id) : access.readOnly(effectiveProject(notes, r.note!))}
              onClick={(e) => {
                if (!(r.project ? access.readOnly(r.project.id) : access.readOnly(effectiveProject(notes, r.note!)))) {
                  e.stopPropagation();
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setEmoji({ key: r.key, at: { x: rect.left, y: rect.bottom + 4 } });
                }
              }}
            >
              {r.project ? <ProjectMark p={r.project} size="sm" /> : r.note?.icon ?? "📄"}
            </button>
          <button
            className="sb-row-main"
            onClick={() => (r.project ? selectProject(r.project.id) : openNote(r.note!.id))}
            onDoubleClick={() => setRenaming(r.key)}
            onKeyDown={(e) => onRowKey(e, r)}
            title={r.project ? `${r.label}${count ? ` · ${count} tugas terbuka` : ""}` : r.label}
          >

            <span className={`sb-label ${r.note && !r.note.title ? "untitled" : ""}`}>{r.label}</span>
            {count > 0 && <span className="sb-count">{count}</span>}
          </button>
          </>
        )}
        <span className="sb-acts">
          <button className="sb-act" aria-label="Menu" title="Hapus, duplikat, ganti nama, dan lainnya" onClick={(e) => menu.open(e.currentTarget, rowMenu(r))}>
            <MoreHorizontal size={14} />
          </button>
          {!opts.fav && (
            <button
              className="sb-act"
              aria-label={r.project ? "Tambah halaman di proyek ini" : "Tambah subhalaman"}
              title={r.project ? "Tambah halaman atau subproyek" : "Tambah subhalaman"}
              onClick={(e) =>
                r.project
                  ? menu.open(e.currentTarget, [
                      { label: "Halaman baru", icon: <FilePlus2 size={14} />, run: () => newPage(r.project!.id) },
                      { label: "Subproyek baru", icon: <FolderPlus size={14} />, run: () => newSubproject(r.project) },
                      { label: "Subproyek dengan formulir…", icon: <Settings2 size={14} />, run: () => onNewProject(r.project!.id) },
                    ])
                  : newPage(undefined, r.note!.id)
              }
            >
              <Plus size={14} />
            </button>
          )}
        </span>
      </div>
    );
  };

  // ---------- Menu modul ----------
  const navOrdered = useMemo(() => {
    const order = prefs.navOrder;
    const idx = (id: string) => (order.includes(id) ? order.indexOf(id) : 100 + moduleNav.findIndex((m) => m.id === id));
    return [...moduleNav].sort((a, b) => idx(a.id) - idx(b.id));
  }, [moduleNav, prefs.navOrder]);
  const navShown = navOrdered.filter((m) => !prefs.navHidden.includes(m.id));
  const navMenu = (id: string): MenuItem[] => [
    { label: "Sembunyikan dari sidebar", icon: <EyeOff size={14} />, run: () => setPrefs((x) => ({ ...x, navHidden: [...new Set([...x.navHidden, id])] })) },
    { label: "Atur menu…", icon: <Settings2 size={14} />, run: () => setNavEdit(true) },
  ];
  const groupOpen = (g: string) => !prefs.closed.includes(g);
  const toggleGroup = (g: string) => setPrefs((x) => ({ ...x, closed: x.closed.includes(g) ? x.closed.filter((c) => c !== g) : [...x.closed, g] }));

  const favRows: Row[] = favorites
    .map((k): Row | null => {
      const r = parseRef(k);
      if (!r) return null;
      if (r.t === "p") {
        const p = live.find((x) => x.id === r.id);
        return p ? { key: k, ref: r, depth: 0, label: p.name, project: p, hasKids: false } : null;
      }
      const n = notes.find((x) => x.id === r.id);
      return n ? { key: k, ref: r, depth: 0, label: n.title || "Tanpa judul", note: n, hasKids: false } : null;
    })
    .filter((x): x is Row => !!x);

  // ---------- Lebar ----------
  const resizing = useRef(false);
  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = prefs.width;
    let w = startW;
    const move = (ev: MouseEvent) => {
      w = Math.max(200, Math.min(420, startW + ev.clientX - startX));
      document.documentElement.style.setProperty("--sb-w", `${w}px`);
    };
    const up = () => {
      resizing.current = false;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setPrefs((x) => ({ ...x, width: w }));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  useEffect(() => {
    if (!resizing.current) document.documentElement.style.setProperty("--sb-w", `${prefs.width}px`);
  }, [prefs.width]);

  const trashCount = trashRec.items.length;

  return (
    <aside className="sidebar sb" aria-label="Sidebar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        Ruangku
        {brandExtra}
        <button className="icon-btn sm sb-hide" onClick={() => setPrefs((x) => ({ ...x, hidden: true }))} title="Ciutkan sidebar (Ctrl+\)" aria-label="Ciutkan sidebar">
          <ChevronsLeft size={16} />
        </button>
      </div>
      <button className="cp-trigger" onClick={onSearch} title="Cari & perintah (Ctrl+K)">
        <Search size={15} />
        <span>Cari…</span>
        <kbd>Ctrl K</kbd>
      </button>

      <div className="sb-scroll">
        <nav className="nav" aria-label="Menu utama">
          {mainNav.map((n) => (
            <button key={n.id} data-nav={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => go(n.id)} aria-current={page === n.id ? "page" : undefined} title={n.key ? `Ctrl+${n.key}` : undefined}>
              <n.icon size={17} strokeWidth={1.8} />
              {n.label}
            </button>
          ))}
        </nav>

        {favRows.length > 0 && (
          <section className="sb-sec">
            <header className="sb-sec-head">
              <button className="sb-sec-title" onClick={() => toggleGroup("favorit")}>
                Favorit <ChevronRight size={12} className={groupOpen("favorit") ? "open" : ""} />
              </button>
            </header>
            {groupOpen("favorit") && <div className="sb-tree">{favRows.map((r) => renderRow(r, { fav: true }))}</div>}
          </section>
        )}

        <section className="sb-sec sb-space">
          <header className="sb-sec-head">
            <button className="sb-sec-title" onClick={() => toggleGroup("ruang")}>
              Ruang <ChevronRight size={12} className={groupOpen("ruang") ? "open" : ""} />
            </button>
            <span className="sb-sec-acts">
              <button
                className="sb-act"
                aria-label="Menu Ruang"
                onClick={(e) =>
                  menu.open(e.currentTarget, [
                    { label: "Proyek baru", icon: <FolderPlus size={14} />, run: () => newSubproject() },
                    { label: "Proyek baru dengan formulir…", icon: <Settings2 size={14} />, run: () => onNewProject() },
                    { label: "Halaman pribadi baru", icon: <FilePlus2 size={14} />, run: () => newPage() },
                    { type: "separator" },
                    { label: "Buka semua", icon: <Eye size={14} />, run: () => setPrefs((x) => ({ ...x, expanded: [...new Set([...x.expanded, ...live.map((p) => `p:${p.id}`)])] })) },
                    { label: "Tutup semua", icon: <EyeOff size={14} />, run: () => setPrefs((x) => ({ ...x, expanded: [] })) },
                    { label: "Kelola proyek & arsip", icon: <Archive size={14} />, run: () => go("projects") },
                  ])
                }
              >
                <MoreHorizontal size={14} />
              </button>
              <button className="sb-act" aria-label="Proyek baru" title="Proyek baru" onClick={() => newSubproject()}>
                <Plus size={14} />
              </button>
            </span>
          </header>
          {groupOpen("ruang") && (
            <div className="sb-tree" role="tree" aria-label="Proyek dan halaman">
              <div className={`sb-row ${scope.scope === "all" ? "active" : ""} ${drop?.key === "root" ? "drop-inside" : ""}`} style={{ paddingLeft: 4 }} {...zoneProps({ t: "root" }, "root")}>
                <span className="sb-chev none" />
                <button className="sb-row-main" onClick={() => scope.setScope("all")} title="Tampilkan semua proyek">
                  <span className="sb-ico"><Layers size={14} /></span>
                  <span className="sb-label">Semua proyek</span>
                </button>
              </div>
              {rows.map((r) => renderRow(r))}
              {!scope.loading && live.length === 0 && <p className="sb-empty">Belum ada proyek. Klik + untuk membuat.</p>}
              <div className={`sb-row sb-group-row ${drop?.key === "private" ? "drop-inside" : ""}`} style={{ paddingLeft: 4 }} {...zoneProps({ t: "private" }, "private")}>
                <button className={`sb-chev ${privateRows.length ? "" : "none"}`} tabIndex={-1} onClick={() => toggleGroup("pribadi")} aria-label="Buka/tutup halaman pribadi">
                  {privateRows.length > 0 && <ChevronRight size={13} className={groupOpen("pribadi") ? "open" : ""} />}
                </button>
                <button className="sb-row-main" onClick={() => toggleGroup("pribadi")} title="Halaman tanpa proyek">
                  <span className="sb-ico">🔒</span>
                  <span className="sb-label">Halaman pribadi</span>
                  {privateRows.filter((r) => r.depth === 0).length > 0 && <span className="sb-count">{privateRows.filter((r) => r.depth === 0).length}</span>}
                </button>
                <span className="sb-acts">
                  <button className="sb-act" aria-label="Halaman pribadi baru" title="Halaman pribadi baru" onClick={() => newPage()}>
                    <Plus size={14} />
                  </button>
                </span>
              </div>
              {groupOpen("pribadi") && privateRows.map((r) => renderRow({ ...r, depth: r.depth + 1 }))}
            </div>
          )}
        </section>

        <section className="sb-sec">
          <header className="sb-sec-head">
            <button className="sb-sec-title" onClick={() => toggleGroup("modul")}>
              Modul <ChevronRight size={12} className={groupOpen("modul") ? "open" : ""} />
            </button>
            <span className="sb-sec-acts">
              <button className="sb-act" aria-label="Atur menu" title="Atur menu sidebar" onClick={() => setNavEdit(true)}>
                <Settings2 size={14} />
              </button>
            </span>
          </header>
          {groupOpen("modul") && (
            <nav className="nav" aria-label="Modul">
              {navShown.map((n) => (
                <button key={n.id} data-nav={n.id} className={`nav-item ${page === n.id ? "active" : ""}`} onClick={() => go(n.id)} onContextMenu={(e) => menu.open(e, navMenu(n.id))} aria-current={page === n.id ? "page" : undefined} title={n.key ? `Ctrl+${n.key}` : undefined}>
                  <n.icon size={17} strokeWidth={1.8} />
                  {n.label}
                </button>
              ))}
            </nav>
          )}
        </section>
      </div>

      <div className="sidebar-foot">
        {footer}
        <div className="sb-foot-row">
          <button className={`nav-item ${trashOpen ? "active" : ""}`} onClick={() => setTrashOpen(true)} title="Halaman yang dihapus">
            <Trash2 size={16} strokeWidth={1.8} />
            Sampah{trashCount ? <span className="sb-count">{trashCount}</span> : null}
          </button>
          <QuickAppearance />
          <button data-nav="guide" className={`nav-item ${page === "guide" ? "active" : ""}`} onClick={() => go("guide")} title="Panduan (F1)" aria-label="Panduan">
            <BookOpen size={16} strokeWidth={1.8} />
          </button>
          <button data-nav="settings" className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => go("settings")} title="Pengaturan" aria-label="Pengaturan">
            <Cog size={16} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div className="sb-resize" onMouseDown={startResize} onDoubleClick={() => setPrefs((x) => ({ ...x, width: DEFAULT_SIDEBAR.width }))} title="Tarik untuk mengubah lebar" aria-hidden="true" />

      <ContextMenu {...menu.props} />
      {emoji && (
        <EmojiPicker
          at={emoji.at}
          onClose={() => setEmoji(null)}
          onPick={(e) => {
            const r = parseRef(emoji.key);
            if (r?.t === "p") saveProject(r.id, { icon: e });
            else if (r) saveNote(r.id, { icon: e });
          }}
          onRemove={() => {
            const r = parseRef(emoji.key);
            if (r?.t === "p") saveProject(r.id, { icon: undefined });
            else if (r) saveNote(r.id, { icon: undefined });
          }}
        />
      )}
      {delProject && (
        <Confirm
          title="Hapus proyek?"
          text={`"${delProject.name}" dihapus. Tugasnya dipindah ke ${delProject.parentId ? "proyek induk" : "Inbox"} dan subproyeknya naik satu tingkat. Halaman catatannya tetap ada.`}
          confirmLabel="Hapus proyek"
          onConfirm={async () => {
            if (scope.scope === delProject.id) scope.setScope(delProject.parentId ?? "all");
            await tk.removeProject(delProject.id);
            setPrefs((x) => ({ ...x, favorites: x.favorites.filter((k) => k !== `p:${delProject.id}`) }));
          }}
          onClose={() => setDelProject(null)}
        />
      )}
      {trashOpen && <TrashDialog onClose={() => setTrashOpen(false)} onOpen={(id) => (setTrashOpen(false), openNote(id))} />}
      {navEdit && (
        <Modal title="Atur menu sidebar" onClose={() => setNavEdit(false)} footer={<button className="btn btn-primary" onClick={() => setNavEdit(false)}>Selesai</button>}>
          <p className="muted small">Pilih modul yang tampil di sidebar dan urutannya. Modul yang dimatikan sepenuhnya diatur di Pengaturan → Plugin & ekstensi.</p>
          <ul className="sb-navedit">
            {navOrdered.map((n, i) => {
              const shown = !prefs.navHidden.includes(n.id);
              const move = (d: -1 | 1) =>
                setPrefs((x) => {
                  const ids = navOrdered.map((m) => m.id);
                  const j = i + d;
                  if (j < 0 || j >= ids.length) return x;
                  [ids[i], ids[j]] = [ids[j], ids[i]];
                  return { ...x, navOrder: ids };
                });
              return (
                <li key={n.id}>
                  <label className="check-row">
                    <input type="checkbox" checked={shown} onChange={(e) => setPrefs((x) => ({ ...x, navHidden: e.target.checked ? x.navHidden.filter((h) => h !== n.id) : [...x.navHidden, n.id] }))} />
                    <n.icon size={16} /> {n.label}
                  </label>
                  <span className="spacer" />
                  <button className="icon-btn sm" disabled={i === 0} onClick={() => move(-1)} aria-label={`Naikkan ${n.label}`}><ArrowUp size={14} /></button>
                  <button className="icon-btn sm" disabled={i === navOrdered.length - 1} onClick={() => move(1)} aria-label={`Turunkan ${n.label}`}><ArrowDown size={14} /></button>
                </li>
              );
            })}
          </ul>
          <button className="link small" onClick={() => setPrefs((x) => ({ ...x, navHidden: [], navOrder: [] }))}>Kembalikan susunan bawaan</button>
        </Modal>
      )}
    </aside>
  );
}

/** Tombol untuk membuka lagi sidebar yang diciutkan. */
export function SidebarOpener() {
  const [prefs, setPrefs] = useSidebarPrefs();
  if (!prefs.hidden) return null;
  return (
    <button className="sb-opener icon-btn" onClick={() => setPrefs((x) => ({ ...x, hidden: false }))} title="Buka sidebar (Ctrl+\)" aria-label="Buka sidebar">
      <PanelLeftOpen size={18} />
    </button>
  );
}

function depthOf(projects: Item<Project>[], p: Item<Project>): number {
  let d = 0;
  let cur = p;
  const seen = new Set<string>();
  while (cur.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const up = projects.find((x) => x.id === cur.parentId);
    if (!up) break;
    d++;
    cur = up;
  }
  return d;
}
