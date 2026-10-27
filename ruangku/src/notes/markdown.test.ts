// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";

function roundtrip(md: string) {
  const e = new Editor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, protocols: ["note", "task"], isAllowedUri: (url, ctx) => /^(note|task):/.test(url) || ctx.defaultValidate(url) } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown,
    ],
    content: md,
    contentType: "markdown",
  });
  const out = e.getMarkdown();
  e.destroy();
  return out;
}

describe("editor catatan: Markdown tetap utuh", () => {
  it("tautan halaman dan tugas", () => {
    const out = roundtrip("Lihat [Rencana](note:abc123) dan [☐ Kirim](task:t9).");
    expect(out).toContain("[Rencana](note:abc123)");
    expect(out).toContain("(task:t9)");
  });
  it("judul, daftar, centang, kutipan, kode", () => {
    const md = "## Judul\n\n- satu\n- dua\n\n- [ ] belum\n- [x] sudah\n\n> 💡 penting\n\n```\nkode\n```";
    const out = roundtrip(md);
    expect(out).toContain("## Judul");
    expect(out).toMatch(/- \[ \] belum/);
    expect(out).toMatch(/- \[x\] sudah/);
    expect(out).toContain("> 💡 penting");
    expect(out).toContain("```");
    // Stabil: dibaca ulang menghasilkan teks yang sama.
    expect(roundtrip(out)).toBe(out);
  });
});
