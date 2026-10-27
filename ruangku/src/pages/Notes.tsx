import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import { BookMarked, ChevronRight, FilePlus2, ImagePlus, LayoutTemplate, Link2, MoveHorizontal, PanelLeft, Pin, PinOff, Plus, Search, SmilePlus, StickyNote, Trash2 } from "lucide-react";
import type { Item, Note, TimeBlock } from "../lib/types";
import { useRecords, strip } from "../lib/useRecords";
import { api, emitTo, isDesktop, newId, onEvent } from "../lib/api";
import { relativeAgo, dateShort, parseDateKey } from "../lib/date";
import { ancestors, backlinks, BUILTIN_TEMPLATES, children, fillTemplate, isDescendant, PAGE_ICONS, Template } from "../lib/notesTree";
import { useTasks } from "../lib/useTasks";
import { Confirm, Modal, useToast } from "../components/ui";
import BlockEditor, { insertMarkdown } from "../notes/BlockEditor";
import { useScope } from "../lib/scope";
import { ProjectChip, ProjectSelect } from "../projects/ProjectSwitcher";
import { useOpenRequest } from "../lib/deeplink";
import Comments from "../collab/Comments";
import BibImport from "../notes/BibImport";
import { useAccess } from "../lib/access";
import { useTrashNote } from "../sidebar/useTrash";
import { EmojiPicker } from "../components/EmojiPicker";
import type { MenuAt } from "../components/ContextMenu";
import { COVER_GRADIENTS, coverCss, randomCover } from "../notes/covers";
import { imageFileToDataUrl } from "../notes/images";
import { subtreeIds } from "../lib/projects";
import { isTaskDone } from "../lib/tasks";
import { dateKey } from "../lib/date";
import { fmtMin } from "../lib/timeblocks";
import { PaneResizer, usePaneWidth } from "../components/Pane";

const LAST = "ruangku-notes-last";

function TreeNode({ n, notes, depth, current, open, toggle, select, onDropOn }: { n: Item<Note>; notes: Item<Note>[]; depth: number; current: string | null; open: Set<string>; toggle: (id: string) => void; select: (id: string) => void; onDropOn: (dragId: string, targetId: string | null) => void }) {
  const kids = children(notes, n.id);
  const [over, setOver] = useState(false);
  return (
    <li>
      <div
        className={`nt-item ${current === n.id ? "active" : ""} ${over ? "over" : ""}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable
        onDragStart={(e) => (e.dataTransfer.setData("text/note", n.id), e.stopPropagation())}
        onDragOver={(e) => e.dataTransfer.types.includes("text/note") && (e.preventDefault(), e.stopPropagation(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => (e.preventDefault(), e.stopPropagation(), setOver(false), onDropOn(e.dataTransfer.getData("text/note"), n.id))}
      >
        <button className={`nt-toggle ${kids.length ? "" : "empty"}`} onClick={() => toggle(n.id)} aria-label={open.has(n.id) ? "Tutup" : "Buka"} tabIndex={kids.length ? 0 : -1}>
          {kids.length > 0 && <ChevronRight size={13} style={{ transform: open.has(n.id) ? "rotate(90deg)" : "none" }} />}
        </button>
        <button className="nt-label" onClick={() => select(n.id)}>
          <span className="nt-icon">{n.icon ?? "📄"}</span>
          <span className="nt-title">{n.title || "Tanpa judul"}</span>
          {n.pinned && <Pin size={11} className="nt-pin" />}
        </button>
      </div>
      {open.has(n.id) && kids.length > 0 && (
        <ul>
          {kids.map((k) => <TreeNode key={k.id} n={k} notes={notes} depth={depth + 1} current={current} open={open} toggle={toggle} select={select} onDropOn={onDropOn} />)}
        </ul>
      )}
    </li>
  );
}

function TemplatePicker({ userTemplates, onPick, onClose }: { userTemplates: Item<Note>[]; onPick: (t: Template) => void; onClose: () => void }) {
  const all: Template[] = [
    { id: "kosong", name: "Halaman kosong", icon: "📄", title: "", body: "" },
    ...BUILTIN_TEMPLATES,
    ...userTemplates.map((n) => ({ id: n.id, name: n.title || "Template tanpa judul", icon: n.icon ?? "🧩", title: n.title, body: n.body, tags: n.tags })),
  ];
  return (
    <Modal title="Pilih template" onClose={onClose} wide>
      <div className="nt-templates">
        {all.map((t) => (
          <button key={t.id} className="nt-tpl" onClick={() => (onPick(t), onClose())}>
            <span className="nt-tpl-icon">{t.icon}</span>
            <b>{t.name}</b>
            <span className="muted small">{t.body ? t.body.replace(/[#*>`\-[\]]/g, "").replace(/\s+/g, " ").trim().slice(0, 70) : "Mulai dari nol"}</span>
          </button>
        ))}
      </div>
      <p className="muted small">Simpan halaman mana pun sebagai template lewat tombol "Jadikan template". Penanda {"{{tanggal}}"} dan {"{{hari}}"} diisi otomatis.</p>
    </Modal>
  );
}

