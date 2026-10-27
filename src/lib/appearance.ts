// Tampilan global yang bisa diatur pengguna: warna aksen, ukuran tampilan (zoom), kepadatan,
// jenis huruf, lebar halaman, sudut, dan animasi. Berlaku di semua jendela aplikasi kecuali
// widget (widget punya pengaturan sendiri). Disimpan di setelan "appearance" + localStorage
// supaya langsung terpasang sebelum render pertama.
import { useEffect, useState } from "react";
import { api, isDesktop, onEvent } from "./api";

export type Accent = "nila" | "laut" | "daun" | "ungu" | "jambu" | "bata" | "kunyit" | "grafit";
export type Density = "ringkas" | "nyaman" | "lega";
export type FontChoice = "jakarta" | "sistem" | "serif";
export type PageWidth = "normal" | "lebar" | "penuh";
export type Radius = "tegas" | "sedang" | "membulat";

export interface Appearance {
  accent: Accent;
  /** Ukuran tampilan dalam persen (80–150) */
  zoom: number;
  density: Density;
  font: FontChoice;
  width: PageWidth;
  radius: Radius;
  reduceMotion: boolean;
}

export const DEFAULT_APPEARANCE: Appearance = { accent: "nila", zoom: 100, density: "nyaman", font: "jakarta", width: "normal", radius: "sedang", reduceMotion: false };
export const APPEARANCE_KEY = "appearance";
const LS = "ruangku-appearance";

/** [utama, lembut, tinta] untuk tema terang dan gelap. Warna utama terang lolos kontras teks putih. */
export const ACCENTS: { id: Accent; label: string; light: [string, string, string]; dark: [string, string, string] }[] = [
  { id: "nila", label: "Nila", light: ["#3b4cca", "#e6e9fb", "#2a38a3"], dark: ["#8d9bff", "#262e57", "#b8c1ff"] },
  { id: "laut", label: "Laut", light: ["#1c7896", "#dcf0f6", "#155f77"], dark: ["#5cc0e0", "#16343f", "#9bdcf0"] },
  { id: "daun", label: "Daun", light: ["#1e7a58", "#dcf1e8", "#145c42"], dark: ["#5fd3a6", "#173a2f", "#9be6c6"] },
  { id: "ungu", label: "Ungu", light: ["#6a44c2", "#ece5fa", "#4f2f9c"], dark: ["#b48cf0", "#2f2450", "#d3bdf7"] },
  { id: "jambu", label: "Jambu", light: ["#b8366f", "#f9e1ec", "#922a58"], dark: ["#ef8ab8", "#43202f", "#f6b5d2"] },
  { id: "bata", label: "Bata", light: ["#b84a26", "#f9e5dc", "#963b1d"], dark: ["#f39a78", "#42261c", "#f8c0a9"] },
  { id: "kunyit", label: "Kunyit", light: ["#9a6400", "#fbf1d9", "#7a4f00"], dark: ["#f0bb4a", "#3a3020", "#f3cf7c"] },
  { id: "grafit", label: "Grafit", light: ["#3d4a5c", "#e6e9ee", "#2a3443"], dark: ["#aab4c5", "#2a3140", "#cfd6e2"] },
];

export const FONTS: { id: FontChoice; label: string; stack: string }[] = [
  { id: "jakarta", label: "Plus Jakarta Sans", stack: '"Plus Jakarta Sans Variable", "Segoe UI", system-ui, sans-serif' },
  { id: "sistem", label: "Huruf sistem (Segoe UI)", stack: '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, sans-serif' },
  { id: "serif", label: "Serif (Georgia)", stack: 'Georgia, Cambria, "Times New Roman", serif' },
];

const RADII: Record<Radius, [number, number, number]> = { tegas: [3, 5, 8], sedang: [6, 10, 16], membulat: [9, 14, 22] };
export const ZOOM_STEPS = [80, 90, 100, 110, 120, 135, 150];

export function normalizeAppearance(raw: unknown): Appearance {
  const p = { ...DEFAULT_APPEARANCE, ...(raw && typeof raw === "object" ? (raw as Partial<Appearance>) : {}) };
  if (!ACCENTS.some((a) => a.id === p.accent)) p.accent = DEFAULT_APPEARANCE.accent;
  p.zoom = typeof p.zoom === "number" && Number.isFinite(p.zoom) ? Math.min(150, Math.max(80, Math.round(p.zoom))) : 100;
  if (!["ringkas", "nyaman", "lega"].includes(p.density)) p.density = "nyaman";
  if (!FONTS.some((f) => f.id === p.font)) p.font = "jakarta";
  if (!["normal", "lebar", "penuh"].includes(p.width)) p.width = "normal";
  if (!(p.radius in RADII)) p.radius = "sedang";
  p.reduceMotion = p.reduceMotion === true;
  return p;
}

