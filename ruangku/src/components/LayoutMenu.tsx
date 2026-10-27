// Tombol "Tampilan" di kepala halaman: tampilkan/sembunyikan bagian, urutkan, atur lebar,
// opsi khusus halaman, dan pintasan ke tampilan global (tema, ukuran, kepadatan).
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, SlidersHorizontal } from "lucide-react";
import type { PageLayout } from "../lib/pageLayout";
import { openSettings } from "../lib/deeplink";

export function LayoutMenu({ layout, title = "Atur tampilan halaman", children, label = "Tampilan", compact, onGlobal = () => openSettings("umum") }: { layout?: PageLayout; title?: string; children?: ReactNode; label?: string; compact?: boolean; onGlobal?: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({ top: 0, left: 0, maxHeight: 560 });

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = 320;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    // Buka ke bawah bila cukup ruang; bila tombol dekat tepi bawah, buka ke atas.
    const below = window.innerHeight - r.bottom - 14;
    const above = r.top - 14;
    if (below < 300 && above > below) setPos({ bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.min(560, above) });
    else setPos({ top: r.bottom + 6, left, maxHeight: Math.min(560, Math.max(160, below)) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && (setOpen(false), btn.current?.focus());
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <>
      <button ref={btn} className={`btn ${compact ? "btn-sm" : ""} lay-btn ${layout?.customized ? "customized" : ""}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)} title={title}>
        <SlidersHorizontal size={14} /> {label}
      </button>
      {open && (
        <div ref={pop} className="lay-pop" role="dialog" aria-label={title} style={{ top: pos.top ?? "auto", bottom: pos.bottom ?? "auto", left: pos.left, maxHeight: pos.maxHeight }}>
          <h3>
            <SlidersHorizontal size={14} /> {title}
            {layout?.customized && (
              <button className="link" onClick={layout.reset}>
                Bawaan
              </button>
            )}
          </h3>
          {layout && layout.sections.length > 0 && (
            <>
              <p className="set-list-head">Bagian</p>
              <ul className="lay-list">
                {layout.sections.map((s, i) => (
                  <li key={s.id} className={s.on ? "" : "off"}>
                    <label>
                      <input type="checkbox" checked={s.on} onChange={(e) => layout.toggle(s.id, e.target.checked)} />
                      <span>{s.label}</span>
                    </label>
                    {s.canWide && s.on && (
                      <button className={`lay-wide ${s.wide ? "on" : ""}`} onClick={() => layout.toggleWide(s.id)} title={s.wide ? "Jadikan setengah lebar" : "Jadikan lebar penuh"}>
                        {s.wide ? "Lebar" : "½"}
                      </button>
                    )}
                    <button className="icon-btn sm" disabled={i === 0} onClick={() => layout.move(s.id, -1)} aria-label={`Naikkan ${s.label}`}>
                      <ArrowUp size={13} />
                    </button>
                    <button className="icon-btn sm" disabled={i === layout.sections.length - 1} onClick={() => layout.move(s.id, 1)} aria-label={`Turunkan ${s.label}`}>
                      <ArrowDown size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {children && <div className="lay-opts">{children}</div>}
          {onGlobal && (
            <button
              className="link small"
              onClick={() => {
                setOpen(false);
                onGlobal();
              }}
            >
              Tema, ukuran teks, kepadatan & lebar halaman…
            </button>
          )}
        </div>
      )}
    </>
  );
}

/** Pilihan segmen kecil di dalam LayoutMenu. */
export function LayoutSeg<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="lay-seg">
      <span className="lay-opt-label">{label}</span>
      <div className="seg" role="radiogroup" aria-label={label}>
        {options.map(([v, l]) => (
          <button key={v} role="radio" aria-checked={value === v} className={value === v ? "active" : ""} onClick={() => onChange(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

export function LayoutCheck({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="check-row lay-check">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
  );
}
