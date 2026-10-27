// Daftar ekstensi editor catatan (dipakai editor, sticky note, dan uji Markdown).
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TableKit } from "@tiptap/extension-table";
import { BgColor, Callout, PageImage, TextColor, Toc, Toggle } from "./extensions";

export function baseExtensions() {
  return [
    StarterKit.configure({
      link: { openOnClick: false, autolink: true, protocols: ["note", "task"], isAllowedUri: (url, ctx) => /^(note|task):/.test(url) || ctx.defaultValidate(url) },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit.configure({ table: { resizable: false } }),
    PageImage,
    Toggle,
    Callout,
    TextColor,
    BgColor,
    Toc,
    Markdown,
  ];
}
