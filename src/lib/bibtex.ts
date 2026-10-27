// Impor referensi dari BibTeX (ekspor Zotero, Mendeley, Google Scholar) dan format sitasi gaya APA.

export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

const ACCENTS: Record<string, Record<string, string>> = {
  '"': { a: "ä", o: "ö", u: "ü", e: "ë", i: "ï", A: "Ä", O: "Ö", U: "Ü" },
  "'": { a: "á", e: "é", i: "í", o: "ó", u: "ú", c: "ć", n: "ń", s: "ś", z: "ź", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" },
  "`": { a: "à", e: "è", i: "ì", o: "ò", u: "ù", A: "À", E: "È" },
  "^": { a: "â", e: "ê", i: "î", o: "ô", u: "û" },
  "~": { n: "ñ", a: "ã", o: "õ", N: "Ñ" },
  c: { c: "ç", C: "Ç", s: "ş", S: "Ş" },
  v: { c: "č", s: "š", z: "ž", r: "ř", e: "ě", C: "Č", S: "Š", Z: "Ž" },
};

/** Bersihkan markup LaTeX umum menjadi teks biasa. */
export function delatex(s: string): string {
  let t = s;
  t = t.replace(/\\([`'"^~cv])\s*\{?\\?([a-zA-Z])\}?/g, (_m, acc: string, ch: string) => ACCENTS[acc]?.[ch] ?? ch);
  t = t
    .replace(/\\ss\b\s?/g, "ß")
    .replace(/\\o\b\s?/g, "ø")
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\\$/g, "$")
    .replace(/\\_/g, "_")
    .replace(/---/g, "—")
    .replace(/--/g, "–")
    .replace(/~/g, " ")
    .replace(/\\(?:textit|emph|textbf|textsc|mathrm|text)\{([^{}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+\s?/g, "")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t;
}

/** Baca isi berkas .bib. Entri rusak dilewati; @string, @comment, dan @preamble didukung/diabaikan. */
export function parseBibtex(text: string): BibEntry[] {
  const out: BibEntry[] = [];
  const macros: Record<string, string> = { jan: "Januari", feb: "Februari", mar: "Maret", apr: "April", may: "Mei", jun: "Juni", jul: "Juli", aug: "Agustus", sep: "September", oct: "Oktober", nov: "November", dec: "Desember" };
  let i = 0;
  const n = text.length;
  const skipWs = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const readBraced = (): string => {
    // text[i] === "{" atau "("
    const open = text[i];
    const close = open === "(" ? ")" : "}";
    let depth = 0;
    const start = i + 1;
    for (; i < n; i++) {
      if (text[i] === "\\") {
        i++;
        continue;
      }
      if (text[i] === "{" || (open === "(" && text[i] === "(")) depth++;
      else if (text[i] === "}" || (open === "(" && text[i] === ")")) {
        depth--;
        if (depth === 0 && text[i] === close) {
          i++;
          return text.slice(start, i - 1);
        }
      }
    }
    return text.slice(start);
  };
  const readValue = (): string => {
    const parts: string[] = [];
    for (;;) {
      skipWs();
      if (text[i] === "{") parts.push(readBraced());
      else if (text[i] === '"') {
        i++;
        let depth = 0;
        const start = i;
        for (; i < n; i++) {
          if (text[i] === "\\") {
            i++;
            continue;
          }
          if (text[i] === "{") depth++;
          else if (text[i] === "}") depth--;
          else if (text[i] === '"' && depth === 0) break;
        }
        parts.push(text.slice(start, i));
        i++;
      } else {
        const m = /^[\w.:-]+/.exec(text.slice(i));
        const word = m?.[0] ?? "";
        i += word.length;
        parts.push(macros[word.toLowerCase()] ?? word);
      }
      skipWs();
      if (text[i] === "#") {
        i++;
        continue;
      }
      return parts.join("");
    }
  };

  while (i < n) {
    const at = text.indexOf("@", i);
    if (at < 0) break;
    i = at + 1;
    const tm = /^\s*([a-zA-Z]+)\s*/.exec(text.slice(i));
    if (!tm) continue;
    const type = tm[1].toLowerCase();
    i += tm[0].length;
    if (text[i] !== "{" && text[i] !== "(") continue;
    if (type === "comment" || type === "preamble") {
      readBraced();
      continue;
    }
    const bodyStart = i;
    const body = readBraced();
    if (type === "string") {
      const m = /^\s*([\w-]+)\s*=\s*([\s\S]*)$/.exec(body);
      if (m) {
        const save = i;
        const inner = m[2].trim();
        // Evaluasi nilai @string memakai pembaca yang sama.
        const sub = parseBibtex(`@x{k, v = ${inner}}`)[0];
        macros[m[1].toLowerCase()] = sub?.fields.v ?? inner.replace(/^[{"]|[}"]$/g, "");
        i = save;
      }
      continue;
    }
    // Uraikan isi entri: kunci, lalu pasangan nama = nilai.
    const end = i;
    i = bodyStart + 1;
    const km = /^\s*([^,\s]+)\s*,/.exec(text.slice(i, end));
    if (!km) {
      i = end;
      continue;
    }
    const key = km[1];
    i += km[0].length;
    const fields: Record<string, string> = {};
    while (i < end - 1) {
      skipWs();
      const fm = /^([\w-]+)\s*=\s*/.exec(text.slice(i, end));
      if (!fm) break;
      i += fm[0].length;
      fields[fm[1].toLowerCase()] = readValue().trim();
      skipWs();
      if (text[i] === ",") i++;
    }
    i = end;
    out.push({ type, key, fields });
  }
  return out;
}

export interface Person {
  last: string;
  first: string;
}

/** "Devlin, Jacob and Ming-Wei Chang and {Google AI}" → daftar nama. */
export function parseNames(s: string | undefined): Person[] {
  if (!s) return [];
  return s
    .split(/\s+and\s+/i)
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      if (/^\{.*\}$/.test(raw)) return { last: delatex(raw), first: "" }; // nama lembaga
      if (raw.includes(",")) {
        const [last, first] = raw.split(",", 2);
        return { last: delatex(last), first: delatex(first ?? "") };
      }
      const words = delatex(raw).split(" ");
      // Partikel nama (van, de, von, bin) ikut nama belakang.
      let k = words.length - 1;
      while (k > 0 && /^(van|von|de|der|da|di|del|la|le|bin|binti)$/i.test(words[k - 1])) k--;
      return { last: words.slice(k).join(" "), first: words.slice(0, k).join(" ") };
    });
}

const initials = (first: string) =>
  first
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.split("-").map((p) => `${p[0].toUpperCase()}.`).join("-"))
    .join(" ");

function apaAuthors(ps: Person[]): string {
  const fmt = (p: Person) => (p.first ? `${p.last}, ${initials(p.first)}` : p.last);
  if (!ps.length) return "";
  if (ps.length === 1) return fmt(ps[0]);
  if (ps.length <= 20) return `${ps.slice(0, -1).map(fmt).join(", ")}, & ${fmt(ps[ps.length - 1])}`;
  return `${ps.slice(0, 19).map(fmt).join(", ")}, … ${fmt(ps[ps.length - 1])}`;
}

export interface Ref {
  key: string;
  type: string;
  title: string;
  authors: Person[];
  year: string;
  venue: string;
  volume?: string;
  number?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  keywords: string[];
}

export function toRef(e: BibEntry): Ref {
  const f = e.fields;
  const doi = f.doi ? delatex(f.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : undefined;
  return {
    key: e.key,
    type: e.type,
    title: delatex(f.title ?? "(tanpa judul)"),
    authors: parseNames(f.author ?? f.editor),
    year: (f.year ?? f.date ?? "").slice(0, 4) || "t.t.",
    venue: delatex(f.journal ?? f.journaltitle ?? f.booktitle ?? f.publisher ?? f.school ?? f.institution ?? f.howpublished ?? ""),
    volume: f.volume ? delatex(f.volume) : undefined,
    number: f.number ? delatex(f.number) : undefined,
    pages: f.pages ? delatex(f.pages).replace(/-+/, "–") : undefined,
    doi,
    url: f.url ? delatex(f.url) : undefined,
    abstract: f.abstract ? delatex(f.abstract) : undefined,
    keywords: (f.keywords ?? "")
      .split(/[,;]/)
      .map((k) => delatex(k).toLowerCase())
      .filter(Boolean),
  };
}

/** Sitasi gaya APA 7 (teks biasa; judul berkala ditandai *miring* markdown). */
export function apa(r: Ref): string {
  const who = apaAuthors(r.authors) || r.title;
  const parts = [`${who} (${r.year}).`];
  if (r.authors.length) parts.push(`${r.title.replace(/\.$/, "")}.`);
  if (r.type === "article" && r.venue) {
    let v = `*${r.venue}*`;
    if (r.volume) v += `, *${r.volume}*`;
    if (r.number) v += `(${r.number})`;
    if (r.pages) v += `, ${r.pages}`;
    parts.push(`${v}.`);
  } else if (r.venue) parts.push(r.type === "inproceedings" || r.type === "incollection" ? `Dalam *${r.venue}*${r.pages ? ` (hlm. ${r.pages})` : ""}.` : `${r.venue}.`);
  if (r.doi) parts.push(`https://doi.org/${r.doi}`);
  else if (r.url) parts.push(r.url);
  return parts.join(" ");
}

/** Sitasi dalam teks: (Devlin dkk., 2019). */
export function inText(r: Ref): string {
  const a = r.authors;
  const who = !a.length ? r.title.split(" ").slice(0, 3).join(" ") : a.length === 1 ? a[0].last : a.length === 2 ? `${a[0].last} & ${a[1].last}` : `${a[0].last} dkk.`;
  return `(${who}, ${r.year})`;
}

export const sortRefs = (rs: Ref[]) => [...rs].sort((a, b) => (a.authors[0]?.last ?? a.title).localeCompare(b.authors[0]?.last ?? b.title, "id") || a.year.localeCompare(b.year));
