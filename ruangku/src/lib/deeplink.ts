// Membuka item tertentu di halaman lain (palet perintah, kalender, widget, catatan).
// Permintaan disimpan di localStorage agar halaman yang baru dipasang bisa mengambilnya,
// dan juga dikirim sebagai event bila halamannya sudah terbuka.
import { useEffect, useRef } from "react";
import { api, isDesktop } from "./api";

export type OpenKind = "task" | "note" | "date" | "objective" | "kpi" | "meeting" | "course" | "finance" | "calendars" | "settings";
/** Id khusus: buka formulir "baru" pada halaman tujuan. */
export const NEW_ID = "__new";

const key = (k: OpenKind) => `ruangku-open-${k}`;
const EVT = "ruangku:open-item";

export function requestOpen(kind: OpenKind, id: string) {
  try {
    localStorage.setItem(key(kind), id);
  } catch {
    /* abaikan */
  }
  window.dispatchEvent(new CustomEvent(EVT, { detail: { kind, id } }));
}

export function takeOpen(kind: OpenKind): string | null {
  try {
    const v = localStorage.getItem(key(kind));
    if (v) localStorage.removeItem(key(kind));
    return v;
  } catch {
    return null;
  }
}

/** Panggil cb saat ada permintaan membuka item jenis ini (termasuk yang tertunda). */
export function useOpenRequest(kind: OpenKind, cb: (id: string) => void, ready = true) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    if (!ready) return;
    const pending = takeOpen(kind);
    if (pending) ref.current(pending);
    const h = (e: Event) => {
      const d = (e as CustomEvent<{ kind: OpenKind; id: string }>).detail;
      if (d.kind !== kind) return;
      takeOpen(kind);
      ref.current(d.id);
    };
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, [kind, ready]);
}

const REMOTE = "open_request";

/** Dari jendela lain (widget, sticky): minta jendela utama membuka item di halaman tertentu. */
export async function requestOpenRemote(kind: OpenKind, id: string, page: string) {
  if (!isDesktop) {
    requestOpen(kind, id);
    window.dispatchEvent(new CustomEvent("ruangku:navigate", { detail: page }));
    return;
  }
  await api.setSetting(REMOTE, JSON.stringify({ kind, id, at: Date.now() }));
  await api.openMain(page);
}

/** Dipasang di jendela utama: teruskan permintaan dari jendela lain. */
export async function consumeRemoteOpen() {
  const raw = await api.getSetting(REMOTE);
  if (!raw) return;
  try {
    const r = JSON.parse(raw) as { kind: OpenKind; id: string; at: number };
    if (Date.now() - r.at < 15000) requestOpen(r.kind, r.id);
  } catch {
    /* abaikan */
  }
  await api.setSetting(REMOTE, "");
}

/** Pindah halaman di jendela ini (didengar App). */
export function goTo(page: string) {
  window.dispatchEvent(new CustomEvent("ruangku-go", { detail: page }));
}

/** Buka Pengaturan pada tab tertentu. */
export function openSettings(tab: string) {
  requestOpen("settings", tab);
  goTo("settings");
}
