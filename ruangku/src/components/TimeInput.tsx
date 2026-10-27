// Isian jam 24 jam (HH:MM) yang menerima "9", "930", "9.30", "09:30".
import { useEffect, useState } from "react";
import { fmtMin, parseHHMM } from "../lib/timeblocks";

export function TimeInput({ value, onChange, label, className = "" }: { value: number; onChange: (min: number) => void; label?: string; className?: string }) {
  const [v, setV] = useState(fmtMin(value));
  useEffect(() => setV(fmtMin(value)), [value]);
  const commit = () => {
    const raw = v.trim().replace(".", ":");
    const norm = /^\d{3,4}$/.test(raw) ? `${raw.slice(0, raw.length - 2)}:${raw.slice(-2)}` : /^\d{1,2}$/.test(raw) ? `${raw}:00` : raw;
    const m = parseHHMM(norm);
    if (m === null) return setV(fmtMin(value));
    setV(fmtMin(m));
    if (m !== value) onChange(m);
  };
  return <input className={`hhmm ${className}`} value={v} aria-label={label} inputMode="numeric" onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />;
}
