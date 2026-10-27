// Halaman bersarang, backlink, dan template untuk Catatan.
import type { Item, Note } from "./types";

export const noteHref = (id: string) => `note:${id}`;
export const taskHref = (id: string) => `task:${id}`;

/** Rantai induk dari akar sampai halaman ini (untuk breadcrumb). */
export function ancestors(notes: Item<Note>[], id: string): Item<Note>[] {
  const out: Item<Note>[] = [];
  const seen = new Set<string>();
  let cur = notes.find((n) => n.id === id);
  while (cur?.parentId && !seen.has(cur.parentId)) {
    seen.add(cur.parentId);
    const p = notes.find((n) => n.id === cur!.parentId);
    if (!p) break;
    out.unshift(p);
    cur = p;
  }
  return out;
}

export function children(notes: Item<Note>[], id: string | null): Item<Note>[] {
  return notes
    .filter((n) => (n.parentId ?? null) === id && !n.isTemplate && !n.date)
    .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || Number(!!b.pinned) - Number(!!a.pinned) || (a.title || "").localeCompare(b.title || "", "id"));
}

/** Apakah `candidate` adalah keturunan `id` (mencegah memindah halaman ke dalam dirinya sendiri). */
export function isDescendant(notes: Item<Note>[], candidate: string, id: string): boolean {
  return ancestors(notes, candidate).some((a) => a.id === id) || candidate === id;
}

/** Catatan yang menautkan ke halaman ini lewat [judul](note:ID). */
export function backlinks(notes: Item<Note>[], id: string): Item<Note>[] {
  const needle = `(${noteHref(id)})`;
  return notes.filter((n) => n.id !== id && n.body.includes(needle));
}

/** ID tugas yang ditautkan dari isi catatan. */
export function linkedTaskIds(body: string): string[] {
  return [...body.matchAll(/\(task:([A-Za-z0-9_-]+)\)/g)].map((m) => m[1]);
}

/** Ganti placeholder template: {{tanggal}}, {{hari}}. */
export function fillTemplate(body: string, now = new Date()): string {
  const tanggal = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(now);
  const hari = new Intl.DateTimeFormat("id-ID", { weekday: "long" }).format(now);
  return body.split("{{tanggal}}").join(tanggal).split("{{hari}}").join(hari);
}

export interface Template {
  id: string;
  name: string;
  icon: string;
  title: string;
  body: string;
  tags?: string[];
}

export const BUILTIN_TEMPLATES: Template[] = [
  {
    id: "rapat",
    name: "Notulen rapat",
    icon: "🗓️",
    title: "Rapat {{tanggal}}",
    tags: ["rapat"],
    body: "**Hadir:** \n\n**Tujuan rapat:** \n\n## Pembahasan\n\n- \n\n## Keputusan\n\n- \n\n## Tindak lanjut\n\n- [ ] \n- [ ] ",
  },
  {
    id: "jurnal",
    name: "Jurnal harian",
    icon: "📔",
    title: "Jurnal {{hari}}, {{tanggal}}",
    tags: ["jurnal"],
    body: "## Yang disyukuri\n\n1. \n2. \n3. \n\n## Fokus hari ini\n\n- [ ] \n\n## Catatan\n\n> 💡 \n\n## Refleksi malam\n\n",
  },
  {
    id: "proyek",
    name: "Rencana proyek",
    icon: "🚀",
    title: "Proyek: ",
    tags: ["proyek"],
    body: "## Latar belakang\n\n## Tujuan & ukuran keberhasilan\n\n- \n\n## Ruang lingkup\n\n**Termasuk:** \n\n**Tidak termasuk:** \n\n## Tahapan\n\n- [ ] \n- [ ] \n\n## Risiko\n\n- \n",
  },
  {
    id: "belajar",
    name: "Catatan belajar",
    icon: "📚",
    title: "Belajar: ",
    tags: ["belajar"],
    body: "**Sumber:** \n\n## Konsep utama\n\n- \n\n## Contoh\n\n```\n\n```\n\n## Pertanyaan yang belum terjawab\n\n- \n\n## Ringkasan dengan kata sendiri\n\n",
  },
  {
    id: "mingguan",
    name: "Review mingguan",
    icon: "🧭",
    title: "Review minggu {{tanggal}}",
    tags: ["review"],
    body: "## Pencapaian\n\n- \n\n## Yang belum tuntas\n\n- [ ] \n\n## Pelajaran\n\n> 💡 \n\n## Prioritas minggu depan\n\n1. \n2. \n3. \n",
  },
];

export const PAGE_ICONS = ["📄", "📝", "📌", "💡", "🚀", "📚", "🗓️", "✅", "🎯", "💼", "🧠", "🕌", "💰", "🏠", "✈️", "❤️"];
