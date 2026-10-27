// Ruang lingkup proyek global: "Semua proyek" atau satu proyek beserta subproyeknya.
// Dipakai Tugas, Jadwal, OKR, KPI, Evaluasi, Catatan, File, dan dasbor.
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, onEvent } from "./api";
import { useRecords } from "./useRecords";
import type { Item } from "./types";
import { INBOX_ID, Project } from "./tasks";
import { flatTree, inScope, projectPath, ScopeId, scopeSet } from "./projects";

export interface ScopeValue {
  scope: ScopeId;
  setScope: (s: ScopeId) => void;
  /** Id proyek yang masuk ruang lingkup (null = semua). */
  ids: Set<string> | null;
  match: (projectId: string | undefined) => boolean;
  /** Proyek terpilih (null bila semua). */
  current: Item<Project> | null;
  /** Proyek aktif (tanpa Inbox & arsip), urut pohon. */
  projects: Item<Project>[];
  /** Semua proyek termasuk arsip. */
  allProjects: Item<Project>[];
  /** Proyek bawaan untuk item baru. */
  defaultProjectId: string | undefined;
  path: (id: string | undefined) => string;
  byId: (id: string | undefined) => Item<Project> | undefined;
  loading: boolean;
}

const Ctx = createContext<ScopeValue | null>(null);

export function ScopeProvider({ children, settingKey = "project_scope" }: { children: ReactNode; settingKey?: string }) {
  const rec = useRecords<Project>("project");
  const [scope, setScopeState] = useState<ScopeId>("all");
  useEffect(() => {
    const load = () => api.getSetting(settingKey).then((v) => setScopeState(v || "all")).catch(() => {});
    load();
    return onEvent<string>("setting-changed", (k) => k === settingKey && load());
  }, [settingKey]);
  const setScope = useCallback(
    (s: ScopeId) => {
      setScopeState(s);
      api.setSetting(settingKey, s).catch(() => {});
    },
    [settingKey],
  );
  const value = useMemo<ScopeValue>(() => {
    const live = rec.items.filter((p) => !p.archived && p.id !== INBOX_ID);
    const ordered = flatTree(live).map((x) => x.p);
    const valid = scope === "all" || rec.items.some((p) => p.id === scope);
    const s = valid ? scope : "all";
    const ids = scopeSet(rec.items, s);
    return {
      scope: s,
      setScope,
      ids,
      match: (pid) => inScope(ids, pid),
      current: s === "all" ? null : rec.items.find((p) => p.id === s) ?? null,
      projects: ordered,
      allProjects: rec.items,
      defaultProjectId: s === "all" ? undefined : s,
      path: (id) => projectPath(rec.items, id),
      byId: (id) => (id ? rec.items.find((p) => p.id === id) : undefined),
      loading: rec.loading,
    };
  }, [rec.items, rec.loading, scope, setScope]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const FALLBACK: ScopeValue = {
  scope: "all",
  setScope: () => {},
  ids: null,
  match: () => true,
  current: null,
  projects: [],
  allProjects: [],
  defaultProjectId: undefined,
  path: () => "",
  byId: () => undefined,
  loading: false,
};

export function useScope(): ScopeValue {
  return useContext(Ctx) ?? FALLBACK;
}
