import { useMemo } from "react";
import { strip, useRecords } from "./useRecords";

export const NOTIF_CONFIG_ID = "notif-config";

/** Sama dengan NotifConfig di src-tauri/src/notify.rs */
export interface NotifConfig {
  blocks: { enabled: boolean; lead: number; atEnd: boolean };
  quiet: { enabled: boolean; start: string; end: string };
  review: {
    daily: { on: boolean; time: string };
    weekly: { on: boolean; time: string; day: number };
    monthly: { on: boolean; time: string };
  };
}

export const DEFAULT_NOTIF: NotifConfig = {
  blocks: { enabled: true, lead: 5, atEnd: true },
  quiet: { enabled: true, start: "22:00", end: "05:00" },
  review: {
    daily: { on: true, time: "21:00" },
    weekly: { on: true, time: "20:00", day: 0 },
    monthly: { on: true, time: "20:30" },
  },
};

export function normalizeNotif(raw: unknown): NotifConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<NotifConfig>;
  return {
    blocks: { ...DEFAULT_NOTIF.blocks, ...(r.blocks ?? {}) },
    quiet: { ...DEFAULT_NOTIF.quiet, ...(r.quiet ?? {}) },
    review: {
      daily: { ...DEFAULT_NOTIF.review.daily, ...(r.review?.daily ?? {}) },
      weekly: { ...DEFAULT_NOTIF.review.weekly, ...(r.review?.weekly ?? {}) },
      monthly: { ...DEFAULT_NOTIF.review.monthly, ...(r.review?.monthly ?? {}) },
    },
  };
}

export function useNotifConfig() {
  const rec = useRecords<NotifConfig>("notifconfig");
  const raw = rec.items.find((x) => x.id === NOTIF_CONFIG_ID);
  const config = useMemo(() => normalizeNotif(raw ? strip(raw) : null), [raw]);
  const save = (c: NotifConfig) => rec.save(c, NOTIF_CONFIG_ID);
  return { config, save, loading: rec.loading };
}
