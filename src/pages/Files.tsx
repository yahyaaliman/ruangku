import { FilePreview } from "../components/FilePreview";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, ArrowUp, ClipboardPaste, Copy, ExternalLink, Eye, EyeOff, File, FileArchive, FileImage,
  FilePlus, FileSpreadsheet, FileText, FileVideo, Folder, FolderPlus, FolderSearch, HardDrive, Music, Pencil,
  RefreshCw, Scissors, Search, Star, StarOff, Tag, Trash2, X,
} from "lucide-react";
import type { FileMeta, FsEntry, Item, Place } from "../lib/types";
import { api, errorText } from "../lib/api";
import { useRecords } from "../lib/useRecords";
import { basename, crumbs, isInside, join, metaId, parent, samePath, trimSep } from "../lib/paths";
import { dateShort, time } from "../lib/date";
import { formatBytes } from "../lib/metrics";
import { Confirm, Modal, useToast } from "../components/ui";
import { useScope } from "../lib/scope";
import { ProjectMark, ProjectSelect } from "../projects/ProjectSwitcher";
import { subtreeIds } from "../lib/projects";
import { PaneResizer, usePaneWidth } from "../components/Pane";

type SortKey = "name" | "modified" | "size" | "ext";
type Clip = { mode: "copy" | "cut"; paths: string[] } | null;
type View = { kind: "dir"; path: string } | { kind: "search"; root: string; query: string } | { kind: "tag"; tag: string } | { kind: "favorites" } | { kind: "project"; id: string };

const KIND_LABEL: Record<string, string> = {
  pdf: "PDF", doc: "Word", docx: "Word", xls: "Excel", xlsx: "Excel", csv: "CSV", ppt: "PowerPoint", pptx: "PowerPoint",
  txt: "Teks", md: "Markdown", jpg: "Gambar", jpeg: "Gambar", png: "Gambar", gif: "Gambar", webp: "Gambar",
  mp4: "Video", mkv: "Video", mov: "Video", mp3: "Audio", wav: "Audio", zip: "Arsip", rar: "Arsip", "7z": "Arsip", exe: "Aplikasi",
};

function FileIcon({ e }: { e: Pick<FsEntry, "isDir" | "ext"> }) {
  const p = { size: 18, strokeWidth: 1.7 };
  if (e.isDir) return <Folder {...p} className="fi fi-dir" />;
  const k = KIND_LABEL[e.ext];
  if (k === "Gambar") return <FileImage {...p} className="fi fi-img" />;
  if (k === "Video") return <FileVideo {...p} className="fi fi-vid" />;
  if (k === "Audio") return <Music {...p} className="fi fi-aud" />;
  if (k === "Arsip") return <FileArchive {...p} className="fi fi-zip" />;
  if (k === "Excel" || k === "CSV") return <FileSpreadsheet {...p} className="fi fi-xls" />;
  if (k === "Word" || k === "PDF" || k === "Teks" || k === "Markdown" || k === "PowerPoint") return <FileText {...p} className="fi fi-doc" />;
  return <File {...p} className="fi" />;
}

function NameModal({ title, initial, cta, onSubmit, onClose }: { title: string; initial: string; cta: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Pilih nama tanpa ekstensi, seperti di Explorer.
    const dot = initial.lastIndexOf(".");
    ref.current?.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial]);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" disabled={!v.trim()} onClick={() => (onSubmit(v.trim()), onClose())}>{cta}</button>
        </>
      }
    >
      <form onSubmit={(e) => (e.preventDefault(), v.trim() && (onSubmit(v.trim()), onClose()))}>
        <input ref={ref} className="input-full" value={v} onChange={(e) => setV(e.target.value)} />
      </form>
    </Modal>
  );
}

