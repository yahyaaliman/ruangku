// Blok tambahan ala Notion untuk editor catatan, semuanya tetap tersimpan sebagai Markdown:
// - Toggle      → <details><summary>…</summary> … </details>  (terbaca di GitHub)
// - Callout     → > [!TIP] …  (GitHub alert: NOTE, TIP, IMPORTANT, WARNING, CAUTION)
// - Warna teks  → <span class="c-merah">…</span>
// - Warna latar → <mark class="bg-kuning">…</mark>
// - Daftar isi  → [TOC]
// - Gambar      → ![alt](src "w=420")  (lebar ikut tersimpan)
import { Mark, Node, mergeAttributes, type Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import type { Node as PMNode } from "@tiptap/pm/model";

// ---------- Warna ----------
export const COLOR_NAMES = ["abu", "coklat", "oranye", "kuning", "hijau", "biru", "ungu", "jambu", "merah"] as const;
export type ColorName = (typeof COLOR_NAMES)[number];
export const COLOR_LABEL: Record<ColorName, string> = { abu: "Abu-abu", coklat: "Cokelat", oranye: "Oranye", kuning: "Kuning", hijau: "Hijau", biru: "Biru", ungu: "Ungu", jambu: "Merah muda", merah: "Merah" };
const isColor = (c: unknown): c is ColorName => typeof c === "string" && (COLOR_NAMES as readonly string[]).includes(c);

function colorMark(name: "tcolor" | "bgcolor", tag: "span" | "mark", prefix: "c-" | "bg-") {
  const re = new RegExp(`^<${tag} class="${prefix}([a-z]+)">([\\s\\S]*?)</${tag}>`);
  return Mark.create({
    name,
    addAttributes() {
      return { color: { default: "kuning" } };
    },
    parseHTML() {
      return [{ tag: `${tag}[class^="${prefix}"]`, getAttrs: (el) => {
        const m = new RegExp(`${prefix}([a-z]+)`).exec((el as HTMLElement).className);
        return m && isColor(m[1]) ? { color: m[1] } : false;
      } }];
    },
    renderHTML({ HTMLAttributes }) {
      const { color, ...rest } = HTMLAttributes as { color?: string };
      return [tag, mergeAttributes(rest, { class: `${prefix}${color}` }), 0];
    },
    renderMarkdown: (node: { attrs?: { color?: string } }, h: { renderChildren: (n: unknown) => string }) => `<${tag} class="${prefix}${node.attrs?.color ?? "kuning"}">${h.renderChildren(node)}</${tag}>`,
    parseMarkdown: (token: { color?: string; tokens?: unknown[] }, h: { applyMark: (m: string, c: unknown[], a?: unknown) => unknown; parseInline: (t: unknown[]) => unknown[] }) => h.applyMark(name, h.parseInline(token.tokens ?? []), { color: token.color }),
    markdownTokenizer: {
      name,
      level: "inline",
      start: (src: string) => src.indexOf(`<${tag} class="${prefix}`),
      tokenize(src: string, _t: unknown, lexer: { inlineTokens: (s: string) => unknown[] }) {
        const m = re.exec(src);
        if (!m || !isColor(m[1])) return undefined;
        return { type: name, raw: m[0], color: m[1], text: m[2], tokens: lexer.inlineTokens(m[2]) };
      },
    },
  } as Parameters<typeof Mark.create>[0]);
}

export const TextColor = colorMark("tcolor", "span", "c-");
export const BgColor = colorMark("bgcolor", "mark", "bg-");

// ---------- Toggle ----------
/** Cari `</details>` yang menutup `<details>` pertama (mendukung toggle bersarang). */
export function matchDetails(src: string): { raw: string; open: boolean; summary: string; body: string } | null {
  const head = /^<details( open)?>[ \t]*\n?[ \t]*<summary>([\s\S]*?)<\/summary>[ \t]*\n?/.exec(src);
  if (!head) return null;
  let depth = 1;
  const re = /<details( open)?>|<\/details>/g;
  re.lastIndex = head[0].length;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) {
      let end = m.index + m[0].length;
      if (src[end] === "\n") end++;
      return { raw: src.slice(0, end), open: !!head[1], summary: head[2].trim(), body: src.slice(head[0].length, m.index).replace(/^\n+|\n+$/g, "") };
    }
  }
  return null;
}

