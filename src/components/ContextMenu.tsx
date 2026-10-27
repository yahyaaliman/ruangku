// Menu konteks ala Notion: dibuka dengan klik kanan atau tombol ⋯, bisa bertingkat (submenu),
// dinavigasi dengan keyboard (↑ ↓ → ← Enter Esc), dan ditutup saat klik di luar.
import { ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronRight } from "lucide-react";
import "./menu.css";

export type MenuItem =
  | { type: "separator" }
  | { type: "label"; label: string }
  | {
      type?: "item";
      id?: string;
      label: string;
      icon?: ReactNode;
      hint?: string;
      danger?: boolean;
      checked?: boolean;
      disabled?: boolean;
      run?: () => void;
      /** Submenu */
      items?: MenuItem[];
      /** Tetap buka setelah dipilih (mis. centang) */
      keepOpen?: boolean;
    };

type Act = Extract<MenuItem, { label: string; type?: "item" }>;
const isAct = (m: MenuItem): m is Act => m.type === undefined || m.type === "item";

export interface MenuAt {
  x: number;
  y: number;
}

/** Posisi menu dari event klik kanan / tombol. */
export function menuAt(e: { clientX: number; clientY: number } | HTMLElement): MenuAt {
  if (e instanceof HTMLElement) {
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  }
  return { x: e.clientX, y: e.clientY };
}

function MenuPanel({ items, at, onClose, depth = 0, filter, autoFocus = true }: { items: MenuItem[]; at: MenuAt; onClose: (all: boolean) => void; depth?: number; filter?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);
  const [cur, setCur] = useState(-1);
  const [sub, setSub] = useState<{ i: number; at: MenuAt } | null>(null);
  const visible = useMemo(() => {
    if (!filter) return items;
    const f = filter.toLowerCase();
    return items.filter((m) => isAct(m) && m.label.toLowerCase().includes(f));
  }, [items, filter]);
  const acts = visible.map((m, i) => (isAct(m) && !m.disabled ? i : -1)).filter((i) => i >= 0);

  // Jaga agar menu tetap di dalam layar.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(6, Math.min(at.x, window.innerWidth - r.width - 6));
    const y = at.y + r.height > window.innerHeight - 6 ? Math.max(6, window.innerHeight - r.height - 6) : at.y;
    setPos({ x, y });
  }, [at, visible.length]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  const openSub = (i: number) => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-mi="${i}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setSub({ i, at: { x: r.right - 4, y: r.top - 4 } });
  };

  const choose = (i: number) => {
    const m = visible[i];
    if (!m || !isAct(m) || m.disabled) return;
    if (m.items) return openSub(i);
    m.run?.();
    if (!m.keepOpen) onClose(true);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (sub) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!acts.length) return;
      const k = acts.indexOf(cur);
      const next = e.key === "ArrowDown" ? acts[(k + 1) % acts.length] : acts[(k - 1 + acts.length) % acts.length];
      setCur(next);
    } else if (e.key === "Enter" || (e.key === "ArrowRight" && cur >= 0 && isAct(visible[cur]) && (visible[cur] as Act).items)) {
      e.preventDefault();
      if (cur >= 0) choose(cur);
    } else if (e.key === "Escape" || (e.key === "ArrowLeft" && depth > 0)) {
      e.preventDefault();
      e.stopPropagation();
      onClose(e.key === "Escape" && depth === 0);
    }
  };

  return (
    <>
      <div ref={ref} className="cmenu" role="menu" tabIndex={-1} style={{ left: pos.x, top: pos.y }} onKeyDown={onKey} onContextMenu={(e) => e.preventDefault()}>
        {visible.map((m, i) => {
          if (m.type === "separator") return <div key={i} className="cmenu-sep" role="separator" />;
          if (m.type === "label") return <div key={i} className="cmenu-label">{m.label}</div>;
          return (
            <button
              key={i}
              data-mi={i}
              role="menuitem"
              aria-haspopup={m.items ? "menu" : undefined}
              aria-checked={m.checked}
              disabled={m.disabled}
              className={`cmenu-item ${cur === i ? "cur" : ""} ${m.danger ? "danger" : ""}`}
              onMouseEnter={() => {
                setCur(i);
                if (m.items) openSub(i);
                else if (sub) setSub(null);
              }}
              onClick={() => choose(i)}
            >
              <span className="cmenu-icon">{m.checked ? <Check size={14} /> : m.icon}</span>
              <span className="cmenu-text">{m.label}</span>
              {m.hint && <kbd className="cmenu-hint">{m.hint}</kbd>}
              {m.items && <ChevronRight size={13} className="cmenu-more" />}
            </button>
          );
        })}
        {visible.length === 0 && <div className="cmenu-label">Tidak ada yang cocok</div>}
      </div>
      {sub && isAct(visible[sub.i]) && (visible[sub.i] as Act).items && (
        <MenuPanel
          items={(visible[sub.i] as Act).items!}
          at={sub.at}
          depth={depth + 1}
          autoFocus
          onClose={(all) => {
            setSub(null);
            if (all) onClose(true);
            else ref.current?.focus();
          }}
        />
      )}
    </>
  );
}

/** Menu konteks melayang. `items` = null berarti tertutup. */
export function ContextMenu({ items, at, onClose, search }: { items: MenuItem[] | null; at: MenuAt | null; onClose: () => void; search?: boolean }) {
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!items) return;
    setQ("");
    const down = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest?.(".cmenu, .cmenu-search")) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const blur = () => onClose();
    window.addEventListener("mousedown", down, true);
    window.addEventListener("keydown", esc);
    window.addEventListener("blur", blur);
    window.addEventListener("resize", blur);
    return () => {
      window.removeEventListener("mousedown", down, true);
      window.removeEventListener("keydown", esc);
      window.removeEventListener("blur", blur);
      window.removeEventListener("resize", blur);
    };
  }, [items, onClose]);
  if (!items || !at) return null;
  return createPortal(
    <div className="cmenu-layer">
      {search && (
        <input className="cmenu-search" autoFocus placeholder="Cari tindakan…" value={q} onChange={(e) => setQ(e.target.value)} style={{ left: at.x, top: at.y - 38 }} onKeyDown={(e) => e.key === "Escape" && onClose()} />
      )}
      <MenuPanel items={items} at={at} onClose={() => onClose()} filter={q || undefined} autoFocus={!search} />
    </div>,
    document.body,
  );
}

/** State helper: `open(e, items)` lalu render `<ContextMenu {...menu.props} />`. */
export function useContextMenu() {
  const [state, setState] = useState<{ items: MenuItem[]; at: MenuAt } | null>(null);
  const close = useCallback(() => setState(null), []);
  const open = useCallback((e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void } | HTMLElement, items: MenuItem[]) => {
    if (!(e instanceof HTMLElement)) {
      e.preventDefault?.();
      e.stopPropagation?.();
    }
    setState({ items, at: menuAt(e) });
  }, []);
  return { open, close, isOpen: !!state, props: { items: state?.items ?? null, at: state?.at ?? null, onClose: close } };
}
