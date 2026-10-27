import { useCallback, useEffect, useRef, useState } from "react";
import { api, onEvent } from "./api";
import type { BlockColor, WidgetConfig, WidgetPrefs, WidgetSection } from "./types";

const KEY = "widget_prefs";

export const SECTION_LABEL: Record<WidgetSection, string> = {
  ibadah: "Ibadah & jadwal sholat",
  agenda: "Agenda hari ini (jadwal, pengingat, kalender)",
  tasks: "Tugas hari ini",
  kpi: "KPI hari ini",
  okr: "Progres OKR",
  notes: "Catatan disematkan",
};

export const DEFAULT_PREFS: WidgetPrefs = {
  tone: "gelap",
  opacity: 42,
  scale: 100,
  radius: 18,
  sections: [
    { id: "ibadah", on: true },
    { id: "agenda", on: true },
    { id: "tasks", on: true },
    { id: "kpi", on: true },
    { id: "okr", on: true },
    { id: "notes", on: true },
  ],
  agendaCount: 5,
  showSeconds: false,
  showClock: true,
  locked: false,
  orientation: "vertikal",
  gridSize: 100,
  collapsed: [],
  accent: "bawaan",
  mini: false,
  restore: null,
};

export const ACCENTS: { id: WidgetPrefs["accent"]; label: string; dark: string; light: string }[] = [
  { id: "bawaan", label: "Bawaan", dark: "#a3aeff", light: "#3b4cca" },
  { id: "laut", label: "Laut", dark: "#5cc0e0", light: "#1f7f9e" },
  { id: "daun", label: "Daun", dark: "#5fd3a6", light: "#237a59" },
  { id: "kunyit", label: "Kunyit", dark: "#f3c25a", light: "#8a5f00" },
  { id: "jambu", label: "Jambu", dark: "#ef8ab8", light: "#b8457a" },
  { id: "ungu", label: "Ungu", dark: "#b48cf0", light: "#7a4cb8" },
  { id: "bata", label: "Bata", dark: "#ff8a80", light: "#b83a32" },
];

/** Ukuran jendela mode mini (piksel fisik pada skala 100%). */
export const MINI_SIZE = { w: 320, h: 150 };

/** Letak cepat widget di layar. */
export const PLACES: { id: string; label: string }[] = [
  { id: "kiri-atas", label: "Kiri atas" },
  { id: "kanan-atas", label: "Kanan atas" },
  { id: "kiri-bawah", label: "Kiri bawah" },
  { id: "kanan-bawah", label: "Kanan bawah" },
  { id: "kanan-penuh", label: "Kanan, setinggi layar" },
  { id: "bawah-penuh", label: "Bawah, selebar layar" },
];

/** Ukuran jendela siap pakai (piksel fisik pada skala 100%). */
export const SIZE_PRESETS: { id: string; label: string; w: number; h: number; orientation: WidgetPrefs["orientation"] }[] = [
  { id: "kecil", label: "Kecil", w: 300, h: 480, orientation: "vertikal" },
  { id: "sedang", label: "Sedang", w: 360, h: 640, orientation: "vertikal" },
  { id: "besar", label: "Besar", w: 440, h: 860, orientation: "vertikal" },
  { id: "lebar", label: "Lebar", w: 960, h: 380, orientation: "horizontal" },
  { id: "panorama", label: "Panorama", w: 1400, h: 320, orientation: "horizontal" },
];

/** Gaya siap pakai supaya pengguna tidak perlu mengatur satu per satu. */
export const PRESETS: { name: string; prefs: Partial<WidgetPrefs>; effect: WidgetConfig["effect"] }[] = [
  { name: "Kaca gelap", prefs: { tone: "gelap", opacity: 42, radius: 18 }, effect: "none" },
  { name: "Kaca terang", prefs: { tone: "terang", opacity: 55, radius: 18 }, effect: "none" },
  { name: "Bening", prefs: { tone: "gelap", opacity: 0, radius: 0 }, effect: "none" },
  { name: "Blur Windows", prefs: { tone: "gelap", opacity: 18, radius: 12 }, effect: "acrylic" },
  { name: "Solid", prefs: { tone: "gelap", opacity: 92, radius: 14 }, effect: "none" },
];

