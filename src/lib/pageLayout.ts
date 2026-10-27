// Tata letak per halaman yang bisa diatur pengguna: bagian mana yang tampil, urutannya,
// dan lebar (setengah/penuh). Disimpan per perangkat di setelan `layout_<halaman>`.
import { useCallback, useMemo } from "react";
import { useJsonSetting } from "./useSetting";

export interface SectionDef {
  id: string;
  label: string;
  /** Bisa diatur lebar penuh / setengah (untuk grid) */
  canWide?: boolean;
  /** Lebar bawaan */
  wide?: boolean;
  /** Tampil secara bawaan (default true) */
  on?: boolean;
}

export interface LayoutState {
  order: string[];
  hidden: string[];
  shown: string[];
  wide: Record<string, boolean>;
  opts: Record<string, unknown>;
}
/** Untuk halaman yang hanya memakai opsi tampilan, tanpa daftar bagian. */
export const NO_SECTIONS: SectionDef[] = [];
export const EMPTY_LAYOUT: LayoutState = { order: [], hidden: [], shown: [], wide: {}, opts: {} };

export interface Section extends Required<Pick<SectionDef, "id" | "label">> {
  on: boolean;
  wide: boolean;
  canWide: boolean;
}

/** Gabungkan definisi bagian dengan pilihan pengguna. Bagian baru muncul di posisi bawaannya. */
export function resolveLayout(defs: SectionDef[], st: Partial<LayoutState>): Section[] {
  const order = (st.order ?? []).filter((id) => defs.some((d) => d.id === id));
  const ids = [...order];
  defs.forEach((d, i) => {
    if (ids.includes(d.id)) return;
    // Sisipkan setelah bagian bawaan sebelumnya yang sudah ada di urutan.
    const prev = defs.slice(0, i).map((x) => x.id).reverse().find((x) => ids.includes(x));
    ids.splice(prev ? ids.indexOf(prev) + 1 : 0, 0, d.id);
  });
  return ids.map((id) => {
    const d = defs.find((x) => x.id === id)!;
    const defaultOn = d.on !== false;
    const on = defaultOn ? !(st.hidden ?? []).includes(id) : (st.shown ?? []).includes(id);
    return { id, label: d.label, on, canWide: !!d.canWide, wide: st.wide?.[id] ?? !!d.wide };
  });
}

export function moveIn(ids: string[], id: string, dir: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const out = ids.slice();
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

export interface PageLayout {
  sections: Section[];
  visible: Section[];
  isOn: (id: string) => boolean;
  isWide: (id: string) => boolean;
  toggle: (id: string, on?: boolean) => void;
  toggleWide: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  reset: () => void;
  opt: <T>(key: string, fallback: T) => T;
  setOpt: (key: string, value: unknown) => void;
  customized: boolean;
}

export function usePageLayout(page: string, defs: SectionDef[]): PageLayout {
  const [st, save] = useJsonSetting<LayoutState>(`layout_${page}`, EMPTY_LAYOUT);
  const sections = useMemo(() => resolveLayout(defs, st), [defs, st]);
  const set = useCallback((fn: (s: LayoutState) => LayoutState) => save((cur) => fn({ ...EMPTY_LAYOUT, ...cur })), [save]);
  return {
    sections,
    visible: sections.filter((s) => s.on),
    isOn: (id) => sections.find((s) => s.id === id)?.on ?? true,
    isWide: (id) => sections.find((s) => s.id === id)?.wide ?? false,
    toggle: (id, on) =>
      set((s) => {
        const def = defs.find((d) => d.id === id);
        const cur = sections.find((x) => x.id === id)?.on ?? true;
        const next = on ?? !cur;
        if (def?.on === false) return { ...s, shown: next ? [...new Set([...s.shown, id])] : s.shown.filter((x) => x !== id) };
        return { ...s, hidden: next ? s.hidden.filter((x) => x !== id) : [...new Set([...s.hidden, id])] };
      }),
    toggleWide: (id) => set((s) => ({ ...s, wide: { ...s.wide, [id]: !(sections.find((x) => x.id === id)?.wide ?? false) } })),
    move: (id, dir) => set((s) => ({ ...s, order: moveIn(sections.map((x) => x.id), id, dir) })),
    reset: () => save(EMPTY_LAYOUT),
    opt: <T,>(key: string, fallback: T) => (key in (st.opts ?? {}) ? (st.opts[key] as T) : fallback),
    setOpt: (key, value) => set((s) => ({ ...s, opts: { ...s.opts, [key]: value } })),
    customized: !!(st.order?.length || st.hidden?.length || st.shown?.length || Object.keys(st.wide ?? {}).length || Object.keys(st.opts ?? {}).length),
  };
}

/** Kelompokkan bagian berurutan: kartu-kartu yang bersebelahan masuk satu grid. */
export function groupRuns(ids: string[], gridIds: Set<string>): { grid: boolean; ids: string[] }[] {
  const out: { grid: boolean; ids: string[] }[] = [];
  for (const id of ids) {
    const g = gridIds.has(id);
    const last = out[out.length - 1];
    if (g && last?.grid) last.ids.push(id);
    else out.push({ grid: g, ids: [id] });
  }
  return out;
}
