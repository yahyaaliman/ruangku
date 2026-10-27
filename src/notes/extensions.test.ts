// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { baseExtensions } from "./schema";
import { blockAt, duplicateBlock, matchDetails, moveBlock, turnInto } from "./extensions";

function mk(md: string) {
  return new Editor({ extensions: baseExtensions(), content: md, contentType: "markdown" });
}
function roundtrip(md: string) {
  const e = mk(md);
  const out = e.getMarkdown();
  e.destroy();
  return out;
}

describe("blok Notion tetap Markdown", () => {
  it("toggle, termasuk bersarang", () => {
    const md = "<details open>\n<summary>Bab **1**</summary>\n\nIsi pertama\n\n- poin\n\n</details>";
    const out = roundtrip(md);
    expect(out).toContain("<details open>");
    expect(out).toContain("<summary>Bab **1**</summary>");
    expect(out).toContain("Isi pertama");
    expect(out).toContain("- poin");
    expect(roundtrip(out)).toBe(out);
    const nested = matchDetails("<details>\n<summary>A</summary>\n\n<details>\n<summary>B</summary>\n\nx\n\n</details>\n\n</details>\nsetelah");
    expect(nested?.summary).toBe("A");
    expect(nested?.body).toContain("<summary>B</summary>");
    expect(nested?.raw.endsWith("</details>\n")).toBe(true);
  });

  it("callout gaya GitHub", () => {
    const out = roundtrip("> [!WARNING]\n> Hati-hati **tenggat**\n\nSesudah");
    expect(out).toContain("> [!WARNING]");
    expect(out).toContain("> Hati-hati **tenggat**");
    expect(out).toContain("Sesudah");
    const e = mk("> [!TIP]\n> satu");
    expect(e.getJSON().content?.[0].type).toBe("callout");
    expect(e.getJSON().content?.[0].attrs?.kind).toBe("tip");
    e.destroy();
    // Kutipan biasa tetap kutipan.
    expect(roundtrip("> 💡 biasa")).toContain("> 💡 biasa");
  });

  it("warna teks & latar", () => {
    const md = 'Ini <span class="c-merah">penting</span> dan <mark class="bg-kuning">sorot</mark>.';
    const out = roundtrip(md);
    expect(out).toContain('<span class="c-merah">penting</span>');
    expect(out).toContain('<mark class="bg-kuning">sorot</mark>');
  });

  it("tabel, gambar berlebar, daftar isi", () => {
    const md = "[TOC]\n\n## Satu\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n![diagram](https://contoh.id/a.png \"w=320\")";
    const out = roundtrip(md);
    expect(out).toContain("[TOC]");
    expect(out).toMatch(/\| A\s*\| B\s*\|/);
    expect(out).toContain('![diagram](https://contoh.id/a.png "w=320")');
  });

  it("operasi blok: ubah jenis, duplikat, pindah", () => {
    const e = mk("satu\n\ndua\n\n- a\n- b");
    const first = blockAt(e.state.doc, 2)!;
    turnInto(e, first.pos, "h2");
    expect(e.getMarkdown()).toMatch(/^## satu/);
    duplicateBlock(e, blockAt(e.state.doc, 2)!.pos);
    expect(e.getMarkdown().match(/## satu/g)?.length).toBe(2);
    // Item daftar dipilih per item.
    let li = -1;
    e.state.doc.descendants((n, p) => (n.type.name === "listItem" && n.textContent === "b" && (li = p), true));
    expect(blockAt(e.state.doc, li + 2)!.node.type.name).toBe("listItem");
    moveBlock(e, li, -1);
    expect(e.getMarkdown()).toMatch(/- b\n- a/);
    turnInto(e, blockAt(e.state.doc, 2)!.pos, "tip");
    expect(e.getMarkdown()).toContain("> [!TIP]");
    e.destroy();
  });
});
