import type { Repeat } from "./types";

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: "Sekali",
  daily: "Setiap hari",
  weekdays: "Hari kerja",
  weekly: "Setiap minggu",
  monthly: "Setiap bulan",
};

function daysInMonth(y: number, m: number) {
  return new Date(y, m + 1, 0).getDate();
}

/** Jadwal berikutnya setelah `after` (sama dengan logika di Rust). */
export function nextOccurrence(dueAt: number, repeat: Repeat, after: number, anchorDay?: number): number | null {
  if (repeat === "none") return null;
  const t = new Date(dueAt);
  const anchor = anchorDay ?? t.getDate();
  for (let guard = 0; guard < 20000; guard++) {
    if (repeat === "daily") t.setDate(t.getDate() + 1);
    else if (repeat === "weekly") t.setDate(t.getDate() + 7);
    else if (repeat === "weekdays") {
      do t.setDate(t.getDate() + 1);
      while (t.getDay() === 0 || t.getDay() === 6);
    } else if (repeat === "monthly") {
      const y = t.getMonth() === 11 ? t.getFullYear() + 1 : t.getFullYear();
      const m = (t.getMonth() + 1) % 12;
      t.setDate(1);
      t.setFullYear(y, m, Math.min(anchor, daysInMonth(y, m)));
    }
    if (t.getTime() > after) return t.getTime();
  }
  return null;
}