/** Gabungkan prefs tersimpan dengan default (aman bila versi lama/korup). */
export function normalizePrefs(raw: unknown): WidgetPrefs {
  const p = { ...DEFAULT_PREFS, ...(raw && typeof raw === "object" ? (raw as Partial<WidgetPrefs>) : {}) };
  const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d);
  p.opacity = clamp(p.opacity, 0, 100, DEFAULT_PREFS.opacity);
  p.scale = clamp(p.scale, 70, 150, DEFAULT_PREFS.scale);
  p.radius = clamp(p.radius, 0, 28, DEFAULT_PREFS.radius);
  p.agendaCount = Math.round(clamp(p.agendaCount, 1, 12, DEFAULT_PREFS.agendaCount));
  p.gridSize = clamp(p.gridSize, 60, 180, DEFAULT_PREFS.gridSize);
  if (p.orientation !== "vertikal" && p.orientation !== "horizontal") p.orientation = "vertikal";
  if (p.tone !== "gelap" && p.tone !== "terang") p.tone = "gelap";
  const valid = Object.keys(SECTION_LABEL) as WidgetSection[];
  p.collapsed = Array.isArray(p.collapsed) ? [...new Set(p.collapsed.filter((c) => valid.includes(c)))] : [];
  if (!ACCENTS.some((a) => a.id === p.accent)) p.accent = "bawaan";
  p.mini = p.mini === true;
  p.restore = p.restore && typeof p.restore.w === "number" && typeof p.restore.h === "number" ? { w: p.restore.w, h: p.restore.h } : null;
  // Pastikan semua bagian ada tepat sekali, urutan tersimpan dipertahankan.
  const seen = new Set<string>();
  const ids = Object.keys(SECTION_LABEL) as WidgetSection[];
  const secs = (Array.isArray(p.sections) ? p.sections : []).filter((s) => ids.includes(s?.id) && !seen.has(s.id) && seen.add(s.id));
  // Bagian baru (mis. dari versi lebih baru) memakai status default-nya, ditaruh di posisi default.
  ids.forEach((id, i) => {
    if (seen.has(id)) return;
    const def = DEFAULT_PREFS.sections.find((s) => s.id === id);
    secs.splice(Math.min(i, secs.length), 0, { id, on: def?.on ?? false });
  });
  p.sections = secs.map((s) => ({ id: s.id, on: !!s.on }));
  return p;
}

export const accentHex = (accent: WidgetPrefs["accent"], dark: boolean) => {
  const a = ACCENTS.find((x) => x.id === accent) ?? ACCENTS[0];
  return dark ? a.dark : a.light;
};

export function toggleCollapsed(list: WidgetSection[], id: WidgetSection): WidgetSection[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export type { BlockColor };

export function moveSection(sections: WidgetPrefs["sections"], id: WidgetSection, dir: -1 | 1) {
  const i = sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= sections.length) return sections;
  const copy = sections.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export function useWidgetPrefs() {
  const [prefs, setPrefs] = useState<WidgetPrefs>(DEFAULT_PREFS);
  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(prefs);
  latest.current = prefs;
  const saved = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const raw = await api.getSetting(KEY);
    // Abaikan gema dari simpanan jendela ini sendiri supaya slider tidak meloncat.
    if (raw !== null && raw === saved.current) return;
    try {
      setPrefs(normalizePrefs(raw ? JSON.parse(raw) : null));
    } catch {
      setPrefs(DEFAULT_PREFS);
    }
  }, []);

  useEffect(() => {
    reload();
    api.widgetConfig().then(setConfig).catch(() => {});
    const a = onEvent<string>("setting-changed", (k) => k === KEY && reload());
    const b = onEvent<WidgetConfig>("widget-config", setConfig);
    return () => {
      a();
      b();
    };
  }, [reload]);

  /** Perubahan langsung terlihat; disimpan 250 ms kemudian. */
  const update = useCallback((patch: Partial<WidgetPrefs>) => {
    setPrefs((p) => normalizePrefs({ ...p, ...patch }));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saved.current = JSON.stringify(latest.current);
      api.setSetting(KEY, saved.current);
    }, 250);
  }, []);

  return { prefs, update, config, setConfig };
}
