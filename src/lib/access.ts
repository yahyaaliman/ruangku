// Hak akses di antarmuka: proyek yang dibagikan lewat server tim mengikuti peran saya
// di ruang kerjanya. Pembaca hanya bisa melihat; server tetap menjadi penentu akhir.
import { useEffect, useMemo } from "react";
import { lineage } from "./projects";
import { peek, setWriteGuard, useRecords } from "./useRecords";
import { roleLevel, roleLabel, type Role } from "./team";
import { buildIndexFrom, recordProject } from "../team/teamSync";
import type { Item } from "./types";

interface Ws {
  name: string;
  role?: Role;
}
interface P {
  id: string;
  name: string;
  parentId?: string;
  workspaceId?: string;
}

/** Peran saya untuk sebuah proyek (proyek lokal = pemilik). */
export function roleFor(projectId: string | undefined, projects: P[], workspaces: Item<Ws>[]): Role {
  if (!projectId) return "pemilik";
  const wsId = lineage(projects, projectId)
    .map((p) => p.workspaceId)
    .filter(Boolean)
    .pop();
  if (!wsId) return "pemilik";
  return workspaces.find((w) => w.id === wsId)?.role ?? "pemilik";
}

const SHARED_SCOPE = new Set(["project", "task", "timeblock", "note", "objective", "keyresult", "kpi", "kpientry", "reminder", "filemeta", "comment", "ledger", "reference", "meeting", "meetingseries", "course", "account", "budget", "recurring"]);

/** Penjaga tulis untuk penyimpanan bersama: tolak perubahan pada proyek tempat saya pembaca. */
export function writeGuard(kind: string, id: string, data: unknown | null): string | null {
  if (!SHARED_SCOPE.has(kind)) return null;
  const workspaces = peek<Ws>("workspace");
  if (!workspaces.some((w) => w.role === "pembaca")) return null;
  const projects = peek<P>("project") as unknown as P[];
  const prev = peek(kind).find((x) => x.id === id);
  const ix = buildIndexFrom({ project: peek("project"), task: peek("task"), note: peek("note"), objective: peek("objective"), kpi: peek("kpi") });
  const ids = [recordProject({ id, kind, data: data ?? prev ?? {} }, ix), prev ? recordProject({ id, kind, data: prev }, ix) : undefined];
  for (const pid of ids) {
    const role = roleFor(pid, projects, workspaces);
    if (roleLevel(role) <= 1) return `Anda ${roleLabel(role).toLowerCase()} di proyek "${projects.find((p) => p.id === pid)?.name ?? "ini"}", jadi hanya bisa melihat.`;
  }
  return null;
}

export function useAccess() {
  const ws = useRecords<Ws>("workspace");
  const projects = useRecords<P>("project");
  return useMemo(() => {
    const role = (projectId?: string) => roleFor(projectId, projects.items as unknown as P[], ws.items);
    return { role, readOnly: (projectId?: string) => roleLevel(role(projectId)) <= 1 };
  }, [ws.items, projects.items]);
}

/** Pasang penjaga tulis di jendela ini; `onDenied` menampilkan alasannya. */
export function useWriteGuard(onDenied: (msg: string) => void) {
  useAccess(); // memastikan data ruang kerja & proyek termuat
  useEffect(() => {
    setWriteGuard(writeGuard);
    const h = (e: Event) => onDenied((e as CustomEvent<string>).detail);
    window.addEventListener("ruangku:denied", h);
    return () => {
      setWriteGuard(null);
      window.removeEventListener("ruangku:denied", h);
    };
  }, [onDenied]);
}
