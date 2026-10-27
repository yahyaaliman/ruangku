// Sumber kalender luar: libur nasional bawaan, langganan ICS (URL), dan Google Calendar.
// Daftar langganan = record "calsub" (ikut sinkron antar-perangkat); isi acara disimpan
// sebagai cache lokal di settings "calcache:<id>" supaya tidak membebani sinkronisasi.
import { useEffect, useMemo, useState } from "react";
import { api, errorText, isWidget, onEvent } from "../lib/api";
import type { BlockColor } from "../lib/types";
import { useRecords } from "../lib/useRecords";
import { parseIcs, type IcsEvent } from "../lib/ics";
import { builtinHolidays } from "../lib/holidays";
import type { ExternalCal } from "../lib/calendar";

export type CalSource = "builtin" | "ics" | "google";

export interface CalSub {
  name: string;
  source: CalSource;
  /** URL ICS (sumber "ics") */
  url?: string;
  /** Id kalender Google (sumber "google") */
  googleId?: string;
  color: BlockColor;
  enabled: boolean;
  /** Acara dianggap hari libur (tanggal merah) */
  holiday?: boolean;
}

export interface CalCache {
  at: number;
  events: IcsEvent[];
  error?: string;
}

export const BUILTIN_ID = "calsub-libur";
const cacheKey = (id: string) => `calcache:${id}`;

export async function readCache(id: string): Promise<CalCache | null> {
  try {
    const v = await api.getSetting(cacheKey(id));
    return v ? (JSON.parse(v) as CalCache) : null;
  } catch {
    return null;
  }
}

export async function writeCache(id: string, c: CalCache) {
  await api.setSetting(cacheKey(id), JSON.stringify(c));
}

export const normalizeUrl = (u: string) => u.trim().replace(/^webcal:\/\//i, "https://");

/** Unduh & baca langganan ICS, simpan ke cache. */
export async function refreshIcs(id: string, sub: CalSub): Promise<CalCache> {
  try {
    const res = await api.http({ method: "GET", url: normalizeUrl(sub.url ?? ""), headers: { accept: "text/calendar, text/plain, */*" }, timeoutMs: 30000 });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
    if (!/BEGIN:VCALENDAR/i.test(res.body)) throw new Error("Isi URL bukan kalender iCalendar (.ics).");
    const events = parseIcs(res.body).slice(0, 8000);
    const c: CalCache = { at: Date.now(), events };
    await writeCache(id, c);
    return c;
  } catch (e) {
    const prev = await readCache(id);
    const c: CalCache = { at: prev?.at ?? 0, events: prev?.events ?? [], error: errorText(e) };
    await writeCache(id, c);
    return c;
  }
}

/** Langganan + cache acara, siap dipakai lapisan "luar" kalender. */
export function useExternalCalendars() {
  const subs = useRecords<CalSub>("calsub");
  const [caches, setCaches] = useState<Map<string, CalCache>>(new Map());
  const [busy, setBusy] = useState(false);

  // Muat cache semua langganan dan ikuti perubahan.
  const ids = subs.items.map((s) => s.id).join(",");
  useEffect(() => {
    let alive = true;
    const loadAll = async () => {
      const m = new Map<string, CalCache>();
      for (const s of subs.items) {
        const c = await readCache(s.id);
        if (c) m.set(s.id, c);
      }
      if (alive) setCaches(m);
    };
    loadAll();
    const stop = onEvent<string>("setting-changed", (k) => {
      if (!k.startsWith("calcache:")) return;
      const id = k.slice(9);
      readCache(id).then((c) => alive && c && setCaches((prev) => new Map(prev).set(id, c)));
    });
    return () => {
      alive = false;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  // Libur nasional bawaan dibuat sekali (id tetap supaya tidak dobel antar-perangkat).
  useEffect(() => {
    if (subs.loading || isWidget) return;
    if (subs.items.some((s) => s.id === BUILTIN_ID)) return;
    api.getSetting("calsub_seeded").then((v) => {
      if (v) return;
      api.setSetting("calsub_seeded", "1");
      subs.save({ name: "Libur nasional Indonesia", source: "builtin", color: "bata", enabled: true, holiday: true }, BUILTIN_ID);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs.loading]);

  // Segarkan ICS yang lebih tua dari 6 jam (hanya jendela utama).
  useEffect(() => {
    if (subs.loading || isWidget) return;
    const stale = subs.items.filter((s) => s.enabled && s.source === "ics" && Date.now() - (caches.get(s.id)?.at ?? 0) > 6 * 3600 * 1000 && !caches.get(s.id)?.error);
    if (!stale.length) return;
    (async () => {
      for (const s of stale) await refreshIcs(s.id, s);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subs.loading, ids, caches.size]);

  const external = useMemo<ExternalCal[]>(() => {
    const out: ExternalCal[] = [];
    for (const s of subs.items) {
      if (!s.enabled) continue;
      const events = s.source === "builtin" ? builtinHolidays() : (caches.get(s.id)?.events ?? []);
      out.push({ id: s.id, name: s.name, color: s.color, holiday: s.holiday, events });
    }
    return out;
  }, [subs.items, caches]);

  const refreshAll = async () => {
    setBusy(true);
    try {
      for (const s of subs.items) if (s.enabled && s.source === "ics") await refreshIcs(s.id, s);
    } finally {
      setBusy(false);
    }
  };

  return { subs, caches, external, refreshAll, busy };
}