export default function Notes() {
  const { items, save, loading } = useRecords<Note>("note");
  const access = useAccess();
  const [bib, setBib] = useState(false);
  const tasks = useTasks();
  const toast = useToast();
  const [current, setCurrent] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST);
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [showDaily, setShowDaily] = useState(false);
  const [picker, setPicker] = useState<null | "new" | "insert">(null);
  const [iconAt, setIconAt] = useState<MenuAt | null>(null);
  const [coverAt, setCoverAt] = useState<MenuAt | null>(null);
  const [sideOpen, setSideOpen] = useState(() => {
    try {
      return localStorage.getItem("ruangku-notes-side") === "1";
    } catch {
      return false;
    }
  });
  const toggleSide = () =>
    setSideOpen((v) => {
      try {
        localStorage.setItem("ruangku-notes-side", v ? "0" : "1");
      } catch {
        /* abaikan */
      }
      return !v;
    });
  const blocks = useRecords<TimeBlock>("timeblock");
  const [del, setDel] = useState<Item<Note> | null>(null);
  const [rootOver, setRootOver] = useState(false);
  const editorRef = useRef<Editor | null>(null);

  const scope = useScope();
  const effProject = (n: Item<Note>): string | undefined => {
    let cur: Item<Note> | undefined = n;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      if (cur.projectId) return cur.projectId;
      seen.add(cur.id);
      cur = cur.parentId ? items.find((x) => x.id === cur!.parentId) : undefined;
    }
    return undefined;
  };
  const pages = items.filter((n) => !n.isTemplate && !n.date && scope.match(effProject(n)));
  const daily = items.filter((n) => n.date && scope.match(n.projectId)).sort((a, b) => b.date!.localeCompare(a.date!));

  // Dibuka dari sticky note / widget: setting "open_note" = "<id>:<waktu>".
  useEffect(() => {
    const open = () =>
      api.getSetting("open_note").then((v) => {
        const id = v?.split(":")[0];
        if (id && items.some((x) => x.id === id)) setCurrent(id);
      });
    return onEvent<string>("setting-changed", (k) => k === "open_note" && open());
  }, [items]);
  useOpenRequest("note", (id) => setCurrent(id), !loading);
  const templates = items.filter((n) => n.isTemplate);
  const note = items.find((n) => n.id === current) ?? pages[0] ?? null;
  const tags = useMemo(() => [...new Set(items.flatMap((n) => n.tags))].filter((t) => !t.startsWith("ref:") && t !== "pustaka-item").sort(), [items]);

  useEffect(() => {
    if (!note) return;
    try {
      localStorage.setItem(LAST, note.id);
    } catch {
      /* abaikan */
    }
    window.dispatchEvent(new CustomEvent("ruangku:note-current", { detail: note.id }));
    // Buka semua induk supaya halaman terlihat di pohon.
    const anc = ancestors(items, note.id);
    if (anc.some((a) => !open.has(a.id))) setOpen((s) => new Set([...s, ...anc.map((a) => a.id)]));
    if (note.date) setShowDaily(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id]);

  const create = async (opts: { parentId?: string; title?: string; tpl?: Template } = {}) => {
    const t = opts.tpl;
    const id = newId();
    await save({ title: opts.title ?? (t ? fillTemplate(t.title) : ""), body: t ? fillTemplate(t.body) : "", tags: t?.tags ?? [], icon: t && t.id !== "kosong" ? t.icon : undefined, parentId: opts.parentId, projectId: opts.parentId ? undefined : scope.defaultProjectId }, id);
    if (opts.parentId) setOpen((s) => new Set([...s, opts.parentId!]));
    return id;
  };

  const set = (patch: Partial<Note>) => note && save({ ...strip(note), ...patch }, note.id);

  const moveNote = (dragId: string, targetId: string | null) => {
    const n = items.find((x) => x.id === dragId);
    if (!n || dragId === targetId) return;
    if (targetId && isDescendant(items, targetId, dragId)) return toast("Halaman tidak bisa dipindah ke dalam subhalamannya sendiri", "error");
    save({ ...strip(n), parentId: targetId ?? undefined, date: undefined, isTemplate: false }, n.id);
    if (targetId) setOpen((s) => new Set([...s, targetId]));
  };

  const trashNote = useTrashNote();
  const removeNote = async (n: Item<Note>) => {
    setCurrent(n.parentId ?? null);
    await trashNote(n);
  };

  const hooks = {
    pages: pages.map((p) => ({ id: p.id, title: p.title, icon: p.icon })),
    createPage: (title: string) => create({ parentId: note?.id, title }),
    createTask: (title: string) => tasks.create({ title }),
    openPage: (id: string) => (items.some((x) => x.id === id) ? setCurrent(id) : toast("Halaman yang ditautkan sudah dihapus", "error")),
    openTask: (id: string) => {
      try {
        localStorage.setItem("ruangku-open-task", id);
      } catch {
        /* abaikan */
      }
      emitTo("main", "navigate", "tasks");
    },
    pickTemplate: () => setPicker("insert"),
    notify: (msg: string, kind?: "info" | "error") => toast(msg, kind),
    agendaMarkdown: () => {
      const d = dateKey();
      const list = blocks.items.filter((b) => b.date === d && !b.tracked).sort((a, b) => a.start - b.start);
      return list.map((b) => `- ${fmtMin(b.start)}–${fmtMin(b.end)} ${b.kind === "rapat" ? "🤝 " : b.kind === "kuliah" ? "🎓 " : ""}${b.title}${b.location ? ` · ${b.location}` : ""}`).join("\n");
    },
    projectTasks: () => {
      const pid = note ? effProject(note) : undefined;
      const ids = pid ? subtreeIds(scope.allProjects, pid) : null;
      return tasks.tasks.filter((t) => !t.parentId && (!ids || ids.has(t.projectId)) && !isTaskDone(t, tasks.projects)).slice(0, 25).map((t) => ({ id: t.id, title: t.title }));
    },
  };

  const searchHits = q.trim() || tag ? items.filter((n) => (!tag || n.tags.includes(tag)) && (!q.trim() || `${n.title} ${n.body}`.toLowerCase().includes(q.trim().toLowerCase()))) : null;
  const anc = note ? ancestors(items, note.id) : [];
  const [sideW, setSideW, resetSideW] = usePaneWidth("notes-side", 290, 200, 560);
  const subs = note ? children(items, note.id) : [];
  const back = note ? backlinks(items, note.id) : [];

  return (
    <div className={`page page-split notes2 pane-host ${sideOpen ? "" : "side-hidden"}`} style={sideOpen ? { gridTemplateColumns: `${sideW}px minmax(0, 1fr)` } : undefined}>
      {sideOpen && <PaneResizer value={sideW} onChange={setSideW} onReset={resetSideW} min={200} max={560} label="Lebar daftar halaman" />}
      <aside className="notes-side">
        <div className="notes-side-head">
          <h1>Catatan{scope.current ? <span className="page-scope"> · {scope.current.name}</span> : null}</h1>
          <div className="nt-new">
            <button className="btn btn-primary btn-sm" onClick={async () => setCurrent(await create())} title="Halaman baru (Ctrl+N)"><Plus size={15} /> Baru</button>
            <button className="icon-btn" onClick={() => setPicker("new")} title="Dari template" aria-label="Halaman baru dari template"><LayoutTemplate size={16} /></button>
            <button className="icon-btn" onClick={() => setBib(true)} title="Impor daftar pustaka (BibTeX/Zotero)" aria-label="Impor daftar pustaka"><BookMarked size={16} /></button>
          </div>
        </div>
        <label className="search">
          <Search size={15} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di semua catatan" />
        </label>
        {tags.length > 0 && (
          <div className="chips">
            {tags.map((t) => <button key={t} className={`chip ${tag === t ? "active" : ""}`} onClick={() => setTag(tag === t ? null : t)}>#{t}</button>)}
          </div>
        )}
        <div className="nt-scroll">
          {searchHits ? (
            <ul className="nt-tree">
              {searchHits.map((n) => (
                <li key={n.id}>
                  <button className={`nt-hit ${note?.id === n.id ? "active" : ""}`} onClick={() => setCurrent(n.id)}>
                    <span className="nt-icon">{n.icon ?? (n.date ? "🗓️" : "📄")}</span>
                    <span className="nt-title">{n.title || "Tanpa judul"}</span>
                  </button>
                </li>
              ))}
              {searchHits.length === 0 && <li className="muted small pad">Tidak ada yang cocok.</li>}
            </ul>
          ) : (
            <>
              <ul
                className={`nt-tree ${rootOver ? "over" : ""}`}
                onDragOver={(e) => e.dataTransfer.types.includes("text/note") && (e.preventDefault(), setRootOver(true))}
                onDragLeave={() => setRootOver(false)}
                onDrop={(e) => (e.preventDefault(), setRootOver(false), moveNote(e.dataTransfer.getData("text/note"), null))}
              >
                {children(items, null).map((n) => (
                  <TreeNode key={n.id} n={n} notes={items} depth={0} current={note?.id ?? null} open={open} toggle={(id) => setOpen((s) => { const x = new Set(s); x.has(id) ? x.delete(id) : x.add(id); return x; })} select={setCurrent} onDropOn={moveNote} />
                ))}
                {!loading && pages.length === 0 && <li className="muted small pad">Belum ada halaman.</li>}
              </ul>
              {daily.length > 0 && (
                <div className="nt-group">
                  <button className="nt-group-head" onClick={() => setShowDaily(!showDaily)}>
                    <ChevronRight size={13} style={{ transform: showDaily ? "rotate(90deg)" : "none" }} /> Catatan harian <span className="side-count">{daily.length}</span>
                  </button>
                  {showDaily && (
                    <ul className="nt-tree">
                      {daily.map((n) => (
                        <li key={n.id}>
                          <button className={`nt-hit ${note?.id === n.id ? "active" : ""}`} onClick={() => setCurrent(n.id)}>
                            <span className="nt-icon">🗓️</span>
                            <span className="nt-title">{n.title || "Tanpa judul"}</span>
                            <span className="muted small">{dateShort(parseDateKey(n.date!).getTime())}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {templates.length > 0 && (
                <div className="nt-group">
                  <p className="nt-group-head static">Template saya</p>
                  <ul className="nt-tree">
                    {templates.map((n) => (
                      <li key={n.id}>
                        <button className={`nt-hit ${note?.id === n.id ? "active" : ""}`} onClick={() => setCurrent(n.id)}>
                          <span className="nt-icon">{n.icon ?? "🧩"}</span>
                          <span className="nt-title">{n.title || "Tanpa judul"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
        <p className="muted small nt-hint">Seret halaman ke halaman lain untuk menjadikannya subhalaman, atau ke area kosong untuk mengembalikannya ke tingkat atas.</p>
      </aside>

      <section className="notes-main">
        {note ? (
          <article className={`nt-page ${note.wide ? "wide" : ""}`} key={note.id}>
            <nav className="nt-crumbs" aria-label="Lokasi halaman">
              <button className={`icon-btn ${sideOpen ? "on" : ""}`} onClick={toggleSide} title={sideOpen ? "Sembunyikan panel catatan" : "Tampilkan panel catatan (cari, tag, catatan harian, template)"} aria-label="Panel catatan">
                <PanelLeft size={16} />
              </button>
              {anc.map((a) => (
                <span key={a.id}>
                  <button onClick={() => setCurrent(a.id)}>{a.icon ?? "📄"} {a.title || "Tanpa judul"}</button>
                  <ChevronRight size={12} />
                </span>
              ))}
              {note.date && <span className="muted small">Catatan harian · </span>}
              {note.isTemplate && <span className="nt-badge">Template</span>}
              <span className="muted small">Disimpan otomatis · diubah {relativeAgo(note.updatedAt)}</span>
              <span className="nt-actions">
                <button className="icon-btn" title={note.pinned ? "Lepas sematan" : "Sematkan"} onClick={() => set({ pinned: !note.pinned })}>{note.pinned ? <PinOff size={16} /> : <Pin size={16} />}</button>
                <button
                  className={`icon-btn ${note.sticky ? "on" : ""}`}
                  title={note.sticky ? "Sudah ditempel di desktop (klik untuk menampilkan)" : "Tempel di desktop sebagai sticky note"}
                  onClick={async () => {
                    if (!note.sticky) await set({ sticky: { color: "kunyit" } });
                    await api.stickyOpen(note.id);
                    toast(isDesktop ? "Catatan ditempel di desktop" : "Di aplikasi desktop, catatan ini muncul sebagai sticky note");
                  }}
                >
                  <StickyNote size={16} />
                </button>
                <button className="icon-btn" title="Subhalaman baru" onClick={async () => setCurrent(await create({ parentId: note.id }))}><FilePlus2 size={16} /></button>
                <button className="chip-btn" onClick={() => set({ isTemplate: !note.isTemplate, parentId: undefined })}>{note.isTemplate ? "Jadikan halaman biasa" : "Jadikan template"}</button>
                <button className="icon-btn" title="Hapus halaman" onClick={() => setDel(note)}><Trash2 size={16} /></button>
              </span>
            </nav>

            {note.cover && coverCss(note.cover) && (
              <div className="nt-cover" style={{ background: coverCss(note.cover), backgroundSize: "cover", backgroundPosition: "center" }}>
                <div className="nt-cover-acts">
                  <button onClick={(e) => setCoverAt({ x: e.currentTarget.getBoundingClientRect().left - 200, y: e.currentTarget.getBoundingClientRect().bottom + 6 })}>Ganti sampul</button>
                  <button onClick={() => set({ cover: undefined })}>Hapus</button>
                </div>
              </div>
            )}
            <div className="nt-hover-acts">
              {!note.icon && (
                <button onClick={() => set({ icon: PAGE_ICONS[Math.floor(Math.random() * PAGE_ICONS.length)] })}>
                  <SmilePlus size={14} /> Tambah ikon
                </button>
              )}
              {!note.cover && (
                <button onClick={() => set({ cover: randomCover() })}>
                  <ImagePlus size={14} /> Tambah sampul
                </button>
              )}
              <button onClick={() => set({ wide: !note.wide })}>
                <MoveHorizontal size={14} /> {note.wide ? "Lebar standar" : "Lebar penuh"}
              </button>
            </div>
            <div className="nt-title-row">
              <div className="nt-icon-wrap">
                <button className="nt-page-icon" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setIconAt({ x: r.left, y: r.bottom + 4 }); }} aria-label="Ganti ikon">{note.icon ?? "📄"}</button>
              </div>
              <TitleInput value={note.title} onCommit={(title) => set({ title })} autoFocus={!note.title && !note.body && Date.now() - note.updatedAt < 5000} />
            </div>
            <div className="nt-meta-row">
              <TagInput value={note.tags} onCommit={(t) => set({ tags: t })} />
              {!note.parentId ? (
                <label className="nt-project" title="Proyek halaman ini (subhalaman ikut)">
                  <span>Proyek</span>
                  <ProjectSelect value={note.projectId} onChange={(projectId) => set({ projectId })} projects={scope.allProjects} />
                </label>
              ) : (
                effProject(note) && <ProjectChip id={effProject(note)} />
              )}
            </div>

            {access.readOnly(effProject(note)) && <p className="ro-banner">Anda pembaca di proyek ini: halaman hanya bisa dilihat dan dikomentari oleh anggota lain.</p>}
            <BlockEditor key={note.id} id={note.id} markdown={note.body} onChange={(body) => body !== note.body && set({ body })} hooks={hooks} onEditor={(e) => (editorRef.current = e)} readOnly={access.readOnly(effProject(note))} />

            {subs.length > 0 && (
              <section className="nt-subs">
                <h3>Subhalaman</h3>
                <div className="nt-cards">
                  {subs.map((s) => (
                    <button key={s.id} className="nt-card" onClick={() => setCurrent(s.id)}>
                      <span className="nt-icon">{s.icon ?? "📄"}</span>
                      <b>{s.title || "Tanpa judul"}</b>
                      <span className="muted small">{relativeAgo(s.updatedAt)}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {back.length > 0 && (
              <section className="nt-subs">
                <h3><Link2 size={14} /> Disebut di</h3>
                <ul className="nt-backlinks">
                  {back.map((b) => (
                    <li key={b.id}><button onClick={() => setCurrent(b.id)}>{b.icon ?? "📄"} {b.title || "Tanpa judul"}</button></li>
                  ))}
                </ul>
              </section>
            )}
            <div className="nt-comments">
              <Comments target="note" targetId={note.id} projectId={effProject(note)} readOnly={access.readOnly(effProject(note))} />
            </div>
          </article>
        ) : (
          !loading && (
            <div className="empty">
              <p className="empty-title">Mulai halaman pertama Anda</p>
              <p className="empty-text">Ketik / untuk memilih blok: judul, daftar centang, callout, kode, subhalaman. Ketik [[ untuk menautkan halaman lain.</p>
              <button className="btn btn-primary" onClick={async () => setCurrent(await create())}><Plus size={16} /> Halaman baru</button>
            </div>
          )
        )}
      </section>

      {iconAt && note && <EmojiPicker at={iconAt} onClose={() => setIconAt(null)} onPick={(icon) => set({ icon })} onRemove={() => set({ icon: undefined })} />}
      {coverAt && note && <CoverPicker at={coverAt} onClose={() => setCoverAt(null)} onPick={(cover) => set({ cover })} onError={(m) => toast(m, "error")} />}
      {bib && <BibImport notes={items} save={(n, id) => save(n, id)} onClose={() => setBib(false)} onDone={(id) => setCurrent(id)} />}
      {picker && (
        <TemplatePicker
          userTemplates={templates}
          onClose={() => setPicker(null)}
          onPick={async (t) => {
            if (picker === "insert") return insertMarkdown(editorRef.current, fillTemplate(t.body));
            setCurrent(await create({ tpl: t }));
          }}
        />
      )}
      {del && (
        <Confirm
          title="Pindahkan ke Sampah?"
          text={`"${del.title || "Tanpa judul"}"${items.some((x) => x.parentId === del.id) ? " beserta subhalamannya" : ""} dipindahkan ke Sampah. Anda bisa memulihkannya dari Sampah di bawah sidebar selama 30 hari.`}
          confirmLabel="Pindahkan ke Sampah"
          onConfirm={() => removeNote(del)}
          onClose={() => setDel(null)}
        />
      )}
    </div>
  );
}

function CoverPicker({ at, onPick, onClose, onError }: { at: MenuAt; onPick: (cover: string) => void; onClose: () => void; onError: (msg: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState("");
  useEffect(() => {
    const down = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", down, true);
    return () => window.removeEventListener("mousedown", down, true);
  }, [onClose]);
  const pick = (c: string) => (onPick(c), onClose());
  return (
    <div ref={ref} className="cover-pop" style={{ left: Math.max(8, Math.min(at.x, window.innerWidth - 370)), top: at.y }}>
      <p className="small muted">Gradasi</p>
      <div className="cover-grid">
        {Object.entries(COVER_GRADIENTS).map(([k, css]) => (
          <button key={k} title={k} aria-label={`Sampul ${k}`} style={{ background: css }} onClick={() => pick(`grad:${k}`)} />
        ))}
      </div>
      <div className="btn-row">
        <button
          className="btn btn-sm"
          onClick={() => {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/*";
            input.onchange = async () => {
              const f = input.files?.[0];
              if (!f) return;
              try {
                pick(await imageFileToDataUrl(f));
              } catch {
                onError("Gambar tidak bisa dibaca");
              }
            };
            input.click();
          }}
        >
          <ImagePlus size={14} /> Unggah gambar
        </button>
      </div>
      <form className="btn-row" style={{ marginTop: 8 }} onSubmit={(e) => (e.preventDefault(), /^https?:\/\//.test(url) ? pick(url) : onError("Isi alamat gambar yang diawali https://"))}>
        <input className="grow" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Atau tempel URL gambar…" />
        <button className="btn btn-sm" type="submit">Pakai</button>
      </form>
    </div>
  );
}

function TitleInput({ value, onCommit, autoFocus }: { value: string; onCommit: (v: string) => void; autoFocus?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <textarea
      autoFocus={autoFocus}
      className="nt-title-input"
      rows={1}
      value={v}
      placeholder="Tanpa judul"
      aria-label="Judul halaman"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (e.target as HTMLTextAreaElement).blur(), document.querySelector<HTMLElement>(".be")?.focus())}
    />
  );
}

function TagInput({ value, onCommit }: { value: string[]; onCommit: (v: string[]) => void }) {
  const [v, setV] = useState(value.join(", "));
  useEffect(() => setV(value.join(", ")), [value]);
  return (
    <input
      className="editor-tags"
      value={v}
      placeholder="Tag, pisahkan dengan koma"
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const t = [...new Set(v.split(",").map((x) => x.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))];
        if (t.join() !== value.join()) onCommit(t);
      }}
    />
  );
}
