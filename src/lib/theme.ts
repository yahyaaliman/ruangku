// Tema tampilan: ikuti sistem, terang, atau gelap. Disimpan di setelan "theme" dan
// diterapkan sebagai atribut data-theme pada <html> (CSS memakai :root[data-theme]).
import { useEffect, useState } from "react";
import { api, onEvent } from "./api";

export const THEME_KEY = "theme";

export type ThemePref = "system" | "light" | "dark";
const KEY = "ruangku-theme";

/** Simpan pilihan tema (berlaku di semua jendela aplikasi). */
export function setTheme(pref: ThemePref) {
  applyTheme(pref);
  api.setSetting(THEME_KEY, pref).catch(() => {});
}

/** Pasang di setiap jendela non-widget: terapkan tema tersimpan dan ikuti perubahannya. */
export function followTheme() {
  initTheme();
  const sync = () =>
    api
      .getSetting(THEME_KEY)
      .then((v) => {
        const p: ThemePref = v === "light" || v === "dark" ? v : "system";
        if (p !== storedTheme()) applyTheme(p);
      })
      .catch(() => {});
  sync();
  onEvent<string>("setting-changed", (k) => k === THEME_KEY && sync());
}

export function applyTheme(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === "system") delete el.dataset.theme;
  else el.dataset.theme = pref;
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* penyimpanan tidak tersedia */
  }
  window.dispatchEvent(new Event("ruangku-theme"));
}

/** Dipanggil sedini mungkin (sebelum render) agar tidak berkedip. */
export function initTheme() {
  try {
    const v = localStorage.getItem(KEY) as ThemePref | null;
    if (v === "light" || v === "dark") document.documentElement.dataset.theme = v;
  } catch {
    /* abaikan */
  }
}

export function useThemePref(): [ThemePref, (p: ThemePref) => void] {
  const [p, setP] = useState<ThemePref>(storedTheme);
  useEffect(() => {
    const f = () => setP(storedTheme());
    window.addEventListener("ruangku-theme", f);
    return () => window.removeEventListener("ruangku-theme", f);
  }, []);
  return [p, (x) => (setTheme(x), setP(x))];
}

export function storedTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

export function isDark(): boolean {
  if (typeof window === "undefined") return false;
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** true bila tampilan sedang gelap (mengikuti setelan tema maupun sistem). */
export function useDark(): boolean {
  const [dark, setDark] = useState(isDark);
  useEffect(() => {
    const q = window.matchMedia?.("(prefers-color-scheme: dark)");
    const f = () => setDark(isDark());
    q?.addEventListener("change", f);
    window.addEventListener("ruangku-theme", f);
    return () => {
      q?.removeEventListener("change", f);
      window.removeEventListener("ruangku-theme", f);
    };
  }, []);
  return dark;
}