function TagModal({ paths, metas, allTags, onSave, onClose }: { paths: string[]; metas: Map<string, Item<FileMeta>>; allTags: string[]; onSave: (tags: string[]) => void; onClose: () => void }) {
  const common = paths.map((p) => metas.get(metaId(p))?.tags ?? []).reduce((a, b) => a.filter((t) => b.includes(t)));
  const [tags, setTags] = useState<string[]>(common);
  const [input, setInput] = useState("");
  const add = (t: string) => {
    const x = t.trim().toLowerCase().replace(/^#/, "");
    if (x && !tags.includes(x)) setTags([...tags, x]);
    setInput("");
  };
  return (
    <Modal
      title={paths.length > 1 ? `Tag untuk ${paths.length} item` : `Tag untuk ${basename(paths[0])}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Batal</button>
          <button className="btn btn-primary" onClick={() => (onSave(input.trim() ? [...tags, input.trim().toLowerCase()] : tags), onClose())}>Simpan tag</button>
        </>
      }
    >
      <div className="tag-editor">
        {tags.map((t) => (
          <span key={t} className="tag tag-removable">
            #{t}
            <button aria-label={`Hapus tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}><X size={12} /></button>
          </span>
        ))}
        <input
          value={input}
          placeholder="Ketik tag lalu Enter"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(input);
            }
          }}
        />
      </div>
      {allTags.filter((t) => !tags.includes(t)).length > 0 && (
        <div className="chips">
          {allTags.filter((t) => !tags.includes(t)).map((t) => <button key={t} className="chip" onClick={() => add(t)}>#{t}</button>)}
        </div>
      )}
    </Modal>
  );
}

