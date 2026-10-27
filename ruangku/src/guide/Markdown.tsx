// Penampil Markdown ringan untuk panduan (judul, daftar, tebal, kode, tautan halaman).
import { Fragment, ReactNode } from "react";

export function inline(s: string, onLink?: (target: string) => void, mark?: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const text = (t: string, k: string) => {
    if (!mark || !t) return <Fragment key={k}>{t}</Fragment>;
    const parts = t.split(new RegExp(`(${mark.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
    return <Fragment key={k}>{parts.map((p, i) => (p.toLowerCase() === mark.toLowerCase() ? <mark key={i}>{p}</mark> : p))}</Fragment>;
  };
  while ((m = re.exec(s))) {
    out.push(text(s.slice(last, m.index), `t${last}`));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<b key={m.index}>{text(tok.slice(2, -2), `b${m.index}`)}</b>);
    else if (tok.startsWith("`")) out.push(<code key={m.index}>{tok.slice(1, -1)}</code>);
    else {
      const lm = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok)!;
      out.push(
        <button key={m.index} className="link gd-link" onClick={() => onLink?.(lm[2])}>
          {lm[1]}
        </button>,
      );
    }
    last = m.index + tok.length;
  }
  out.push(text(s.slice(last), `t${last}`));
  return out;
}

export function Markdown({ src, onLink, mark }: { src: string; onLink?: (t: string) => void; mark?: string }) {
  const lines = src.split("\n");
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list.ordered ? "ol" : "ul";
    blocks.push(<L key={`l${blocks.length}`}>{list.items.map((t, i) => <li key={i}>{inline(t, onLink, mark)}</li>)}</L>);
    list = null;
  };
  for (const l of lines) {
    const ul = /^\s*-\s+(.*)$/.exec(l);
    const ol = /^\s*\d+\.\s+(.*)$/.exec(l);
    if (ul || ol) {
      const ordered = !!ol;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((ul ?? ol)![1]);
      continue;
    }
    flush();
    if (l.startsWith("### ")) blocks.push(<h3 key={`h${blocks.length}`}>{inline(l.slice(4), onLink, mark)}</h3>);
    else if (l.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(l, onLink, mark)}</p>);
  }
  flush();
  return <>{blocks}</>;
}

export interface Section {
  id: string;
  title: string;
  body: string;
}

/** Pecah dokumen menjadi bagian per judul "## ". */
export function sections(md: string): { intro: string; list: Section[] } {
  const parts = md.split(/^## /m);
  const intro = parts[0].replace(/^# .*\n/, "").trim();
  const list = parts.slice(1).map((p) => {
    const [title, ...rest] = p.split("\n");
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return { id, title: title.trim(), body: rest.join("\n").trim() };
  });
  return { intro, list };
}
