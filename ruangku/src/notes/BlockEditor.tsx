// Editor blok ala Notion: ketik "/" untuk perintah, "[[" untuk menautkan halaman, handle ⋮⋮ di
// kiri setiap blok (seret untuk memindah, klik untuk menu blok), tombol + untuk menyisipkan blok,
// dan toolbar format saat teks dipilih. Isi tetap disimpan sebagai Markdown.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditorContent, Extension, useEditor, type Editor, type Range } from "@tiptap/react";
import { Placeholder } from "@tiptap/extensions";
import Suggestion from "@tiptap/suggestion";
import { NodeSelection, PluginKey } from "@tiptap/pm/state";
import {
  Bold, CheckSquare, ChevronDown, Code, Copy, CopyPlus, GripVertical, Italic, Link2, Palette, Plus, Repeat2, Strikethrough, Trash2, Underline, ArrowUp, ArrowDown, Table as TableIcon, Rows3, Columns3, Highlighter,
} from "lucide-react";
import { noteHref, taskHref, BUILTIN_TEMPLATES, fillTemplate } from "../lib/notesTree";
import { baseExtensions } from "./schema";
import { blockAt, CALLOUTS, colorBlock, COLOR_LABEL, COLOR_NAMES, deleteBlock, duplicateBlock, moveBlock, selectBlock, turnInto, type CalloutKind, type ColorName, type TurnInto } from "./extensions";
import { ContextMenu, MenuItem as CtxItem, useContextMenu } from "../components/ContextMenu";
import { imageFileToDataUrl } from "./images";
import "./editor.css";

export interface PageRef {
  id: string;
  title: string;
  icon?: string;
}

export interface EditorHooks {
  /** Buat subhalaman baru, kembalikan id-nya. */
  createPage: (title: string) => Promise<string>;
  /** Buat tugas dari teks, kembalikan id-nya. */
  createTask: (title: string) => Promise<string>;
  openPage: (id: string) => void;
  openTask: (id: string) => void;
  pickTemplate: () => void;
  pages: PageRef[];
  /** Agenda hari ini sebagai Markdown (jadwal, rapat, kuliah, pengingat). */
  agendaMarkdown?: () => string;
  /** Tugas terbuka proyek halaman ini. */
  projectTasks?: () => { id: string; title: string }[];
  /** Pesan singkat ke pengguna. */
  notify?: (msg: string, kind?: "info" | "error") => void;
}

type SlashItem = { key: string; label: string; hint?: string; icon: string; group: string; run: (editor: Editor, range: Range) => void };
type MenuState = { kind: "slash" | "link"; items: SlashItem[]; rect: DOMRect | null; command: (item: SlashItem) => void } | null;

const today = () => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date());
const nowTime = () => new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit" }).format(new Date());

export const COURSE_NOTE_TEMPLATE = "**Mata kuliah:** \n\n**Pertemuan ke-:** \n\n**Topik:** \n\n## Poin utama\n\n- \n\n## Contoh & rumus\n\n\n\n<details>\n<summary>Pertanyaan untuk dosen</summary>\n\n- \n\n</details>\n\n## Tugas & tenggat\n\n- [ ] \n\n> [!TIP]\n> Ringkas dengan kata sendiri sebelum tidur.";

function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

