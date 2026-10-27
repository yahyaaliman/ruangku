import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

// ---------- Toast ----------
type ToastAction = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "info" | "error"; action?: ToastAction };
type PushToast = (text: string, tone?: Toast["tone"], action?: ToastAction) => void;
const ToastCtx = createContext<PushToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback<PushToast>((text, tone = "info", action) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone, action }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : action ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span>{t.text}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => {
                  t.action!.run();
                  setToasts((all) => all.filter((x) => x.id !== t.id));
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Modal ----------
export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, textarea, select, button.btn-primary");
    first?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Progress({ value, tone }: { value: number; tone?: "aman" | "waspada" | "tertinggal" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={`progress ${tone ? `progress-${tone}` : ""}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="progress-fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Empty({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {text && <p className="empty-text">{text}</p>}
      {action}
    </div>
  );
}

/** Grafik garis kecil. Nilai null = hari tanpa data (garis terputus). */
export function Sparkline({
  values,
  target,
  height = 56,
  width = 220,
}: {
  values: (number | null)[];
  target?: number;
  height?: number;
  width?: number;
}) {
  const nums = values.filter((v): v is number => v !== null);
  const all = target !== undefined ? [...nums, target] : nums;
  if (nums.length === 0) return <svg width={width} height={height} className="spark" aria-hidden="true" />;
  const min = Math.min(...all);
  const max = Math.max(...all);
  const pad = 4;
  const span = max - min || 1;
  const x = (i: number) => pad + (i * (width - pad * 2)) / Math.max(1, values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const segs: string[] = [];
  let cur = "";
  values.forEach((v, i) => {
    if (v === null) {
      if (cur) segs.push(cur);
      cur = "";
    } else cur += `${cur ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
  });
  if (cur) segs.push(cur);
  const lastIdx = values.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0).pop()!;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" aria-hidden="true">
      {target !== undefined && <line x1={pad} x2={width - pad} y1={y(target)} y2={y(target)} className="spark-target" />}
      {segs.map((d, i) => (
        <path key={i} d={d} className="spark-line" />
      ))}
      <circle cx={x(lastIdx)} cy={y(values[lastIdx]!)} r={3} className="spark-dot" />
    </svg>
  );
}

export function Confirm({
  title,
  text,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Batal
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p>{text}</p>
    </Modal>
  );
}