/** CSS untuk aksen, huruf, dan sudut (dipasang sebagai <style>, menang atas nilai bawaan). */
export function appearanceCss(a: Appearance): string {
  const acc = ACCENTS.find((x) => x.id === a.accent) ?? ACCENTS[0];
  const font = FONTS.find((f) => f.id === a.font) ?? FONTS[0];
  const [rs, r, rl] = RADII[a.radius];
  const vars = (c: [string, string, string]) => `--nila: ${c[0]}; --nila-soft: ${c[1]}; --nila-ink: ${c[2]};`;
  return [
    `:root:root { ${vars(acc.light)} --font: ${font.stack}; --r-sm: ${rs}px; --r: ${r}px; --r-lg: ${rl}px; }`,
    `@media (prefers-color-scheme: dark) { :root:root:not([data-theme="light"]) { ${vars(acc.dark)} } }`,
    `:root:root[data-theme="dark"] { ${vars(acc.dark)} }`,
  ].join("\n");
}

let current: Appearance = DEFAULT_APPEARANCE;

/** Terapkan ke dokumen ini (dan zoom jendela di aplikasi desktop). */
export function applyAppearance(a: Appearance, opts: { zoom?: boolean } = {}) {
  current = a;
  const el = document.documentElement;
  el.dataset.density = a.density;
  el.dataset.width = a.width;
  if (a.reduceMotion) el.dataset.motion = "reduce";
  else delete el.dataset.motion;
  let style = document.getElementById("ruangku-appearance") as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = "ruangku-appearance";
    document.head.appendChild(style);
  }
  // Selalu paling akhir di <head> supaya menang atas CSS halaman yang dimuat belakangan.
  else if (style.nextSibling) document.head.appendChild(style);
  style.textContent = appearanceCss(a);
  if (opts.zoom !== false) applyZoom(a.zoom);
  try {
    localStorage.setItem(LS, JSON.stringify(a));
  } catch {
    /* abaikan */
  }
  window.dispatchEvent(new Event("ruangku-appearance"));
}

function applyZoom(pct: number) {
  if (isDesktop) {
    // Zoom bawaan webview (seperti Ctrl + di browser): posisi menu & seret tetap akurat.
    api.setZoom(pct / 100).catch(() => {});
    document.documentElement.style.removeProperty("zoom");
  } else if (pct === 100) document.documentElement.style.removeProperty("zoom");
  else document.documentElement.style.setProperty("zoom", String(pct / 100));
}

export function storedAppearance(): Appearance {
  try {
    return normalizeAppearance(JSON.parse(localStorage.getItem(LS) ?? "null"));
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

/** Pasang di setiap jendela non-widget: terapkan tampilan tersimpan dan ikuti perubahannya. */
export function followAppearance() {
  applyAppearance(storedAppearance());
  const sync = () =>
    api
      .getSetting(APPEARANCE_KEY)
      .then((v) => {
        if (!v) return;
        const a = normalizeAppearance(JSON.parse(v));
        if (JSON.stringify(a) !== JSON.stringify(current)) applyAppearance(a);
      })
      .catch(() => {});
  sync();
  onEvent<string>("setting-changed", (k) => k === APPEARANCE_KEY && sync());
}

export function saveAppearance(a: Appearance) {
  const n = normalizeAppearance(a);
  applyAppearance(n);
  api.setSetting(APPEARANCE_KEY, JSON.stringify(n)).catch(() => {});
}

export function useAppearance(): [Appearance, (patch: Partial<Appearance>) => void, () => void] {
  const [a, setA] = useState<Appearance>(() => current);
  useEffect(() => {
    const f = () => setA(current);
    f();
    window.addEventListener("ruangku-appearance", f);
    return () => window.removeEventListener("ruangku-appearance", f);
  }, []);
  return [a, (patch) => saveAppearance({ ...current, ...patch }), () => saveAppearance(DEFAULT_APPEARANCE)];
}

/** Perbesar/perkecil tampilan satu langkah (Ctrl + = / Ctrl + -). */
export function stepZoom(dir: 1 | -1 | 0) {
  const z = current.zoom;
  const next = dir === 0 ? 100 : dir > 0 ? ZOOM_STEPS.find((s) => s > z) ?? 150 : [...ZOOM_STEPS].reverse().find((s) => s < z) ?? 80;
  saveAppearance({ ...current, zoom: next });
  return next;
}