function slashItems(hooks: React.MutableRefObject<EditorHooks>): SlashItem[] {
  const block = (e: Editor, r: Range) => e.chain().focus().deleteRange(r);
  const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)?.body ?? "";
  return [
    // Dasar
    { group: "Dasar", key: "teks text paragraf", label: "Teks", icon: "Aa", hint: "Paragraf biasa", run: (e, r) => block(e, r).setParagraph().run() },
    {
      group: "Dasar",
      key: "halaman subhalaman page",
      label: "Halaman",
      icon: "📄",
      hint: "Subhalaman di dalam halaman ini",
      run: async (e, r) => {
        block(e, r).run();
        const id = await hooks.current.createPage("Halaman baru");
        e.chain().focus().insertContent([{ type: "text", text: "📄 Halaman baru", marks: [{ type: "link", attrs: { href: noteHref(id) } }] }, { type: "text", text: " " }]).run();
        hooks.current.openPage(id);
      },
    },
    { group: "Dasar", key: "checklist todo centang to-do", label: "Daftar centang", icon: "☑", hint: "[] juga bisa", run: (e, r) => block(e, r).toggleTaskList().run() },
    { group: "Dasar", key: "judul1 h1 heading", label: "Judul 1", icon: "H1", hint: "# spasi", run: (e, r) => block(e, r).setHeading({ level: 1 }).run() },
    { group: "Dasar", key: "judul2 h2 heading", label: "Judul 2", icon: "H2", hint: "## spasi", run: (e, r) => block(e, r).setHeading({ level: 2 }).run() },
    { group: "Dasar", key: "judul3 h3 heading", label: "Judul 3", icon: "H3", hint: "### spasi", run: (e, r) => block(e, r).setHeading({ level: 3 }).run() },
    { group: "Dasar", key: "poin bullet daftar list", label: "Daftar poin", icon: "•", hint: "- spasi", run: (e, r) => block(e, r).toggleBulletList().run() },
    { group: "Dasar", key: "nomor angka daftar numbered", label: "Daftar bernomor", icon: "1.", hint: "1. spasi", run: (e, r) => block(e, r).toggleOrderedList().run() },
    { group: "Dasar", key: "toggle lipat details buka tutup", label: "Toggle", icon: "▸", hint: "Isi bisa dilipat", run: (e, r) => block(e, r).setParagraph().wrapIn("toggle").run() },
    { group: "Dasar", key: "kutipan quote", label: "Kutipan", icon: "❝", hint: "> spasi", run: (e, r) => block(e, r).setParagraph().toggleBlockquote().run() },
    { group: "Dasar", key: "pembatas garis divider", label: "Pembatas", icon: "—", hint: "---", run: (e, r) => block(e, r).setHorizontalRule().run() },
    ...(Object.keys(CALLOUTS) as CalloutKind[]).map((k) => ({
      group: "Dasar",
      key: `callout ${CALLOUTS[k].label.toLowerCase()} ${k}`,
      label: `Callout ${CALLOUTS[k].label.toLowerCase()}`,
      icon: CALLOUTS[k].emoji,
      hint: k === "tip" ? "Kotak sorotan" : undefined,
      run: (e: Editor, r: Range) => block(e, r).setParagraph().wrapIn("callout", { kind: k }).run(),
    })),
    { group: "Dasar", key: "kode code", label: "Blok kode", icon: "</>", hint: "``` spasi", run: (e, r) => block(e, r).setCodeBlock().run() },
    { group: "Dasar", key: "tabel table", label: "Tabel", icon: "▦", hint: "3 × 3 dengan baris judul", run: (e, r) => block(e, r).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { group: "Dasar", key: "daftar isi toc", label: "Daftar isi", icon: "☰", hint: "Dari semua judul di halaman", run: (e, r) => block(e, r).insertContent({ type: "toc" }).run() },
    // Media
    {
      group: "Media",
      key: "gambar image foto unggah",
      label: "Gambar",
      icon: "🖼️",
      hint: "Dari komputer (juga bisa tempel/seret)",
      run: async (e, r) => {
        block(e, r).run();
        const f = await pickImage();
        if (!f) return;
        const src = await imageFileToDataUrl(f).catch(() => null);
        if (!src) return hooks.current.notify?.("Gambar tidak bisa dibaca", "error");
        e.chain().focus().setImage({ src, alt: f.name.replace(/\.\w+$/, "") }).run();
      },
    },
    {
      group: "Media",
      key: "gambar url tautan image link",
      label: "Gambar dari URL",
      icon: "🌐",
      run: (e, r) => {
        const url = window.prompt("Alamat gambar (https://…)");
        block(e, r).run();
        if (url && /^https?:\/\//.test(url)) e.chain().focus().setImage({ src: url }).run();
      },
    },
    {
      group: "Media",
      key: "tautan web link bookmark url",
      label: "Tautan web",
      icon: "🔗",
      run: (e, r) => {
        const url = window.prompt("Alamat web (https://…)");
        block(e, r).run();
        if (!url) return;
        const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
        e.chain().focus().insertContent([{ type: "text", text: href.replace(/^https?:\/\//, ""), marks: [{ type: "link", attrs: { href } }] }, { type: "text", text: " " }]).run();
      },
    },
    // Sebut & tautan
    { group: "Sebut", key: "tautan link halaman mention", label: "Tautkan halaman", icon: "↗", hint: "Ketik [[ juga bisa", run: (e, r) => block(e, r).insertContent("[[").run() },
    { group: "Sebut", key: "tanggal hari ini date", label: "Tanggal hari ini", icon: "📅", run: (e, r) => block(e, r).insertContent(today()).run() },
    { group: "Sebut", key: "waktu jam sekarang time", label: "Waktu sekarang", icon: "🕒", run: (e, r) => block(e, r).insertContent(nowTime()).run() },
    // Ruangku
    {
      group: "Ruangku",
      key: "tugas task jadikan",
      label: "Jadikan tugas",
      icon: "✅",
      hint: "Teks baris ini menjadi tugas",
      run: async (e, r) => {
        block(e, r).run();
        const { $from } = e.state.selection;
        const text = $from.parent.textContent.trim() || "Tugas baru";
        const id = await hooks.current.createTask(text);
        e.chain().focus().insertContentAt({ from: $from.start(), to: $from.end() }, [{ type: "text", text: `☐ ${text}`, marks: [{ type: "link", attrs: { href: taskHref(id) } }] }]).run();
      },
    },
    {
      group: "Ruangku",
      key: "agenda jadwal hari ini rapat kuliah",
      label: "Agenda hari ini",
      icon: "🗓️",
      hint: "Jadwal, rapat, kuliah, pengingat",
      run: (e, r) => (block(e, r).run(), e.chain().focus().insertContent(hooks.current.agendaMarkdown?.() || "_Tidak ada agenda hari ini._", { contentType: "markdown" }).run()),
    },
    {
      group: "Ruangku",
      key: "tugas proyek daftar task list",
      label: "Tugas proyek ini",
      icon: "📋",
      hint: "Daftar tautan tugas terbuka",
      run: (e, r) => {
        block(e, r).run();
        const list = hooks.current.projectTasks?.() ?? [];
        const md = list.length ? list.map((t) => `- [${t.title.replace(/[[\]]/g, "")}](${taskHref(t.id)})`).join("\n") : "_Belum ada tugas terbuka._";
        e.chain().focus().insertContent(md, { contentType: "markdown" }).run();
      },
    },
    { group: "Ruangku", key: "rapat notulen meeting template", label: "Notulen rapat", icon: "🤝", run: (e, r) => (block(e, r).run(), e.chain().focus().insertContent(fillTemplate(tpl("rapat")), { contentType: "markdown" }).run()) },
    { group: "Ruangku", key: "kuliah kelas catatan kuliah lecture", label: "Catatan kuliah", icon: "🎓", run: (e, r) => (block(e, r).run(), e.chain().focus().insertContent(COURSE_NOTE_TEMPLATE, { contentType: "markdown" }).run()) },
    { group: "Ruangku", key: "template", label: "Sisipkan template…", icon: "🧩", run: (e, r) => (block(e, r).run(), hooks.current.pickTemplate()) },
    // Warna
    ...COLOR_NAMES.map((c) => ({ group: "Warna", key: `warna teks ${c} color`, label: `Teks ${COLOR_LABEL[c].toLowerCase()}`, icon: "A", hint: undefined, run: (e: Editor, r: Range) => (block(e, r).run(), colorCurrent(e, "tcolor", c)), color: c })),
    ...COLOR_NAMES.map((c) => ({ group: "Warna", key: `latar sorot ${c} background highlight`, label: `Latar ${COLOR_LABEL[c].toLowerCase()}`, icon: "A", run: (e: Editor, r: Range) => (block(e, r).run(), colorCurrent(e, "bgcolor", c)), bg: c })),
  ];
}

function colorCurrent(e: Editor, type: "tcolor" | "bgcolor", c: ColorName) {
  const b = blockAt(e.state.doc, e.state.selection.from);
  if (b) colorBlock(e, b.pos, type, c);
}

function makeSuggest(name: string, char: string, getItems: (q: string) => SlashItem[], setMenu: (m: MenuState) => void, keyRef: React.MutableRefObject<(e: KeyboardEvent) => boolean>) {
  return Extension.create({
    name,
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem>({
          editor: this.editor,
          pluginKey: new PluginKey(name),
          char,
          allowSpaces: char === "[[",
          startOfLine: false,
          items: ({ query }) => getItems(query),
          command: ({ editor, range, props }) => props.run(editor, range),
          render: () => ({
            onStart: (p) => setMenu({ kind: char === "/" ? "slash" : "link", items: p.items, rect: p.clientRect?.() ?? null, command: (it) => p.command(it) }),
            onUpdate: (p) => setMenu({ kind: char === "/" ? "slash" : "link", items: p.items, rect: p.clientRect?.() ?? null, command: (it) => p.command(it) }),
            onKeyDown: ({ event }) => keyRef.current(event),
            onExit: () => setMenu(null),
          }),
        }),
      ];
    },
  });
}

/** Pintasan blok: Ctrl+Shift+↑/↓ pindah, Ctrl+D duplikat. */
const BlockKeys = Extension.create({
  name: "blockKeys",
  addKeyboardShortcuts() {
    const cur = () => blockAt(this.editor.state.doc, this.editor.state.selection.from);
    return {
      "Mod-Shift-ArrowUp": () => {
        const b = cur();
        return b ? moveBlock(this.editor, b.pos, -1) : false;
      },
      "Mod-Shift-ArrowDown": () => {
        const b = cur();
        return b ? moveBlock(this.editor, b.pos, 1) : false;
      },
      "Mod-d": () => {
        const b = cur();
        if (!b) return false;
        duplicateBlock(this.editor, b.pos);
        return true;
      },
    };
  },
});

const TURN_INTO: { kind: TurnInto; label: string; icon: string }[] = [
  { kind: "paragraph", label: "Teks", icon: "Aa" },
  { kind: "h1", label: "Judul 1", icon: "H1" },
  { kind: "h2", label: "Judul 2", icon: "H2" },
  { kind: "h3", label: "Judul 3", icon: "H3" },
  { kind: "bullet", label: "Daftar poin", icon: "•" },
  { kind: "ordered", label: "Daftar bernomor", icon: "1." },
  { kind: "task", label: "Daftar centang", icon: "☑" },
  { kind: "toggle", label: "Toggle", icon: "▸" },
  { kind: "quote", label: "Kutipan", icon: "❝" },
  { kind: "code", label: "Blok kode", icon: "</>" },
  ...(Object.keys(CALLOUTS) as CalloutKind[]).map((k) => ({ kind: k as TurnInto, label: `Callout ${CALLOUTS[k].label.toLowerCase()}`, icon: CALLOUTS[k].emoji })),
];

function colorItems(apply: (type: "tcolor" | "bgcolor", c: ColorName | null) => void): CtxItem[] {
  return [
    { type: "label", label: "Warna teks" },
    { label: "Bawaan", icon: <span className="be-sw">A</span>, run: () => apply("tcolor", null) },
    ...COLOR_NAMES.map((c): CtxItem => ({ label: COLOR_LABEL[c], icon: <span className={`be-sw c-${c}`}>A</span>, run: () => apply("tcolor", c) })),
    { type: "separator" },
    { type: "label", label: "Warna latar" },
    { label: "Tanpa latar", icon: <span className="be-sw bgsw">A</span>, run: () => apply("bgcolor", null) },
    ...COLOR_NAMES.map((c): CtxItem => ({ label: `Latar ${COLOR_LABEL[c].toLowerCase()}`, icon: <span className={`be-sw bgsw bg-${c}`}>A</span>, run: () => apply("bgcolor", c) })),
  ];
}

export default function BlockEditor({ id, markdown, onChange, hooks, onEditor, readOnly }: { id: string; markdown: string; onChange: (md: string) => void; hooks: EditorHooks; onEditor?: (e: Editor | null) => void; readOnly?: boolean }) {
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const [menu, setMenu] = useState<MenuState>(null);
  const [index, setIndex] = useState(0);
  const menuRef = useRef<MenuState>(null);
  menuRef.current = menu;
  const indexRef = useRef(0);
  indexRef.current = index;
  useEffect(() => setIndex(0), [menu?.items.length, menu?.kind]);
  const ctx = useContextMenu();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const keyRef = useRef<(e: KeyboardEvent) => boolean>(() => false);
  keyRef.current = (e) => {
    const m = menuRef.current;
    if (!m || !m.items.length) return false;
    if (e.key === "ArrowDown") return setIndex((i) => (i + 1) % m.items.length), true;
    if (e.key === "ArrowUp") return setIndex((i) => (i - 1 + m.items.length) % m.items.length), true;
    if (e.key === "Enter" || e.key === "Tab") return m.command(m.items[indexRef.current]), true;
    if (e.key === "Escape") return setMenu(null), true;
    return false;
  };
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".on")?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const timer = useRef<number | undefined>(undefined);
  const extensions = useMemo(() => {
    const all = slashItems(hooksRef);
    const slash = makeSuggest("slashMenu", "/", (q) => {
      const s = q.toLowerCase().trim();
      if (!s) return all.filter((i) => i.group !== "Warna");
      return all.filter((i) => i.label.toLowerCase().includes(s) || i.key.includes(s)).slice(0, 24);
    }, setMenu, keyRef);
    const link = makeSuggest("pageLink", "[[", (q) => {
      const s = q.toLowerCase().replace(/\]+$/, "");
      const pages = hooksRef.current.pages.filter((p) => p.id !== id && (!s || p.title.toLowerCase().includes(s))).slice(0, 8);
      const items: SlashItem[] = pages.map((p) => ({
        group: "Halaman",
        key: p.id,
        label: p.title || "Tanpa judul",
        icon: p.icon ?? "📄",
        run: (e, r) => e.chain().focus().deleteRange(r).insertContent([{ type: "text", text: p.title || "Tanpa judul", marks: [{ type: "link", attrs: { href: noteHref(p.id) } }] }, { type: "text", text: " " }]).run(),
      }));
      const title = q.replace(/\]+$/, "").trim();
      if (title)
        items.push({
          group: "Halaman",
          key: "__new",
          label: `Buat halaman "${title}"`,
          icon: "＋",
          run: async (e, r) => {
            e.chain().focus().deleteRange(r).run();
            const nid = await hooksRef.current.createPage(title);
            e.chain().focus().insertContent([{ type: "text", text: title, marks: [{ type: "link", attrs: { href: noteHref(nid) } }] }, { type: "text", text: " " }]).run();
          },
        });
      return items;
    }, setMenu, keyRef);
    return [
      ...baseExtensions(),
      Placeholder.configure({
        includeChildren: true,
        placeholder: ({ node, editor }) => {
          if (node.type.name === "heading") return `Judul ${node.attrs.level}`;
          if (editor.isActive("toggle") && node.type.name === "paragraph") return "Toggle";
          return "Ketik / untuk perintah, [[ untuk menautkan halaman…";
        },
      }),
      BlockKeys,
      slash,
      link,
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const insertImageFiles = useCallback(async (editor: Editor, files: File[], at?: number) => {
    for (const f of files.filter((x) => x.type.startsWith("image/"))) {
      const src = await imageFileToDataUrl(f).catch(() => null);
      if (!src) {
        hooksRef.current.notify?.(`"${f.name}" tidak bisa dibaca`, "error");
        continue;
      }
      const c = editor.chain().focus();
      (at !== undefined ? c.insertContentAt(at, { type: "image", attrs: { src, alt: f.name.replace(/\.\w+$/, "") } }) : c.setImage({ src, alt: f.name.replace(/\.\w+$/, "") })).run();
    }
  }, []);

  const editor = useEditor(
    {
      extensions,
      editable: !readOnly,
      content: markdown,
      contentType: "markdown",
      editorProps: {
        attributes: { class: "be prose", "aria-label": "Isi catatan" },
        handleDOMEvents: {
          click: (_view, event) => {
            const a = (event.target as HTMLElement).closest("a");
            const href = a?.getAttribute("href") ?? "";
            if (href.startsWith("note:")) return hooksRef.current.openPage(href.slice(5)), event.preventDefault(), true;
            if (href.startsWith("task:")) return hooksRef.current.openTask(href.slice(5)), event.preventDefault(), true;
            if (/^https?:/.test(href) && (event.ctrlKey || event.metaKey)) return window.open(href, "_blank"), true;
            return false;
          },
        },
        handlePaste: (_view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
          if (!files.length || !editorRef.current) return false;
          insertImageFiles(editorRef.current, files);
          return true;
        },
        handleDrop: (view, event, _slice, moved) => {
          if (moved) return false;
          const files = [...(event.dataTransfer?.files ?? [])].filter((f) => f.type.startsWith("image/"));
          if (!files.length || !editorRef.current) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          insertImageFiles(editorRef.current, files, pos);
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => onChange(editor.getMarkdown()), 500);
      },
    },
    [id],
  );
  const editorRef = useRef<Editor | null>(null);
  editorRef.current = editor;
  // Hak tulis bisa berubah setelah peran dimuat; ubah tanpa membuat ulang editor (kursor tidak loncat).
  useEffect(() => {
    if (editor && !editor.isDestroyed && editor.isEditable === !!readOnly) editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  useEffect(() => {
    onEditor?.(editor);
    return () => onEditor?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Simpan perubahan terakhir saat pindah halaman / ditutup.
  useEffect(
    () => () => {
      if (timer.current && editor && !editor.isDestroyed) {
        window.clearTimeout(timer.current);
        onChange(editor.getMarkdown());
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editor],
  );

  // ---------- Handle blok ⋮⋮ ----------
  const [handle, setHandle] = useState<{ pos: number; top: number; left: number } | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const onMove = (e: React.MouseEvent) => {
    if (!editor || readOnly || ctx.isOpen) return;
    const wrap = wrapRef.current;
    if (!wrap || (e.target as HTMLElement).closest(".be-handle")) return;
    const rect = editor.view.dom.getBoundingClientRect();
    const hit = editor.view.posAtCoords({ left: Math.max(e.clientX, rect.left + 60), top: e.clientY });
    if (!hit) return;
    const b = blockAt(editor.state.doc, hit.inside >= 0 ? hit.inside : hit.pos);
    if (!b) return;
    const dom = editor.view.nodeDOM(b.pos) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) return;
    const w = wrap.getBoundingClientRect();
    const r = dom.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(dom).lineHeight) || 24;
    const firstLine = Math.min(lh, r.height);
    const top = r.top - w.top + firstLine / 2 - 12 + (dom.tagName === "LI" ? 0 : parseFloat(getComputedStyle(dom).paddingTop) || 0);
    const left = r.left - w.left - (dom.tagName === "LI" ? 70 : 50);
    window.clearTimeout(hideTimer.current);
    if (!handle || handle.pos !== b.pos || Math.abs(handle.top - top) > 1) setHandle({ pos: b.pos, top, left: Math.max(-8, left) });
  };
  const onLeave = () => {
    hideTimer.current = window.setTimeout(() => !ctx.isOpen && setHandle(null), 300);
  };

  const blockMenu = (pos: number): CtxItem[] => {
    if (!editor) return [];
    const node = editor.state.doc.nodeAt(pos);
    const isTable = node?.type.name === "table";
    const text = node?.textContent.trim() ?? "";
    const items: CtxItem[] = [
      { label: "Hapus", icon: <Trash2 size={14} />, hint: "Del", danger: true, run: () => deleteBlock(editor, pos) },
      { label: "Duplikat", icon: <CopyPlus size={14} />, hint: "Ctrl+D", run: () => duplicateBlock(editor, pos) },
      ...(isTable
        ? []
        : [
            { label: "Ubah menjadi", icon: <Repeat2 size={14} />, items: TURN_INTO.map((t): CtxItem => ({ label: t.label, icon: <span className="be-mi">{t.icon}</span>, run: () => turnInto(editor, pos, t.kind) })) } as CtxItem,
            { label: "Warna", icon: <Palette size={14} />, items: colorItems((type, c) => colorBlock(editor, pos, type, c)) } as CtxItem,
          ]),
      { type: "separator" },
      { label: "Pindah ke atas", icon: <ArrowUp size={14} />, hint: "Ctrl+Shift+↑", run: () => moveBlock(editor, pos, -1) },
      { label: "Pindah ke bawah", icon: <ArrowDown size={14} />, hint: "Ctrl+Shift+↓", run: () => moveBlock(editor, pos, 1) },
      {
        label: "Salin teks",
        icon: <Copy size={14} />,
        run: async () => {
          try {
            await navigator.clipboard.writeText(text);
            hooksRef.current.notify?.("Teks blok disalin");
          } catch {
            hooksRef.current.notify?.("Tidak bisa menyalin", "error");
          }
        },
      },
    ];
    if (text && !isTable && node?.type.name !== "codeBlock")
      items.push({
        label: "Jadikan tugas",
        icon: <CheckSquare size={14} />,
        run: async () => {
          const tid = await hooksRef.current.createTask(text.slice(0, 200));
          const b = blockAt(editor.state.doc, pos + 1);
          const end = (b?.pos ?? pos) + (editor.state.doc.nodeAt(b?.pos ?? pos)?.nodeSize ?? 0);
          editor.chain().focus().insertContentAt(end, { type: "paragraph", content: [{ type: "text", text: `☐ ${text.slice(0, 80)}`, marks: [{ type: "link", attrs: { href: taskHref(tid) } }] }] }).run();
          hooksRef.current.notify?.("Tugas dibuat dan ditautkan di bawah blok");
        },
      });
    if (isTable)
      items.push(
        { type: "separator" },
        { label: "Tambah baris", icon: <Rows3 size={14} />, run: () => editor.chain().focus().setTextSelection(pos + 4).addRowAfter().run() },
        { label: "Tambah kolom", icon: <Columns3 size={14} />, run: () => editor.chain().focus().setTextSelection(pos + 4).addColumnAfter().run() },
        { label: "Hapus baris ini", icon: <Rows3 size={14} />, run: () => editor.chain().focus().deleteRow().run() },
        { label: "Hapus kolom ini", icon: <Columns3 size={14} />, run: () => editor.chain().focus().deleteColumn().run() },
        { label: "Baris judul nyala/mati", icon: <TableIcon size={14} />, run: () => editor.chain().focus().setTextSelection(pos + 4).toggleHeaderRow().run() },
      );
    return items;
  };

  const onDragStart = (e: React.DragEvent) => {
    if (!editor || !handle) return;
    selectBlock(editor, handle.pos);
    const slice = editor.state.selection.content();
    const { dom, text } = editor.view.serializeForClipboard(slice);
    e.dataTransfer.clearData();
    e.dataTransfer.setData("text/html", dom.innerHTML);
    e.dataTransfer.setData("text/plain", text);
    e.dataTransfer.effectAllowed = "copyMove";
    const el = editor.view.nodeDOM(handle.pos) as HTMLElement | null;
    if (el) e.dataTransfer.setDragImage(el, 0, 0);
    editor.view.dragging = { slice, move: true };
  };

  const plus = () => {
    if (!editor || !handle) return;
    const node = editor.state.doc.nodeAt(handle.pos);
    if (!node) return;
    const empty = node.type.name === "paragraph" && node.content.size === 0;
    if (empty) editor.chain().focus().setTextSelection(handle.pos + 1).insertContent("/").run();
    else {
      const end = handle.pos + node.nodeSize;
      editor.chain().focus().insertContentAt(end, { type: "paragraph" }).setTextSelection(end + 1).insertContent("/").run();
    }
  };

  // ---------- Toolbar pilihan teks ----------
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  const [linkEdit, setLinkEdit] = useState<string | null>(null);
  useEffect(() => {
    if (!editor || readOnly) return;
    const update = () => {
      const { selection } = editor.state;
      const wrap = wrapRef.current;
      if (selection.empty || !wrap || !editor.isFocused || selection instanceof NodeSelection || editor.isActive("codeBlock")) {
        if (!linkEdit) setBubble(null);
        return;
      }
      const a = editor.view.coordsAtPos(selection.from);
      const b = editor.view.coordsAtPos(selection.to);
      const w = wrap.getBoundingClientRect();
      setBubble({ top: Math.min(a.top, b.top) - w.top - 46, left: Math.max(0, (a.left + b.right) / 2 - w.left - 170) });
    };
    const blur = () => window.setTimeout(() => !wrapRef.current?.contains(document.activeElement) && (setBubble(null), setLinkEdit(null)), 150);
    editor.on("selectionUpdate", update);
    editor.on("blur", blur);
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("blur", blur);
    };
  }, [editor, readOnly, linkEdit]);

  const fmt = (fn: (c: ReturnType<Editor["chain"]>) => ReturnType<Editor["chain"]>) => editor && fn(editor.chain().focus()).run();
  const groups = menu ? [...new Set(menu.items.map((i) => i.group))] : [];

  return (
    <div className="be-wrap" ref={wrapRef} onMouseMove={onMove} onMouseLeave={onLeave}>
      <EditorContent editor={editor} />
      {handle && !readOnly && (
        <div className="be-handle" style={{ top: handle.top, left: handle.left }} onMouseEnter={() => window.clearTimeout(hideTimer.current)} onMouseLeave={onLeave}>
          <button className="be-h-btn" title="Klik untuk menambah blok di bawah" aria-label="Tambah blok" onMouseDown={(e) => e.preventDefault()} onClick={plus}>
            <Plus size={16} />
          </button>
          <button
            className="be-h-btn be-grip"
            draggable
            title="Seret untuk memindah · klik untuk menu"
            aria-label="Menu blok"
            onMouseDown={(e) => e.stopPropagation()}
            onDragStart={onDragStart}
            onDragEnd={() => setHandle(null)}
            onClick={(e) => {
              if (!editor) return;
              selectBlock(editor, handle.pos);
              ctx.open(e.currentTarget, blockMenu(handle.pos));
            }}
          >
            <GripVertical size={16} />
          </button>
        </div>
      )}
      {bubble && editor && (
        <div className="be-bubble" style={{ top: bubble.top, left: bubble.left }} onMouseDown={(e) => !(e.target as HTMLElement).closest("input") && e.preventDefault()}>
          {linkEdit !== null ? (
            <form
              className="be-linkform"
              onSubmit={(e) => {
                e.preventDefault();
                const v = linkEdit.trim();
                if (!v) editor.chain().focus().extendMarkRange("link").unsetLink().run();
                else editor.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|note:|task:|mailto:)/.test(v) ? v : `https://${v}` }).run();
                setLinkEdit(null);
              }}
            >
              <input autoFocus value={linkEdit} onChange={(e) => setLinkEdit(e.target.value)} placeholder="Tempel tautan…" onKeyDown={(e) => e.key === "Escape" && (setLinkEdit(null), editor.commands.focus())} />
              <button className="btn btn-sm btn-primary" type="submit">Simpan</button>
            </form>
          ) : (
            <>
              <button
                className="be-b-wide"
                title="Ubah menjadi"
                onClick={(e) => {
                  const b = blockAt(editor.state.doc, editor.state.selection.from);
                  if (b) ctx.open(e.currentTarget, TURN_INTO.map((t): CtxItem => ({ label: t.label, icon: <span className="be-mi">{t.icon}</span>, run: () => turnInto(editor, b.pos, t.kind) })));
                }}
              >
                Ubah <ChevronDown size={13} />
              </button>
              <span className="be-b-sep" />
              <button className={editor.isActive("bold") ? "on" : ""} title="Tebal (Ctrl+B)" aria-label="Tebal" onClick={() => fmt((c) => c.toggleBold())}><Bold size={15} /></button>
              <button className={editor.isActive("italic") ? "on" : ""} title="Miring (Ctrl+I)" aria-label="Miring" onClick={() => fmt((c) => c.toggleItalic())}><Italic size={15} /></button>
              <button className={editor.isActive("underline") ? "on" : ""} title="Garis bawah (Ctrl+U)" aria-label="Garis bawah" onClick={() => fmt((c) => c.toggleUnderline())}><Underline size={15} /></button>
              <button className={editor.isActive("strike") ? "on" : ""} title="Coret (Ctrl+Shift+S)" aria-label="Coret" onClick={() => fmt((c) => c.toggleStrike())}><Strikethrough size={15} /></button>
              <button className={editor.isActive("code") ? "on" : ""} title="Kode (Ctrl+E)" aria-label="Kode" onClick={() => fmt((c) => c.toggleCode())}><Code size={15} /></button>
              <button className={editor.isActive("link") ? "on" : ""} title="Tautan (Ctrl+K)" aria-label="Tautan" onClick={() => setLinkEdit((editor.getAttributes("link").href as string) ?? "")}><Link2 size={15} /></button>
              <button
                title="Warna"
                aria-label="Warna"
                onClick={(e) =>
                  ctx.open(
                    e.currentTarget,
                    colorItems((type, c) => {
                      const ch = editor.chain().focus().unsetMark(type);
                      (c ? ch.setMark(type, { color: c }) : ch).run();
                    }),
                  )
                }
              >
                <Palette size={15} />
              </button>
              <button className={editor.isActive("bgcolor") ? "on" : ""} title="Sorot kuning" aria-label="Sorot" onClick={() => fmt((c) => (editor.isActive("bgcolor") ? c.unsetMark("bgcolor") : c.setMark("bgcolor", { color: "kuning" })))}><Highlighter size={15} /></button>
              <span className="be-b-sep" />
              <button
                className="be-b-wide"
                title="Buat tugas dari teks terpilih"
                onClick={async () => {
                  const { from, to } = editor.state.selection;
                  const text = editor.state.doc.textBetween(from, to, " ").trim();
                  if (!text) return;
                  const tid = await hooksRef.current.createTask(text.slice(0, 200));
                  editor.chain().focus().setLink({ href: taskHref(tid) }).run();
                  hooksRef.current.notify?.("Tugas dibuat dari teks terpilih");
                }}
              >
                <CheckSquare size={14} /> Tugas
              </button>
            </>
          )}
        </div>
      )}
      {menu && menu.rect && menu.items.length > 0 && (
        <div
          ref={listRef}
          className="be-menu"
          role="listbox"
          aria-label={menu.kind === "slash" ? "Perintah" : "Tautkan halaman"}
          style={{ top: Math.min(menu.rect.bottom + 6, window.innerHeight - 360), left: Math.min(menu.rect.left, window.innerWidth - 310) }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {menu.kind === "link" && <p className="be-menu-title">Tautkan ke halaman</p>}
          {groups.map((g) => (
            <div key={g}>
              {menu.kind === "slash" && <p className="be-menu-title">{g}</p>}
              {menu.items.map((it, i) =>
                it.group !== g ? null : (
                  <button key={it.key} role="option" aria-selected={i === index} className={i === index ? "on" : ""} onMouseEnter={() => setIndex(i)} onClick={() => menu.command(it)}>
                    <span className={`be-ic ${(it as SlashItem & { color?: string }).color ? `c-${(it as SlashItem & { color?: string }).color}` : ""} ${(it as SlashItem & { bg?: string }).bg ? `bg-${(it as SlashItem & { bg?: string }).bg}` : ""}`}>{it.icon}</span>
                    <span className="be-label">
                      {it.label}
                      {it.hint && <small>{it.hint}</small>}
                    </span>
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      )}
      <ContextMenu {...ctx.props} />
    </div>
  );
}

export function insertMarkdown(editor: Editor | null, md: string) {
  editor?.chain().focus().insertContent(md, { contentType: "markdown" }).run();
}
