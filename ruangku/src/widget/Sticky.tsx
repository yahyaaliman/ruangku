// Sticky note di desktop: satu catatan, bisa diedit langsung, checklist bisa dicentang.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Pin, PinOff, X } from "lucide-react";
import type { Note, StickyColor } from "../lib/types";
import { api, emitTo, isDesktop, onEvent, ResizeDir, windowDrag, windowResize } from "../lib/api";
import { strip, useRecords } from "../lib/useRecords";

const COLORS: { id: StickyColor; label: string }[] = [
  { id: "kunyit", label: "Kuning" },
  { id: "daun", label: "Hijau" },
  { id: "nila", label: "Biru" },
  { id: "bata", label: "Merah muda" },
  { id: "abu", label: "Abu" },
];
const LAYERS: { id: "normal" | "top" | "desktop"; label: string }[] = [
  { id: "normal", label: "Biasa" },
  { id: "top", label: "Selalu di atas" },
  { id: "desktop", label: "Menempel di desktop" },
];
const EDGES: { dir: ResizeDir; cls: string }[] = [
  { dir: "East", cls: "e" },
  { dir: "South", cls: "s" },
  { dir: "SouthEast", cls: "se" },
  { dir: "West", cls: "w" },
];

/** Baris markdown sederhana untuk tampilan sticky. */
function Line({ text, onToggle }: { text: string; onToggle?: () => void }) {
  const task = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(text);
  if (task)
    return (
      <label className="st-task" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" checked={task[1] !== " "} onChange={onToggle} />
        <span className={task[1] !== " " ? "done" : ""}>{task[2]}</span>
      </label>
    );
  const quote = /^>\s?(.*)$/.exec(text);
  if (quote) return <p className="st-quote">{quote[1]}</p>;
  const h = /^#{1,3} (.*)$/.exec(text);
  if (h) return <p className="st-h">{h[1]}</p>;
  const li = /^\s*(?:[-*]|\d+\.) (.*)$/.exec(text);
  if (li) return <p className="st-li">• {li[1]}</p>;
  if (!text.trim()) return <p className="st-gap" />;
  return <p>{text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[(.+?)\]\((?:note|task):[\w-]+\)/g, "$1")}</p>;
}

export default function Sticky({ id }: { id: string }) {
  const notes = useRecords<Note>("note");
  const note = notes.items.find((n) => n.id === id);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [title, setTitle] = useState("");
  const [layer, setLayer] = useState<"normal" | "top" | "desktop">("normal");
  const [menu, setMenu] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    document.documentElement.classList.add("is-widget");
    api.stickyLayer(id).then((l) => setLayer(l as typeof layer)).catch(() => {});
  }, [id]);
  useEffect(() => {
    if (!note || editing) return;
    setBody(note.body);
    setTitle(note.title);
  }, [note?.updatedAt, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onEvent("records-changed", () => {}), []);

  if (notes.loading) return null;
  if (!note)
    return (
      <div className="sticky st-abu">
        <div className="st-card">
          <header className="st-head" onMouseDown={(e) => e.button === 0 && windowDrag()}>
            <span className="st-title-static">Catatan tidak ditemukan</span>
            <button className="st-icon" onClick={() => api.stickyClose(id)} aria-label="Tutup"><X size={14} /></button>
          </header>
          <p className="st-empty">Catatan ini sudah dihapus. Tutup sticky ini.</p>
        </div>
      </div>
    );

  const color = note.sticky?.color ?? "kunyit";
  const save = (patch: Partial<Note>) => notes.save({ ...strip(note), ...patch }, note.id);
  const lines = body.split("\n");
  const toggleLine = (i: number) => {
    const next = lines.map((l, j) => (j === i ? l.replace(/\[( |x|X)\]/, (m) => (m === "[ ]" ? "[x]" : "[ ]")) : l)).join("\n");
    setBody(next);
    save({ body: next });
  };
  const openInApp = async () => {
    await api.setSetting("open_note", `${note.id}:${Date.now()}`);
    await api.openMain("notes");
    if (!isDesktop) emitTo("main", "navigate", "notes");
  };

  return (
    <div className={`sticky st-${color}`}>
      <div className="st-card">
        <header className="st-head" onMouseDown={(e) => e.button === 0 && !(e.target as HTMLElement).closest("button, input") && windowDrag()}>
          <input
            className="st-title"
            value={title}
            aria-label="Judul catatan"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() !== note.title && save({ title: title.trim() || note.title })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <button className="st-icon" onClick={() => setMenu(!menu)} aria-label="Warna dan lapisan" title="Warna & lapisan">
            {layer === "normal" ? <PinOff size={14} /> : <Pin size={14} />}
          </button>
          <button className="st-icon" onClick={openInApp} aria-label="Buka di Ruangku" title="Buka di Ruangku"><ExternalLink size={14} /></button>
          <button
            className="st-icon"
            onClick={async () => {
              await save({ sticky: undefined });
              await api.stickyClose(id);
            }}
            aria-label="Lepas dari desktop"
            title="Lepas dari desktop"
          >
            <X size={14} />
          </button>
        </header>
        {menu && (
          <div className="st-menu">
            <div className="st-colors">
              {COLORS.map((c) => (
                <button key={c.id} className={`st-dot st-${c.id} ${color === c.id ? "on" : ""}`} aria-label={c.label} title={c.label} onClick={() => save({ sticky: { color: c.id } })} />
              ))}
            </div>
            {LAYERS.map((l) => (
              <button key={l.id} className={`st-layer ${layer === l.id ? "on" : ""}`} onClick={() => (setLayer(l.id), api.stickySetLayer(id, l.id), setMenu(false))}>
                {l.label}
              </button>
            ))}
          </div>
        )}
        {editing ? (
          <textarea
            ref={area}
            className="st-area"
            value={body}
            autoFocus
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (body !== note.body) save({ body });
            }}
            onKeyDown={(e) => e.key === "Escape" && (e.target as HTMLTextAreaElement).blur()}
            placeholder={"Tulis di sini…\n- [ ] checklist"}
          />
        ) : (
          <div className="st-body" onClick={() => setEditing(true)} title="Klik untuk mengedit">
            {body.trim() ? lines.map((l, i) => <Line key={i} text={l} onToggle={() => toggleLine(i)} />) : <p className="st-empty">Klik untuk menulis. Awali baris dengan "- [ ] " untuk checklist.</p>}
          </div>
        )}
      </div>
      {EDGES.map((e) => (
        <div key={e.dir} className={`w-edge w-edge-${e.cls}`} onMouseDown={(ev) => (ev.stopPropagation(), windowResize(e.dir))} aria-hidden="true" />
      ))}
    </div>
  );
}
