// Jadwal sadar ibadah: rentang waktu sholat dilindungi supaya blok jadwal tidak menimpanya,
// dan blok yang bentrok bisa digeser ke setelah sholat.
import { timesForDate, type Times } from "./prayer";
import { api, onEvent } from "./api";
import { useEffect, useState } from "react";
import { IBADAH_CONFIG_ID, normalizeConfig } from "./ibadah";
import { dataOf } from "./types";
import { parseDateKey } from "./date";

export interface GuardConfig {
  enabled: boolean;
  /** Lama tiap sholat dilindungi (menit), dihitung dari waktu adzan */
  minutes: Record<"subuh" | "dzuhur" | "ashar" | "maghrib" | "isya", number>;
  /** Jumat: Dzuhur diganti sholat Jumat (dimulai 15 menit sebelum adzan, 60 menit) */
  jumat: boolean;
}

export const DEFAULT_GUARD: GuardConfig = { enabled: true, minutes: { subuh: 20, dzuhur: 15, ashar: 15, maghrib: 20, isya: 15 }, jumat: true };
export const GUARD_KEY = "prayer_guard";

export interface Band {
  id: keyof GuardConfig["minutes"];
  name: string;
  start: number;
  end: number;
}

const NAMES: [Band["id"], string][] = [
  ["subuh", "Subuh"],
  ["dzuhur", "Dzuhur"],
  ["ashar", "Ashar"],
  ["maghrib", "Maghrib"],
  ["isya", "Isya"],
];

/** Rentang dilindungi untuk satu tanggal. `weekday` 5 = Jumat. */
export function prayerBands(t: Times, weekday: number, cfg: GuardConfig = DEFAULT_GUARD): Band[] {
  return NAMES.map(([id, name]) => {
    if (id === "dzuhur" && weekday === 5 && cfg.jumat) return { id, name: "Sholat Jumat", start: Math.max(0, t.dzuhur - 15), end: Math.min(1440, t.dzuhur + 45) };
    return { id, name, start: t[id], end: Math.min(1440, t[id] + Math.max(5, cfg.minutes[id] ?? 15)) };
  });
}

export const overlaps = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && b.start < a.end;

export function conflicts(r: { start: number; end: number }, bands: Band[]): Band[] {
  return bands.filter((b) => overlaps(r, b));
}

/**
 * Geser rentang supaya tidak menimpa waktu sholat: mulai tepat setelah sholat yang bentrok
 * (durasi tetap). Bila tidak muat sebelum tengah malam, kembalikan null.
 */
export function nudge(r: { start: number; end: number }, bands: Band[]): { start: number; end: number } | null {
  const dur = r.end - r.start;
  let cur = { start: r.start, end: r.end };
  for (let i = 0; i < bands.length + 1; i++) {
    const hit = conflicts(cur, bands).sort((a, b) => b.end - a.end)[0];
    if (!hit) return cur;
    cur = { start: hit.end, end: hit.end + dur };
    if (cur.end > 1440) return null;
  }
  return null;
}

/** Ringkasan teks untuk asisten AI dan rangkuman pagi. */
export function bandsText(bands: Band[]): string {
  const f = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return bands.map((b) => `${b.name} ${f(b.start)}–${f(b.end)}`).join(", ");
}

export async function loadGuard(): Promise<GuardConfig> {
  try {
    const v = await api.getSetting(GUARD_KEY);
    const p = v ? JSON.parse(v) : {};
    return { ...DEFAULT_GUARD, ...p, minutes: { ...DEFAULT_GUARD.minutes, ...(p.minutes ?? {}) } };
  } catch {
    return DEFAULT_GUARD;
  }
}

export function useGuard() {
  const [cfg, setCfg] = useState<GuardConfig>(DEFAULT_GUARD);
  useEffect(() => {
    loadGuard().then(setCfg);
    return onEvent<string>("setting-changed", (k) => k === GUARD_KEY && loadGuard().then(setCfg));
  }, []);
  const save = async (patch: Partial<GuardConfig>) => {
    const n = { ...cfg, ...patch };
    setCfg(n);
    await api.setSetting(GUARD_KEY, JSON.stringify(n));
  };
  return { cfg, save };
}

/** Rentang sholat dilindungi untuk tanggal tertentu (dibaca langsung dari data; kosong bila lokasi belum diatur atau fitur mati). */
export async function bandsFor(date: string): Promise<Band[]> {
  const [cfg, rows] = await Promise.all([loadGuard(), api.list("ibadahconfig")]);
  if (!cfg.enabled) return [];
  const raw = rows.find((r) => r.id === IBADAH_CONFIG_ID);
  const ib = normalizeConfig(raw ? dataOf(raw.data) : null);
  if (!ib.setup) return [];
  const t = timesForDate(date, { lat: ib.lat, lng: ib.lng, tz: ib.tz, elevation: ib.elevation }, ib.offsets);
  return prayerBands(t, parseDateKey(date).getDay(), cfg);
}