export const Toggle = Node.create({
  name: "toggle",
  group: "block",
  content: "paragraph block*",
  defining: true,
  addAttributes() {
    return { open: { default: true, parseHTML: (el) => (el as HTMLElement).hasAttribute("open"), renderHTML: (a) => (a.open ? { open: "" } : {}) } };
  },
  parseHTML() {
    return [{ tag: "div[data-toggle]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-toggle": "" }), 0];
  },
  addNodeView() {
    return ({ node, getPos, editor }) => {
      let cur = node;
      const dom = document.createElement("div");
      dom.className = "be-toggle";
      const btn = document.createElement("button");
      btn.className = "be-toggle-btn";
      btn.type = "button";
      btn.contentEditable = "false";
      btn.setAttribute("aria-label", "Buka/tutup");
      btn.textContent = "▸";
      const content = document.createElement("div");
      content.className = "be-toggle-body";
      dom.append(btn, content);
      const sync = () => {
        dom.dataset.open = cur.attrs.open ? "true" : "false";
        btn.setAttribute("aria-expanded", String(!!cur.attrs.open));
      };
      sync();
      btn.addEventListener("mousedown", (e) => e.preventDefault());
      btn.addEventListener("click", () => {
        const pos = typeof getPos === "function" ? getPos() : undefined;
        if (pos === undefined) return;
        editor.view.dispatch(editor.view.state.tr.setNodeMarkup(pos, undefined, { ...cur.attrs, open: !cur.attrs.open }).setMeta("addToHistory", false));
      });
      return {
        dom,
        contentDOM: content,
        update: (n) => {
          if (n.type !== cur.type) return false;
          cur = n;
          sync();
          return true;
        },
        ignoreMutation: (m) => m.target === btn || btn.contains(m.target as globalThis.Node),
      };
    };
  },
  renderMarkdown: (node: { attrs?: { open?: boolean }; content?: unknown[] }, h: { renderChildren: (n: unknown, sep?: string) => string }) => {
    const kids = node.content ?? [];
    const summary = kids.length ? h.renderChildren([kids[0]]).trim() : "";
    const body = kids.length > 1 ? h.renderChildren(kids.slice(1), "\n\n").trim() : "";
    return `<details${node.attrs?.open ? " open" : ""}>\n<summary>${summary.replace(/\n+/g, " ")}</summary>\n\n${body}${body ? "\n\n" : ""}</details>`;
  },
  parseMarkdown: (token: { open?: boolean; summaryTokens?: unknown[]; bodyTokens?: unknown[] }, h: { createNode: (t: string, a?: unknown, c?: unknown[]) => unknown; parseInline: (t: unknown[]) => unknown[]; parseChildren: (t: unknown[]) => unknown[] }) => {
    const body = h.parseChildren(token.bodyTokens ?? []);
    return h.createNode("toggle", { open: !!token.open }, [h.createNode("paragraph", undefined, h.parseInline(token.summaryTokens ?? [])), ...body]);
  },
  markdownTokenizer: {
    name: "toggle",
    level: "block",
    start: (src: string) => src.indexOf("<details"),
    tokenize(src: string, _t: unknown, lexer: { inlineTokens: (s: string) => unknown[]; blockTokens: (s: string) => unknown[] }) {
      const m = matchDetails(src);
      if (!m) return undefined;
      return { type: "toggle", raw: m.raw, open: m.open, summaryTokens: lexer.inlineTokens(m.summary), bodyTokens: m.body ? lexer.blockTokens(m.body) : [] };
    },
  },
  addKeyboardShortcuts() {
    return {
      // Enter di baris judul toggle yang tertutup: buat blok baru setelah toggle.
      Enter: ({ editor }) => {
        const { $from, empty } = editor.state.selection;
        if (!empty || $from.depth < 2) return false;
        const tog = $from.node($from.depth - 1);
        if (tog.type.name !== "toggle" || $from.index($from.depth - 1) !== 0 || tog.attrs.open) return false;
        const after = $from.after($from.depth - 1);
        return editor.chain().insertContentAt(after, { type: "paragraph" }).setTextSelection(after + 1).run();
      },
    };
  },
} as Parameters<typeof Node.create>[0]);