export default function Files() {
  const toast = useToast();
  const metas = useRecords<FileMeta>("filemeta");
  const metaMap = useMemo(() => new Map(metas.items.map((m) => [m.id, m])), [metas.items]);
  const allTags = useMemo(() => [...new Set(metas.items.flatMap((m) => m.tags))].sort(), [metas.items]);
  const favorites = metas.items.filter((m) => m.favorite).sort((a, b) => a.name.localeCompare(b.name));

  const [places, setPlaces] = useState<Place[]>([]);
  const [view, setView] = useState<View | null>(null);
  const [back, setBack] = useState<View[]>([]);
  const [fwd, setFwd] = useState<View[]>([]);
  const [entries, setEntries] = useState<FsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "name", asc: true });
  const [showHidden, setShowHidden] = useState(false);
  const [clip, setClip] = useState<Clip>(null);
  const [query, setQuery] = useState("");
  const [editingPath, setEditingPath] = useState(false);
  const [pathText, setPathText] = useState("");
  const [modal, setModal] = useState<null | { t: "mkdir" | "mkfile" } | { t: "rename"; path: string } | { t: "tags"; paths: string[] } | { t: "trash"; paths: string[] }>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  const [folderSize, setFolderSize] = useState<{ path: string; bytes: number; files: number } | null>(null);

  const dir = view?.kind === "dir" ? view.path : null;
  const scope = useScope();
  const projectFolders = scope.projects.filter((p) => p.folder && scope.match(p.id));
  // Saat proyek dipilih di pemilih global dan proyek punya folder, buka foldernya.
  const lastScope = useRef(scope.scope);
  useEffect(() => {
    if (lastScope.current === scope.scope) return;
    lastScope.current = scope.scope;
    if (scope.current?.folder) setView({ kind: "dir", path: scope.current.folder });
  }, [scope.scope, scope.current]);

  useEffect(() => {
    api.places().then((p) => {
      setPlaces(p);
      let last: string | null = null;
      try {
        last = localStorage.getItem("ruangku-files-last");
      } catch {
        /* abaikan */
      }
      setView({ kind: "dir", path: last || p[0]?.path || "C:\\" });
    });
  }, []);

  const load = useCallback(async (v: View) => {
    setLoading(true);
    setError(null);
    try {
      if (v.kind === "dir") {
        setEntries(await api.listDir(v.path));
        try {
          localStorage.setItem("ruangku-files-last", v.path);
        } catch {
          /* abaikan */
        }
      } else if (v.kind === "search") setEntries(await api.search(v.root, v.query));
      else {
        const src =
          v.kind === "favorites"
            ? metas.items.filter((m) => m.favorite)
            : v.kind === "project"
              ? metas.items.filter((m) => m.projectId && subtreeIds(scope.allProjects, v.id).has(m.projectId))
              : metas.items.filter((m) => m.tags.includes(v.tag));
        const stats = await Promise.all(src.map((m) => api.stat(m.path)));
        setEntries(stats.filter((s): s is FsEntry => !!s));
      }
    } catch (e) {
      setEntries([]);
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [metas.items]);

  useEffect(() => {
    if (view) load(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const navigate = (v: View) => {
    if (view) setBack((b) => [...b, view].slice(-50));
    setFwd([]);
    setSelected([]);
    setFolderSize(null);
    setView(v);
  };
  const goBack = () => {
    const prev = back[back.length - 1];
    if (!prev || !view) return;
    setBack(back.slice(0, -1));
    setFwd([view, ...fwd]);
    setSelected([]);
    setView(prev);
  };
  const goFwd = () => {
    const next = fwd[0];
    if (!next || !view) return;
    setFwd(fwd.slice(1));
    setBack([...back, view]);
    setSelected([]);
    setView(next);
  };
  const goUp = () => dir && parent(dir) && navigate({ kind: "dir", path: parent(dir)! });
  const refresh = () => view && load(view);

  const visible = useMemo(() => {
    const list = entries.filter((e) => showHidden || !e.hidden);
    const dirFirst = (a: FsEntry, b: FsEntry) => Number(b.isDir) - Number(a.isDir);
    const cmp: Record<SortKey, (a: FsEntry, b: FsEntry) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, "id", { numeric: true, sensitivity: "base" }),
      modified: (a, b) => a.modified - b.modified,
      size: (a, b) => a.size - b.size,
      ext: (a, b) => a.ext.localeCompare(b.ext) || a.name.localeCompare(b.name),
    };
    return list.sort((a, b) => dirFirst(a, b) || (sort.asc ? 1 : -1) * cmp[sort.key](a, b));
  }, [entries, showHidden, sort]);

  const open = async (e: FsEntry) => {
    if (e.isDir) navigate({ kind: "dir", path: e.path });
    else api.open(e.path).catch((err) => toast(errorText(err), "error"));
  };

  const clickRow = (ev: React.MouseEvent, e: FsEntry) => {
    if (ev.shiftKey && anchor) {
      const i = visible.findIndex((x) => x.path === anchor);
      const j = visible.findIndex((x) => x.path === e.path);
      const [a, b] = i < j ? [i, j] : [j, i];
      setSelected(visible.slice(a, b + 1).map((x) => x.path));
    } else if (ev.ctrlKey || ev.metaKey) {
      setSelected((s) => (s.includes(e.path) ? s.filter((x) => x !== e.path) : [...s, e.path]));
      setAnchor(e.path);
    } else {
      setSelected([e.path]);
      setAnchor(e.path);
    }
    setFolderSize(null);
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      if (label) toast(label);
    } catch (e) {
      toast(errorText(e), "error");
    }
    refresh();
  };

  /** Pindahkan tag/favorit ikut saat item diganti nama atau dipindah. */
  const moveMeta = async (from: string, to: string) => {
    const affected = metas.items.filter((m) => samePath(m.path, from) || isInside(m.path, from));
    for (const m of affected) {
      const newPath = trimSep(to) + m.path.slice(trimSep(from).length);
      await metas.remove(m.id);
      await metas.save({ path: newPath, name: basename(newPath), isDir: m.isDir, tags: m.tags, favorite: m.favorite, projectId: m.projectId }, metaId(newPath));
    }
  };

  const paste = () => {
    if (!clip || !dir) return;
    const { mode, paths } = clip;
    run(mode === "copy" ? `${paths.length} item disalin` : `${paths.length} item dipindahkan`, async () => {
      if (mode === "copy") await api.copy(paths, dir);
      else {
        await api.move(paths, dir);
        // Nama tujuan bisa berubah jika bentrok; cek dulu sebelum memindah tag.
        for (const p of paths) {
          const dest = join(dir, basename(p));
          if (!samePath(p, dest) && (await api.stat(dest))) await moveMeta(p, dest);
        }
        setClip(null);
      }
    });
  };

  const toggleFavorite = async (paths: string[]) => {
    const targets = entries.filter((e) => paths.includes(e.path));
    const makeFav = targets.some((e) => !metaMap.get(metaId(e.path))?.favorite);
    for (const e of targets) {
      const m = metaMap.get(metaId(e.path));
      await metas.save({ path: e.path, name: e.name, isDir: e.isDir, tags: m?.tags ?? [], favorite: makeFav, projectId: m?.projectId }, metaId(e.path));
    }
    toast(makeFav ? "Ditambahkan ke favorit" : "Dihapus dari favorit");
  };

  const saveTags = async (paths: string[], tags: string[]) => {
    for (const p of paths) {
      const e = entries.find((x) => x.path === p);
      const m = metaMap.get(metaId(p));
      await metas.save({ path: p, name: e?.name ?? basename(p), isDir: e?.isDir ?? false, tags: [...new Set(tags)], favorite: m?.favorite, projectId: m?.projectId }, metaId(p));
    }
  };

  // Pintasan keyboard seperti di Explorer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (modal || tgt.tagName === "INPUT" || tgt.tagName === "TEXTAREA" || tgt.tagName === "SELECT") return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (k === "delete" && selected.length) setModal({ t: "trash", paths: selected });
      else if (k === "f2" && selected.length === 1) setModal({ t: "rename", path: selected[0] });
      else if (k === "f5") (e.preventDefault(), refresh());
      else if (k === "backspace" || (e.altKey && k === "arrowup")) (e.preventDefault(), goUp());
      else if (e.altKey && k === "arrowleft") goBack();
      else if (e.altKey && k === "arrowright") goFwd();
      else if (k === "enter" && selected.length === 1) {
        const en = visible.find((x) => x.path === selected[0]);
        if (en) open(en);
      } else if (ctrl && k === "a") (e.preventDefault(), setSelected(visible.map((x) => x.path)));
      else if (ctrl && k === "c" && selected.length) (setClip({ mode: "copy", paths: selected }), toast(`${selected.length} item siap ditempel`));
      else if (ctrl && k === "x" && selected.length) (setClip({ mode: "cut", paths: selected }), toast(`${selected.length} item siap dipindahkan`));
      else if (ctrl && k === "v") paste();
      else if (ctrl && e.shiftKey && k === "n") (e.preventDefault(), dir && setModal({ t: "mkdir" }));
      else if (k === "escape") setSelected([]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const close = () => setCtx(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  const one = selected.length === 1 ? entries.find((e) => e.path === selected[0]) : undefined;
  const oneMeta = one ? metaMap.get(metaId(one.path)) : undefined;
  const sortBy = (key: SortKey) => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }));
  const [sideW, setSideW, resetSideW] = usePaneWidth("files-side", 210, 160, 420);
  const [detailW, setDetailW, resetDetailW] = usePaneWidth("files-detail", 240, 200, 520);
  const arrow = (key: SortKey) => (sort.key === key ? (sort.asc ? " ↑" : " ↓") : "");

  const title =
    view?.kind === "search" ? `Hasil "${view.query}"` : view?.kind === "tag" ? `#${view.tag}` : view?.kind === "favorites" ? "Favorit" : view?.kind === "project" ? `File proyek ${scope.byId(view.id)?.name ?? ""}` : null;

  return (
    <div className="page page-files pane-host" style={{ "--pane-l": `${sideW}px` } as React.CSSProperties}>
      <PaneResizer value={sideW} onChange={setSideW} onReset={resetSideW} min={160} max={420} label="Lebar panel tempat" />
      <aside className="files-side">
        <h1>File{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
        <nav aria-label="Lokasi">
          <p className="side-label">Lokasi</p>
          {places.map((p) => (
            <button key={p.path} className={`side-item ${dir && samePath(dir, p.path) ? "active" : ""}`} onClick={() => navigate({ kind: "dir", path: p.path })}>
              {p.kind === "drive" ? <HardDrive size={16} /> : <Folder size={16} />} {p.label}
            </button>
          ))}
          {(projectFolders.length > 0 || scope.current) && <p className="side-label">Folder proyek</p>}
          {projectFolders.map((p) => (
            <button key={p.id} className={`side-item ${dir && samePath(dir, p.folder!) ? "active" : ""}`} title={p.folder} onClick={() => navigate({ kind: "dir", path: p.folder! })}>
              <ProjectMark p={p} size="sm" /> {p.name}
            </button>
          ))}
          {scope.current && (
            <button className={`side-item ${view?.kind === "project" ? "active" : ""}`} onClick={() => navigate({ kind: "project", id: scope.current!.id })}>
              <Tag size={16} /> File bertanda {scope.current.name}
            </button>
          )}
          <p className="side-label">Favorit</p>
          {favorites.length === 0 && <p className="side-empty">Tandai folder yang sering dibuka dengan bintang.</p>}
          {favorites.map((m) => (
            <button key={m.id} className={`side-item ${dir && samePath(dir, m.path) ? "active" : ""}`} title={m.path} onClick={() => (m.isDir ? navigate({ kind: "dir", path: m.path }) : api.open(m.path).catch((e) => toast(errorText(e), "error")))}>
              <Star size={16} className="star-on" /> {m.name}
            </button>
          ))}
          {allTags.length > 0 && <p className="side-label">Tag</p>}
          {allTags.map((t) => (
            <button key={t} className={`side-item ${view?.kind === "tag" && view.tag === t ? "active" : ""}`} onClick={() => navigate({ kind: "tag", tag: t })}>
              <Tag size={16} /> {t}
            </button>
          ))}
        </nav>
      </aside>

      <section className="files-main">
        <div className="addr">
          <button className="icon-btn" disabled={!back.length} onClick={goBack} aria-label="Kembali (Alt+←)"><ArrowLeft size={17} /></button>
          <button className="icon-btn" disabled={!fwd.length} onClick={goFwd} aria-label="Maju (Alt+→)"><ArrowRight size={17} /></button>
          <button className="icon-btn" disabled={!dir || !parent(dir)} onClick={goUp} aria-label="Naik satu folder"><ArrowUp size={17} /></button>
          {editingPath ? (
            <form className="addr-path" onSubmit={(e) => (e.preventDefault(), setEditingPath(false), pathText.trim() && navigate({ kind: "dir", path: pathText.trim() }))}>
              <input autoFocus value={pathText} onChange={(e) => setPathText(e.target.value)} onBlur={() => setEditingPath(false)} aria-label="Alamat folder" />
            </form>
          ) : (
            <div className="addr-path crumbs" onClick={(e) => e.target === e.currentTarget && dir && (setPathText(dir), setEditingPath(true))} title="Klik area kosong untuk mengetik alamat">
              {title ? (
                <span className="crumb-current">{title}</span>
              ) : (
                dir &&
                crumbs(dir).map((c, i, arr) => (
                  <span key={c.path} className="crumb-wrap">
                    <button className={`crumb ${i === arr.length - 1 ? "crumb-current" : ""}`} onClick={() => navigate({ kind: "dir", path: c.path })}>{c.label}</button>
                    {i < arr.length - 1 && <span className="crumb-sep">›</span>}
                  </span>
                ))
              )}
            </div>
          )}
          <button className="icon-btn" onClick={refresh} aria-label="Muat ulang (F5)"><RefreshCw size={16} className={loading ? "spin" : ""} /></button>
          <form
            className="search search-sm"
            onSubmit={(e) => {
              e.preventDefault();
              const root = dir ?? (view?.kind === "search" ? view.root : places[0]?.path);
              if (query.trim() && root) navigate({ kind: "search", root, query: query.trim() });
            }}
          >
            <Search size={15} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={dir ? `Cari di ${basename(dir)}` : "Cari file"} aria-label="Cari file" />
          </form>
        </div>

        <div className="files-toolbar">
          <button className="tb" disabled={!dir} onClick={() => setModal({ t: "mkdir" })} title="Ctrl+Shift+N"><FolderPlus size={16} /> Folder baru</button>
          <button className="tb" disabled={!dir} onClick={() => setModal({ t: "mkfile" })}><FilePlus size={16} /> File baru</button>
          <span className="tb-sep" />
          <button className="tb" aria-label="Salin" title="Salin (Ctrl+C)" disabled={!selected.length} onClick={() => (setClip({ mode: "copy", paths: selected }), toast(`${selected.length} item siap ditempel`))}><Copy size={16} /> <span className="tb-text">Salin</span></button>
          <button className="tb" aria-label="Potong" title="Potong (Ctrl+X)" disabled={!selected.length} onClick={() => (setClip({ mode: "cut", paths: selected }), toast(`${selected.length} item siap dipindahkan`))}><Scissors size={16} /> <span className="tb-text">Potong</span></button>
          <button className="tb" aria-label="Tempel" title="Tempel (Ctrl+V)" disabled={!clip || !dir} onClick={paste}><ClipboardPaste size={16} /> <span className="tb-text">Tempel</span>{clip ? ` (${clip.paths.length})` : ""}</button>
          <span className="tb-sep" />
          <button className="tb" aria-label="Ganti nama" title="Ganti nama (F2)" disabled={selected.length !== 1} onClick={() => setModal({ t: "rename", path: selected[0] })}><Pencil size={16} /> <span className="tb-text">Ganti nama</span></button>
          <button className="tb" aria-label="Tag" title="Tag" disabled={!selected.length} onClick={() => setModal({ t: "tags", paths: selected })}><Tag size={16} /> <span className="tb-text">Tag</span></button>
          <button className="tb" aria-label="Favorit" title="Favorit" disabled={!selected.length} onClick={() => toggleFavorite(selected)}><Star size={16} /> <span className="tb-text">Favorit</span></button>
          <button className="tb tb-danger" aria-label="Hapus" title="Hapus (Delete)" disabled={!selected.length} onClick={() => setModal({ t: "trash", paths: selected })}><Trash2 size={16} /> <span className="tb-text">Hapus</span></button>
          <span className="tb-grow" />
          <button
            className="tb"
            onClick={() => setShowHidden(!showHidden)}
            aria-pressed={showHidden}
            aria-label="Tampilkan file tersembunyi"
            title={showHidden ? "Sembunyikan file tersembunyi" : "Tampilkan file tersembunyi"}
          >
            {showHidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
        </div>

        <div className="files-body pane-host" style={{ "--pane-r": `${detailW}px` } as React.CSSProperties}>
          <PaneResizer value={detailW} onChange={setDetailW} onReset={resetDetailW} edge="right" min={200} max={520} label="Lebar panel detail file" />
          <div className="file-table" role="grid" aria-label="Isi folder" aria-multiselectable="true" onClick={(e) => e.target === e.currentTarget && setSelected([])}>
            <div className="file-row file-head" role="row">
              <button role="columnheader" onClick={() => sortBy("name")}>Nama{arrow("name")}</button>
              <button role="columnheader" onClick={() => sortBy("modified")}>Diubah{arrow("modified")}</button>
              <button role="columnheader" onClick={() => sortBy("ext")}>Jenis{arrow("ext")}</button>
              <button role="columnheader" className="num" onClick={() => sortBy("size")}>Ukuran{arrow("size")}</button>
            </div>
            {error && <div className="files-msg error">{error}</div>}
            {!error && !loading && visible.length === 0 && (
              <div className="files-msg">
                {view?.kind === "search" ? "Tidak ada yang cocok. Coba kata lain atau cari dari folder yang lebih atas." : view?.kind === "dir" ? "Folder ini kosong." : "Belum ada item di sini."}
              </div>
            )}
            {visible.map((e) => {
              const m = metaMap.get(metaId(e.path));
              const sel = selected.includes(e.path);
              const cut = clip?.mode === "cut" && clip.paths.includes(e.path);
              return (
                <div
                  key={e.path}
                  role="row"
                  aria-selected={sel}
                  tabIndex={0}
                  className={`file-row ${sel ? "selected" : ""} ${cut ? "is-cut" : ""} ${e.hidden ? "is-hidden" : ""}`}
                  onClick={(ev) => clickRow(ev, e)}
                  onDoubleClick={() => open(e)}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    if (!sel) setSelected([e.path]);
                    setCtx({ x: ev.clientX, y: ev.clientY });
                  }}
                >
                  <span className="file-name" role="gridcell">
                    <FileIcon e={e} />
                    <span className="file-name-text">{e.name}</span>
                    {m?.favorite && <Star size={13} className="star-on" />}
                    {m?.tags.map((t) => <span key={t} className="tag tag-xs">#{t}</span>)}
                    {view?.kind !== "dir" && <span className="file-loc muted">{parent(e.path)}</span>}
                  </span>
                  <span role="gridcell" className="muted">{e.modified ? `${dateShort(e.modified)} ${time(e.modified)}` : ""}</span>
                  <span role="gridcell" className="muted">{e.isDir ? "Folder" : KIND_LABEL[e.ext] ?? (e.ext ? e.ext.toUpperCase() : "File")}</span>
                  <span role="gridcell" className="num muted">{e.isDir ? "" : formatBytes(e.size)}</span>
                </div>
              );
            })}
          </div>

          <aside className="file-detail">
            {one ? (
              <>
                <div className="detail-icon"><FileIcon e={one} /></div>
                <h2 className="detail-name">{one.name}</h2>
                <FilePreview file={one} />
                <dl className="detail-list">
                  <div><dt>Jenis</dt><dd>{one.isDir ? "Folder" : KIND_LABEL[one.ext] ?? one.ext.toUpperCase()}</dd></div>
                  <div>
                    <dt>Ukuran</dt>
                    <dd>
                      {!one.isDir ? formatBytes(one.size) : folderSize?.path === one.path ? `${formatBytes(folderSize.bytes)}, ${folderSize.files} file` : (
                        <button className="link" onClick={async () => { const [bytes, files] = await api.dirSize(one.path); setFolderSize({ path: one.path, bytes, files }); }}>Hitung ukuran</button>
                      )}
                    </dd>
                  </div>
                  <div><dt>Diubah</dt><dd>{dateShort(one.modified)}, {time(one.modified)}</dd></div>
                  <div><dt>Lokasi</dt><dd className="break">{parent(one.path)}</dd></div>
                </dl>
                <label className="detail-project">
                  <span>Proyek</span>
                  <ProjectSelect
                    value={oneMeta?.projectId}
                    projects={scope.allProjects}
                    onChange={(projectId) => metas.save({ path: one.path, name: one.name, isDir: one.isDir, tags: oneMeta?.tags ?? [], favorite: oneMeta?.favorite, projectId }, metaId(one.path))}
                  />
                </label>
                <div className="detail-tags">
                  {(oneMeta?.tags ?? []).map((t) => <span key={t} className="tag">#{t}</span>)}
                  <button className="chip-btn" onClick={() => setModal({ t: "tags", paths: [one.path] })}><Tag size={13} /> {oneMeta?.tags.length ? "Ubah tag" : "Tambah tag"}</button>
                </div>
                <div className="detail-actions">
                  <button className="btn btn-primary" onClick={() => open(one)}>{one.isDir ? <><Folder size={15} /> Buka folder</> : <><ExternalLink size={15} /> Buka</>}</button>
                  <button className="btn" onClick={() => api.reveal(one.path).catch((e) => toast(errorText(e), "error"))}><FolderSearch size={15} /> Tampilkan di Explorer</button>
                  <button className="btn" onClick={() => toggleFavorite([one.path])}>{oneMeta?.favorite ? <><StarOff size={15} /> Hapus favorit</> : <><Star size={15} /> Jadikan favorit</>}</button>
                </div>
              </>
            ) : selected.length > 1 ? (
              <p className="muted">{selected.length} item dipilih. Total {formatBytes(entries.filter((e) => selected.includes(e.path)).reduce((s, e) => s + e.size, 0))} (tanpa isi folder).</p>
            ) : (
              <p className="muted small">
                Pilih item untuk melihat detail. Klik ganda untuk membuka. Ctrl+klik atau Shift+klik untuk memilih beberapa. Hapus selalu masuk ke Recycle Bin.
              </p>
            )}
          </aside>
        </div>
      </section>

      {ctx && (
        <div className="menu menu-ctx" style={{ left: ctx.x, top: ctx.y }} role="menu">
          {selected.length === 1 && <button onClick={() => { const e = entries.find((x) => x.path === selected[0]); if (e) open(e); }}><ExternalLink size={14} /> Buka</button>}
          {selected.length === 1 && <button onClick={() => api.reveal(selected[0])}><FolderSearch size={14} /> Tampilkan di Explorer</button>}
          <button onClick={() => (setClip({ mode: "copy", paths: selected }), toast(`${selected.length} item siap ditempel`))}><Copy size={14} /> Salin</button>
          <button onClick={() => (setClip({ mode: "cut", paths: selected }), toast(`${selected.length} item siap dipindahkan`))}><Scissors size={14} /> Potong</button>
          {selected.length === 1 && <button onClick={() => setModal({ t: "rename", path: selected[0] })}><Pencil size={14} /> Ganti nama</button>}
          <button onClick={() => setModal({ t: "tags", paths: selected })}><Tag size={14} /> Tag</button>
          <button onClick={() => toggleFavorite(selected)}><Star size={14} /> Favorit</button>
          <button className="danger" onClick={() => setModal({ t: "trash", paths: selected })}><Trash2 size={14} /> Hapus ke Recycle Bin</button>
        </div>
      )}

      {modal?.t === "mkdir" && dir && (
        <NameModal title="Folder baru" initial="Folder baru" cta="Buat folder" onClose={() => setModal(null)} onSubmit={(n) => run("Folder dibuat", () => api.mkdir(dir, n))} />
      )}
      {modal?.t === "mkfile" && dir && (
        <NameModal title="File baru" initial="Dokumen baru.txt" cta="Buat file" onClose={() => setModal(null)} onSubmit={(n) => run("File dibuat", () => api.createFile(dir, n))} />
      )}
      {modal?.t === "rename" && (
        <NameModal
          title="Ganti nama"
          initial={basename(modal.path)}
          cta="Ganti nama"
          onClose={() => setModal(null)}
          onSubmit={(n) => {
            const from = modal.path;
            run("", async () => {
              const e = await api.rename(from, n);
              await moveMeta(from, e.path);
              setSelected([e.path]);
            });
          }}
        />
      )}
      {modal?.t === "tags" && (
        <TagModal paths={modal.paths} metas={metaMap} allTags={allTags} onClose={() => setModal(null)} onSave={(t) => saveTags(modal.paths, t)} />
      )}
      {modal?.t === "trash" && (
        <Confirm
          title="Pindahkan ke Recycle Bin?"
          text={modal.paths.length === 1 ? `"${basename(modal.paths[0])}" akan dipindahkan ke Recycle Bin. Anda masih bisa memulihkannya dari sana.` : `${modal.paths.length} item akan dipindahkan ke Recycle Bin. Anda masih bisa memulihkannya dari sana.`}
          confirmLabel="Pindahkan ke Recycle Bin"
          onClose={() => setModal(null)}
          onConfirm={() => {
            const paths = modal.paths;
            run(`${paths.length} item dipindahkan ke Recycle Bin`, async () => {
              await api.trash(paths);
              for (const p of paths) {
                for (const m of metas.items.filter((x) => samePath(x.path, p) || isInside(x.path, p))) await metas.remove(m.id);
              }
              setSelected([]);
            });
          }}
        />
      )}
    </div>
  );
}
