// Kotak melayang yang menempel pada titik/elemen, tetap di dalam layar.
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface Anchor {
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export const anchorOf = (el: Element): Anchor => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export default function Popover({ at, onClose, children, width = 320, label }: { at: Anchor; onClose: () => void; children: ReactNode; width?: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Utamakan di kanan anchor, lalu kiri, lalu di bawah.
    let left = at.x + (at.w ?? 0) + 8;
    if (left + width > vw - 12) left = at.x - width - 8;
    if (left < 12) left = Math.min(Math.max(12, at.x), vw - width - 12);
    let top = at.y;
    if (top + h > vh - 12) top = Math.max(12, vh - h - 12);
    setPos({ left, top });
  }, [at, width]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    // Ditunda satu tick supaya klik pembuka tidak langsung menutup.
    const t = window.setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  return (
    <div ref={ref} className="cal-pop" role="dialog" aria-label={label} style={{ width, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}>
      {children}
    </div>
  );
}