// ---------- Callout ----------
export const CALLOUTS = {
  note: { label: "Info", emoji: "ℹ️", md: "NOTE" },
  tip: { label: "Tips", emoji: "💡", md: "TIP" },
  important: { label: "Penting", emoji: "📌", md: "IMPORTANT" },
  warning: { label: "Peringatan", emoji: "⚠️", md: "WARNING" },
  caution: { label: "Bahaya", emoji: "🛑", md: "CAUTION" },
} as const;
export type CalloutKind = keyof typeof CALLOUTS;
const MD_TO_KIND: Record<string, CalloutKind> = { NOTE: "note", TIP: "tip", IMPORTANT: "important", WARNING: "warning", CAUTION: "caution" };

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return { kind: { default: "tip", parseHTML: (el) => (el as HTMLElement).dataset.callout ?? "tip", renderHTML: (a) => ({ "data-callout": a.kind }) } };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const k = (node.attrs.kind as CalloutKind) in CALLOUTS ? (node.attrs.kind as CalloutKind) : "tip";
    return ["div", mergeAttributes(HTMLAttributes, { class: `be-callout be-callout-${k}` }), ["span", { class: "be-callout-ic", contenteditable: "false" }, CALLOUTS[k].emoji], ["div", { class: "be-callout-body" }, 0]];
  },
  renderMarkdown: (node: { attrs?: { kind?: CalloutKind }; content?: unknown[] }, h: { renderChildren: (n: unknown, sep?: string) => string }) => {
    const k = node.attrs?.kind && node.attrs.kind in CALLOUTS ? node.attrs.kind : "tip";
    const body = h.renderChildren(node.content ?? [], "\n\n").trim();
    return [`> [!${CALLOUTS[k].md}]`, ...body.split("\n").map((l) => (l.trim() ? `> ${l}` : ">"))].join("\n");
  },
  parseMarkdown: (token: { kind?: CalloutKind; bodyTokens?: unknown[] }, h: { createNode: (t: string, a?: unknown, c?: unknown[]) => unknown; parseChildren: (t: unknown[]) => unknown[] }) => {
    const kids = h.parseChildren(token.bodyTokens ?? []);
    return h.createNode("callout", { kind: token.kind ?? "tip" }, kids.length ? kids : [h.createNode("paragraph")]);
  },
  markdownTokenizer: {
    name: "callout",
    level: "block",
    start: (src: string) => src.search(/^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]/m),
    tokenize(src: string, _t: unknown, lexer: { blockTokens: (s: string) => unknown[] }) {
      const m = /^> ?\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*\n((?:>[^\n]*(?:\n|$))*)/.exec(src);
      if (!m) return undefined;
      const body = m[2].split("\n").map((l) => l.replace(/^> ?/, "")).join("\n").replace(/\n+$/, "");
      return { type: "callout", raw: m[0], kind: MD_TO_KIND[m[1]], bodyTokens: body ? lexer.blockTokens(body) : [] };
    },
  },
} as Parameters<typeof Node.create>[0]);

