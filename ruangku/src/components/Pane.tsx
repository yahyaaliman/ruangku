// Panel yang lebarnya bisa ditarik (seperti Notion/VS Code): garis tipis di tepi panel,
// tarik untuk mengubah, klik dua kali untuk kembali ke bawaan, panah kiri/kanan saat fokus.
// Lebar disimpan per perangkat di setelan "pane_widths".
import { useCallback, useRef, useState, type CSSProperties } from "react";
import { useJsonSetting } from "../lib/useSetting";

/** [lebar, ubah (final=false saat menyeret), kembalikan bawaan]. Disimpan hanya saat seret selesai. */
export function usePaneWidth(key: string, def: number, min: number, max: number): [number, (w: number, final?: boolean) => void, () => void] {
  const [all, save] = useJsonSetting<Record<string, number>>("pane_widths", {});
  const [live, setLive] = useState<number | null>(null);
  const raw = all[key];
  const stored = typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : def;
  const w = live ?? stored;
  const set = useCallback(
    (n: number, final = true) => {
      const v = Math.round(Math.min(max, Math.max(min, n)));
      if (!final) return setLive(v);
      setLive(null);
      save((cur) => ({ ...cur, [key]: v }));
    },
    [save, key, min, max],
  );
  const reset = useCallback(
    () =>
      (setLive(null), save((cur) => {
        const { [key]: _drop, ...rest } = cur;
        void _drop;
        return rest;
      })),
    [save, key],
  );
  return [w, set, reset];
}

/**
 * Pegangan pengubah lebar. `edge="left"`: panel di kiri, pegangan di x = value dari kiri wadah.
 * `edge="right"`: panel di kanan, pegangan di x = value dari kanan wadah.
 * Wadah perlu `position: relative` (kelas `pane-host`).
 */
export function PaneResizer({ value, onChange, onReset, edge = "left", min, max, label, offset = 0, style }: { value: number; onChange: (w: number, final?: boolean) => void; onReset?: () => void; edge?: "left" | "right"; min: number; max: number; label: string; offset?: number; style?: CSSProperties }) {
  const drag = useRef<{ x: number; w: number; last: number } | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag.current = { x: e.clientX, w: value, last: value };
    el.current?.setPointerCapture(e.pointerId);
    el.current?.classList.add("dragging");
    document.body.classList.add("pane-dragging");
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    drag.current.last = Math.min(max, Math.max(min, drag.current.w + (edge === "left" ? dx : -dx)));
    onChange(drag.current.last, false);
  };
  const end = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const last = drag.current.last;
    drag.current = null;
    onChange(last, true);
    el.current?.releasePointerCapture(e.pointerId);
    el.current?.classList.remove("dragging");
    document.body.classList.remove("pane-dragging");
  };
  return (
    <div
      ref={el}
      className="pane-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} · tarik untuk mengubah lebar, klik dua kali untuk bawaan`}
      style={{ [edge]: value + offset, ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        if (e.key === "ArrowLeft") onChange(Math.max(min, value + (edge === "left" ? -step : step)));
        else if (e.key === "ArrowRight") onChange(Math.min(max, value + (edge === "left" ? step : -step)));
        else if (e.key === "Home" || e.key === "Enter") onReset?.();
        else return;
        e.preventDefault();
      }}
    />
  );
}
