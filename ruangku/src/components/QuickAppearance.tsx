// Tampilan cepat (ikon Aa di kaki sidebar): tema, warna aksen, ukuran tampilan, kepadatan,
// dan lebar halaman tanpa membuka Pengaturan.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, Type } from "lucide-react";
import { ACCENTS, useAppearance, type Density, type PageWidth } from "../lib/appearance";
import { useThemePref, type ThemePref } from "../lib/theme";
import { openSettings } from "../lib/deeplink";
import { LayoutSeg } from "./LayoutMenu";

export function QuickAppearance({ className = "nav-item" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [ap, setAp] = useAppearance();
  const [theme, setTheme] = useThemePref();
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, bottom: 0, maxHeight: 560 });
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 310)), bottom: window.innerHeight - r.top + 6, maxHeight: Math.max(200, r.top - 14) });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => !pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [open]);
  const zoom = (d: number) => setAp({ zoom: Math.min(150, Math.max(80, ap.zoom + d)) });
  return (
    <>
      <button ref={btn} className={`${className} ${open ? "active" : ""}`} onClick={() => setOpen(!open)} title="Tampilan cepat: tema, warna, ukuran" aria-label="Tampilan" aria-haspopup="dialog" aria-expanded={open}>
        <Type size={16} strokeWidth={1.8} />
      </button>
      {open && (
        <div ref={pop} className="lay-pop qa-pop" role="dialog" aria-label="Tampilan cepat" style={{ left: pos.left, bottom: pos.bottom, top: "auto", maxHeight: pos.maxHeight }}>
          <h3>
            <Type size={14} /> Tampilan
          </h3>
          <LayoutSeg<ThemePref>
            label="Tema"
            value={theme}
            options={[
              ["system", "Sistem"],
              ["light", "Terang"],
              ["dark", "Gelap"],
            ]}
            onChange={setTheme}
          />
          <span className="lay-opt-label">Warna aksen</span>
          <div className="qa-accents" role="radiogroup" aria-label="Warna aksen">
            {ACCENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={ap.accent === a.id} className={ap.accent === a.id ? "on" : ""} style={{ "--sw": a.light[0] } as React.CSSProperties} onClick={() => setAp({ accent: a.id })} title={a.label} aria-label={a.label} />
            ))}
          </div>
          <span className="lay-opt-label">Ukuran tampilan</span>
          <div className="qa-zoom">
            <button className="icon-btn sm" onClick={() => zoom(-10)} aria-label="Perkecil" disabled={ap.zoom <= 80}>
              <Minus size={14} />
            </button>
            <input type="range" min={80} max={150} step={5} value={ap.zoom} onChange={(e) => setAp({ zoom: Number(e.target.value) })} aria-label="Ukuran tampilan" />
            <button className="icon-btn sm" onClick={() => zoom(10)} aria-label="Perbesar" disabled={ap.zoom >= 150}>
              <Plus size={14} />
            </button>
            <b>{ap.zoom}%</b>
          </div>
          <LayoutSeg<Density>
            label="Kepadatan"
            value={ap.density}
            options={[
              ["ringkas", "Ringkas"],
              ["nyaman", "Nyaman"],
              ["lega", "Lega"],
            ]}
            onChange={(density) => setAp({ density })}
          />
          <LayoutSeg<PageWidth>
            label="Lebar halaman"
            value={ap.width}
            options={[
              ["normal", "Normal"],
              ["lebar", "Lebar"],
              ["penuh", "Penuh"],
            ]}
            onChange={(width) => setAp({ width })}
          />
          <button
            className="link small"
            onClick={() => {
              setOpen(false);
              openSettings("umum");
            }}
          >
            Semua pengaturan tampilan…
          </button>
        </div>
      )}
    </>
  );
}
