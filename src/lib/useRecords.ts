import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, onEvent } from "./api";
import { dataOf, type Item } from "./types";

// Penyimpanan bersama per jenis record: satu kali muat dan satu langganan event
// untuk seluruh jendela, berapa pun komponen yang memakai jenis yang sama.

interface Snap {
  items: Item<unknown>[];
  loading: boolean;
}
interface Entry {
  snap: Snap;
  listeners: Set<() => void>;
  inflight: boolean;
  dirty: boolean;
  loaded: boolean;
}

const store = new Map<string, Entry>();
let wired = false;

function entry(kind: string): Entry {
  let e = store.get(kind);
  if (!e) {
    e = { snap: { items: [], loading: true }, listeners: new Set(), inflight: false, dirty: false, loaded: false };
    store.set(kind, e);
  }
  return e;
}

function emit(e: Entry) {
  for (const l of e.listeners) l();
}

async function load(kind: string): Promise<void> {
  const e = entry(kind);
  if (e.inflight) {
    e.dirty = true;
    return;
  }
  e.inflight = true;
  try {
    do {
      e.dirty = false;
      const rows = await api.list(kind);
      e.snap = { items: rows.map((r) => ({ ...dataOf<object>(r.data), id: r.id, updatedAt: r.updatedAt })), loading: false };
      e.loaded = true;
      emit(e);
    } while (e.dirty);
  } catch {
    e.snap = { ...e.snap, loading: false };
    emit(e);
  } finally {
    e.inflight = false;
  }
}

function wire() {
  if (wired) return;
  wired = true;
  onEvent<string>("records-changed", (k) => {
    if (k === "*") {
      for (const [kind, e] of store) if (e.listeners.size || e.loaded) load(kind);
    } else if (store.has(k)) load(k);
  });
}

/** Isi terkini satu jenis tanpa berlangganan (untuk pemeriksaan cepat di luar komponen). */
export function peek<T = unknown>(kind: string): Item<T>[] {
  return (store.get(kind)?.snap.items ?? []) as Item<T>[];
}

/** Penjaga tulis: kembalikan pesan untuk menolak perubahan (mis. peran pembaca), atau null. */
type Guard = (kind: string, id: string, data: unknown | null) => string | null;
let guard: Guard | null = null;
export function setWriteGuard(g: Guard | null) {
  guard = g;
}
function denied(kind: string, id: string, data: unknown | null): boolean {
  const msg = guard?.(kind, id, data);
  if (!msg) return false;
  window.dispatchEvent(new CustomEvent("ruangku:denied", { detail: msg }));
  return true;
}

/** Muat ulang semua jenis yang sedang dipakai (mis. setelah impor). */
export function reloadAll() {
  for (const kind of store.keys()) load(kind);
}

/** Daftar record satu jenis, otomatis dimuat ulang saat ada perubahan
 *  (dari halaman lain, penjadwal reminder, bot, atau hasil sinkronisasi). */
export function useRecords<T>(kind: string) {
  wire();
  const e = entry(kind);
  const subscribe = useCallback(
    (cb: () => void) => {
      const en = entry(kind);
      en.listeners.add(cb);
      return () => {
        en.listeners.delete(cb);
      };
    },
    [kind],
  );
  const snap = useSyncExternalStore(subscribe, () => entry(kind).snap);
  useEffect(() => {
    const en = entry(kind);
    if (!en.loaded && !en.inflight) load(kind);
  }, [kind]);

  const save = useCallback(
    async (data: T, id: string = newIdLocal()) => {
      if (denied(kind, id, data)) return id;
      // Perubahan langsung terlihat di semua komponen (optimistic update).
      const en = entry(kind);
      const next = { ...(data as object), id, updatedAt: Date.now() } as Item<unknown>;
      const i = en.snap.items.findIndex((p) => p.id === id);
      const items = i < 0 ? [next, ...en.snap.items] : en.snap.items.map((p, j) => (j === i ? next : p));
      en.snap = { ...en.snap, items };
      emit(en);
      await api.save(id, kind, data);
      return id;
    },
    [kind],
  );

  const remove = useCallback(
    async (id: string) => {
      if (denied(kind, id, null)) return;
      const en = entry(kind);
      en.snap = { ...en.snap, items: en.snap.items.filter((p) => p.id !== id) };
      emit(en);
      await api.remove(id, kind);
    },
    [kind],
  );

  const reload = useCallback(() => load(kind), [kind]);
  void e;
  return { items: snap.items as Item<T>[], loading: snap.loading, save, remove, reload };
}

function newIdLocal(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

/** Pisahkan id/updatedAt dari data sebelum disimpan ulang. */
export function strip<T>(item: Item<T>): T {
  const { id: _id, updatedAt: _u, ...rest } = item as any;
  return rest as T;
}
