// Panduan penggunaan Ruangku (sumber: src/guide/panduan.md, juga disertakan sebagai PANDUAN.md).
import { useMemo, useState } from "react";
import { BookOpen, PlayCircle, Search } from "lucide-react";
import type { Page } from "../App";
import md from "../guide/panduan.md?raw";
import { Markdown, sections } from "../guide/Markdown";

export default function Guide({ go, startTour }: { go: (p: Page) => void; startTour: () => void }) {
  const doc = useMemo(() => sections(md), []);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(doc.list[0]?.id);
  const term = q.trim().toLowerCase();
  const shown = term ? doc.list.filter((s) => `${s.title}\n${s.body}`.toLowerCase().includes(term)) : doc.list;
  const onLink = (t: string) => (t.startsWith("page:") ? go(t.slice(5) as Page) : window.open(t, "_blank"));
  const jump = (id: string) => {
    setActive(id);
    document.getElementById(`gd-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="page gd-page">
      <aside className="gd-toc">
        <h1><BookOpen size={20} /> Panduan</h1>
        <label className="search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari di panduan…" />
        </label>
        <button className="btn btn-sm gd-tour" onClick={startTour}><PlayCircle size={14} /> Mulai tur singkat</button>
        <nav>
          {shown.map((s) => (
            <button key={s.id} className={`side-item ${active === s.id ? "active" : ""}`} onClick={() => jump(s.id)}>{s.title}</button>
          ))}
          {shown.length === 0 && <p className="side-empty">Tidak ada bagian yang memuat "{q}".</p>}
        </nav>
      </aside>
      <article className="gd-body">
        {!term && <p className="gd-intro">{doc.intro}</p>}
        {shown.map((s) => (
          <section key={s.id} id={`gd-${s.id}`} className="gd-sec">
            <h2>{s.title}</h2>
            <Markdown src={s.body} onLink={onLink} mark={term || undefined} />
          </section>
        ))}
      </article>
    </div>
  );
}