// ---------- Daftar isi ----------
export const Toc = Node.create({
  name: "toc",
  group: "block",
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: "div[data-toc]" }];
  },
  renderHTML() {
    return ["div", { "data-toc": "" }];
  },
  addNodeView() {
    return ({ editor }) => {
      const dom = document.createElement("nav");
      dom.className = "be-toc";
      dom.contentEditable = "false";
      const draw = () => {
        const heads: { level: number; text: string; pos: number }[] = [];
        editor.state.doc.descendants((n, pos) => {
          if (n.type.name === "heading") heads.push({ level: n.attrs.level as number, text: n.textContent, pos });
          return n.type.name !== "heading";
        });
        dom.replaceChildren();
        const title = document.createElement("p");
        title.className = "be-toc-title";
        title.textContent = "Daftar isi";
        dom.append(title);
        if (!heads.length) {
          const p = document.createElement("p");
          p.className = "be-toc-empty";
          p.textContent = "Tambahkan judul (/judul) supaya muncul di sini.";
          dom.append(p);
        }
        for (const hd of heads) {
          const a = document.createElement("button");
          a.type = "button";
          a.className = `be-toc-item l${hd.level}`;
          a.textContent = hd.text || "Tanpa judul";
          a.addEventListener("mousedown", (e) => e.preventDefault());
          a.addEventListener("click", () => {
            const el = editor.view.nodeDOM(hd.pos) as HTMLElement | null;
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            editor.chain().focus().setTextSelection(hd.pos + 1).run();
          });
          dom.append(a);
        }
      };
      draw();
      const onUpdate = () => draw();
      editor.on("update", onUpdate);
      return { dom, ignoreMutation: () => true, stopEvent: () => false, destroy: () => editor.off("update", onUpdate) };
    };
  },
  renderMarkdown: () => "[TOC]",
  parseMarkdown: (_t: unknown, h: { createNode: (t: string) => unknown }) => h.createNode("toc"),
  markdownTokenizer: {
    name: "toc",
    level: "block",
    start: (src: string) => src.search(/^\[TOC\][ \t]*$/m),
    tokenize(src: string) {
      const m = /^\[TOC\][ \t]*(?:\n|$)/.exec(src);
      return m ? { type: "toc", raw: m[0] } : undefined;
    },
  },
} as Parameters<typeof Node.create>[0]);

// ---------- Gambar ----------
export const PageImage = Image.extend({
  addAttributes(this: { parent?: () => object }) {
    return { ...this.parent?.(), width: { default: null, parseHTML: (el: HTMLElement) => Number(el.getAttribute("width")) || null, renderHTML: (a: { width?: number | null }) => (a.width ? { width: a.width } : {}) } };
  },
  renderMarkdown: (node: { attrs?: { src?: string; alt?: string; width?: number | null } }) => {
    const a = node.attrs ?? {};
    return `![${(a.alt ?? "").replace(/[[\]]/g, "")}](${a.src ?? ""}${a.width ? ` "w=${Math.round(a.width)}"` : ""})`;
  },
  parseMarkdown: (token: { href?: string; title?: string | null; text?: string }, h: { createNode: (t: string, a?: unknown) => unknown }) => {
    const w = /^w=(\d+)$/.exec(token.title ?? "");
    return h.createNode("image", { src: token.href, alt: token.text, width: w ? Number(w[1]) : null, title: w ? null : token.title });
  },
} as Parameters<typeof Image.extend>[0]).configure({ allowBase64: true, resize: { enabled: true, minWidth: 80, alwaysPreserveAspectRatio: true } });

// ---------- Operasi blok (menu ⋮⋮) ----------
const LIST_ITEMS = new Set(["listItem", "taskItem"]);

/** Posisi & node blok yang dipilih handle (item daftar, atau blok tingkat atas). */
export function blockAt(doc: PMNode, pos: number): { pos: number; node: PMNode } | null {
  const max = doc.content.size;
  const $p = doc.resolve(Math.max(0, Math.min(pos, max)));
  for (let d = $p.depth; d >= 1; d--) {
    const n = $p.node(d);
    if (LIST_ITEMS.has(n.type.name) || d === 1) return { pos: $p.before(d), node: n };
  }
  // Di antara blok tingkat atas.
  const after = $p.nodeAfter;
  if (after && after.isBlock) return { pos: $p.pos, node: after };
  return null;
}

export function deleteBlock(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  editor.chain().focus().command(({ tr }) => (tr.delete(pos, pos + node.nodeSize), true)).run();
}

export function duplicateBlock(editor: Editor, pos: number) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const end = pos + node.nodeSize;
  editor.chain().focus().command(({ tr }) => (tr.insert(end, node.copy(node.content)), tr.setSelection(TextSelection.near(tr.doc.resolve(end + 1))), true)).run();
}

