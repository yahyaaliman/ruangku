import { useCallback, useEffect, useMemo, useState } from "react";
import type { Item, TimeBlock } from "./types";
import { strip, useRecords } from "./useRecords";
import { addDays, dateKey, parseDateKey } from "./date";
import type { Task } from "./tasks";

export const TIMER_ID = "active-timer";

export interface ActiveTimer {
  taskId: string;
  title: string;
  color?: TimeBlock["color"];
  startedAt: number;
}

/** Pecah sesi timer menjadi blok per tanggal (bila melewati tengah malam). Menit dibulatkan. */
export function splitSession(startMs: number, endMs: number): { date: string; start: number; end: number }[] {
  const out: { date: string; start: number; end: number }[] = [];
  if (endMs - startMs < 60_000) return out;
  let cur = startMs;
  while (cur < endMs) {
    const d = new Date(cur);
    const date = dateKey(d);
    const dayEnd = addDays(parseDateKey(date), 1).getTime();
    const segEnd = Math.min(endMs, dayEnd);
    const s = Math.floor((cur - parseDateKey(date).getTime()) / 60_000);
    const e = Math.min(1440, Math.round((segEnd - parseDateKey(date).getTime()) / 60_000));
    if (e > s) out.push({ date, start: s, end: e });
    cur = segEnd;
  }
  return out;
}

/** Menit tercatat per tugas dari blok hasil timer. */
export function trackedByTask(blocks: Item<TimeBlock>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of blocks) if (b.tracked && b.taskId) m.set(b.taskId, (m.get(b.taskId) ?? 0) + (b.end - b.start));
  return m;
}

export function fmtClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(ss).padStart(2, "0")}`;
}

export function useTimer() {
  const timers = useRecords<ActiveTimer>("timer");
  const blocks = useRecords<TimeBlock>("timeblock");
  const active = timers.items.find((t) => t.id === TIMER_ID);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);

  const stop = useCallback(async () => {
    if (!active) return;
    const a = strip(active);
    await timers.remove(TIMER_ID);
    for (const seg of splitSession(a.startedAt, Date.now())) {
      await blocks.save({ date: seg.date, start: seg.start, end: seg.end, title: a.title, color: a.color ?? "nila", done: true, taskId: a.taskId, tracked: true });
    }
  }, [active, timers, blocks]);

  const start = useCallback(
    async (task: Item<Task>, color?: TimeBlock["color"]) => {
      if (active) await stop();
      await timers.save({ taskId: task.id, title: task.title, color, startedAt: Date.now() }, TIMER_ID);
    },
    [active, stop, timers],
  );

  const tracked = useMemo(() => {
    const m = trackedByTask(blocks.items);
    if (active) m.set(active.taskId, (m.get(active.taskId) ?? 0) + (now - active.startedAt) / 60000);
    return m;
  }, [blocks.items, active, now]);

  return { active, elapsed: active ? now - active.startedAt : 0, start, stop, tracked, blocks };
}