/** Pindahkan blok satu langkah ke atas/bawah di antara saudaranya. */
export function moveBlock(editor: Editor, pos: number, dir: -1 | 1): boolean {
  const { doc } = editor.state;
  const node = doc.nodeAt(pos);
  if (!node) return false;
  const $p = doc.resolve(pos);
  const parent = $p.parent;
  const idx = $p.index();
  const swapIdx = idx + dir;
  if (swapIdx < 0 || swapIdx >= parent.childCount) return false;
  const other = parent.child(swapIdx);
  return editor
    .chain()
    .focus()
    .command(({ tr }) => {
      if (dir === -1) {
        const otherPos = pos - other.nodeSize;
        tr.delete(pos, pos + node.nodeSize).insert(otherPos, node);
        tr.setSelection(TextSelection.near(tr.doc.resolve(otherPos + 1)));
      } else {
        const otherEnd = pos + node.nodeSize + other.nodeSize;
        tr.insert(otherEnd, node).delete(pos, pos + node.nodeSize);
        const np = otherEnd - node.nodeSize;
        tr.setSelection(TextSelection.near(tr.doc.resolve(np + 1)));
      }
      return true;
    })
    .run();
}

export type TurnInto = "paragraph" | "h1" | "h2" | "h3" | "bullet" | "ordered" | "task" | "toggle" | "quote" | "code" | CalloutKind;

/** Ubah jenis blok di posisi `pos`. */
export function turnInto(editor: Editor, pos: number, kind: TurnInto) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  // Letakkan kursor di dalam blok terlebih dahulu.
  let inner = pos + 1;
  node.descendants((n, p) => {
    if (n.isTextblock) {
      inner = pos + 1 + p + 1;
      return false;
    }
    return true;
  });
  const c = editor.chain().focus().setTextSelection(inner);
  const lift = () => {
    // Keluarkan dari daftar/kutipan/callout/toggle bila perlu.
    let ch = c;
    if (["bulletList", "orderedList", "taskList", "listItem", "taskItem"].includes(node.type.name) || editor.isActive("bulletList") || editor.isActive("orderedList") || editor.isActive("taskList")) {
      ch = ch.liftListItem(editor.isActive("taskList") ? "taskItem" : "listItem");
    }
    if (node.type.name === "blockquote") ch = ch.lift("blockquote");
    if (node.type.name === "callout") ch = ch.lift("callout");
    if (node.type.name === "toggle") ch = ch.lift("toggle");
    return ch;
  };
  switch (kind) {
    case "paragraph":
      return lift().setParagraph().run();
    case "h1":
    case "h2":
    case "h3":
      return lift().setHeading({ level: Number(kind.slice(1)) as 1 | 2 | 3 }).run();
    case "bullet":
      return lift().toggleBulletList().run();
    case "ordered":
      return lift().toggleOrderedList().run();
    case "task":
      return lift().toggleTaskList().run();
    case "quote":
      return lift().setParagraph().toggleBlockquote().run();
    case "code":
      return lift().setCodeBlock().run();
    case "toggle":
      return lift().setParagraph().wrapIn("toggle").run();
    default:
      if (kind in CALLOUTS) {
        if (node.type.name === "callout") return c.command(({ tr }) => (tr.setNodeMarkup(pos, undefined, { ...node.attrs, kind }), true)).run();
        return lift().setParagraph().wrapIn("callout", { kind }).run();
      }
  }
}

/** Warnai seluruh teks dalam blok (warna teks atau latar). `null` = hapus warna. */
export function colorBlock(editor: Editor, pos: number, type: "tcolor" | "bgcolor", color: ColorName | null) {
  const node = editor.state.doc.nodeAt(pos);
  if (!node) return;
  const from = pos + 1;
  const to = pos + node.nodeSize - 1;
  const mark = editor.schema.marks[type];
  editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.removeMark(from, to, mark);
      if (color) tr.addMark(from, to, mark.create({ color }));
      return true;
    })
    .run();
}

/** Pilih blok (untuk diseret / disalin). */
export function selectBlock(editor: Editor, pos: number) {
  editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, pos)));
}
