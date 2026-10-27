// Sinkronisasi proyek tim dengan server PocketBase.
// Hanya data milik proyek yang dibagikan (Project.workspaceId) yang dikirim.
// Konflik diselesaikan last-write-wins memakai waktu ubah dari aplikasi (ts).
// Perubahan yang ditolak server (peran tidak mengizinkan) dikembalikan ke versi server.
import type { RawRecord } from "../lib/types";
import { api } from "../lib/api";
import { subtreeIds } from "../lib/projects";
import { Pb, q, TeamConfig } from "./pb";

export const SHARED_KINDS = ["project", "task", "timeblock", "note", "objective", "keyresult", "kpi", "kpientry", "reminder", "filemeta", "outbox", "comment", "ledger", "reference", "meeting", "meetingseries", "course", "account", "budget", "recurring"];

export interface PbRecord {
  id: string;
  workspace: string;
  rid: string;
  kind: string;
  data: any;
  ts: number;
  deleted: boolean;
  project?: string;
  author?: string;
  updated: string;
}
export interface PbWorkspace {
  id: string;
  name: string;
  owner: string;
}
export interface PbMember {
  id: string;
  workspace: string;
  email: string;
  name?: string;
  role: string;
  user?: string;
  wa?: string;
  telegram?: string;
  notifyVia?: string[] | null;
}

/** Akses ke server (diabstraksikan supaya bisa diuji tanpa server sungguhan). */
export interface Remote {
  workspaces(): Promise<PbWorkspace[]>;
  members(ws: string): Promise<PbMember[]>;
  find(ws: string, rids: string[]): Promise<PbRecord[]>;
  since(ws: string, cursor: string): Promise<PbRecord[]>;
  create(body: Omit<PbRecord, "id" | "updated">): Promise<PbRecord>;
  update(id: string, body: Partial<PbRecord>): Promise<PbRecord>;
}

export interface Local {
  changedSince(since: number): Promise<RawRecord[]>;
  list(kind: string): Promise<RawRecord[]>;
  importRecords(r: RawRecord[]): Promise<number>;
  force(r: RawRecord[]): Promise<number>;
  getSetting(k: string): Promise<string | null>;
  setSetting(k: string, v: string): Promise<void>;
}

export const localApi: Local = {
  changedSince: (s) => api.changedSince(s),
  list: (k) => api.list(k),
  importRecords: (r) => api.importRecords(r),
  force: (r) => api.forceRecords(r),
  getSetting: (k) => api.getSetting(k),
  setSetting: (k, v) => api.setSetting(k, v),
};

export function pbRemote(pb: Pb): Remote {
  return {
    workspaces: () => pb.all<PbWorkspace>("workspaces", { sort: "name" }),
    members: (ws) => pb.all<PbMember>("members", { filter: `workspace = ${q(ws)}`, sort: "created" }),
    async find(ws, rids) {
      const out: PbRecord[] = [];
      for (let i = 0; i < rids.length; i += 40) {
        const chunk = rids.slice(i, i + 40);
        out.push(...(await pb.all<PbRecord>("records", { filter: `workspace = ${q(ws)} && (${chunk.map((r) => `rid = ${q(r)}`).join(" || ")})`, fields: "id,rid,ts,deleted,kind,data,updated,workspace,author,project" })));
      }
      return out;
    },
    since: (ws, cursor) => pb.all<PbRecord>("records", { filter: cursor ? `workspace = ${q(ws)} && updated > ${q(cursor)}` : `workspace = ${q(ws)}`, sort: "updated" }),
    create: (body) => pb.create<PbRecord>("records", body),
    update: (id, body) => pb.update<PbRecord>("records", id, body),
  };
}

interface Index {
  project: Map<string, any>;
  task: Map<string, string>;
  note: Map<string, { projectId?: string; parentId?: string }>;
  objective: Map<string, string | undefined>;
  kpi: Map<string, string | undefined>;
}

/** Indeks dari item yang sudah dimuat (data sudah diratakan). */
export function buildIndexFrom(src: Record<"project" | "task" | "note" | "objective" | "kpi", { id: string }[]>): Index {
  const raw = (xs: { id: string }[]) => xs.map((x) => ({ id: x.id, data: x as any }));
  const [p, t, n, o, k] = [raw(src.project), raw(src.task), raw(src.note), raw(src.objective), raw(src.kpi)];
  return {
    project: new Map(p.map((r) => [r.id, r.data])),
    task: new Map(t.map((r) => [r.id, r.data?.projectId])),
    note: new Map(n.map((r) => [r.id, { projectId: r.data?.projectId, parentId: r.data?.parentId }])),
    objective: new Map(o.map((r) => [r.id, r.data?.projectId])),
    kpi: new Map(k.map((r) => [r.id, r.data?.projectId])),
  };
}

export async function buildIndex(local: Local): Promise<Index> {
  const [p, t, n, o, k] = await Promise.all(["project", "task", "note", "objective", "kpi"].map((x) => local.list(x)));
  return {
    project: new Map(p.map((r) => [r.id, r.data])),
    task: new Map(t.map((r) => [r.id, r.data?.projectId])),
    note: new Map(n.map((r) => [r.id, { projectId: r.data?.projectId, parentId: r.data?.parentId }])),
    objective: new Map(o.map((r) => [r.id, r.data?.projectId])),
    kpi: new Map(k.map((r) => [r.id, r.data?.projectId])),
  };
}

/** Proyek tempat sebuah record berada (untuk menentukan ia dibagikan atau tidak). */
export function recordProject(r: Pick<RawRecord, "id" | "kind" | "data">, ix: Index): string | undefined {
  const d = r.data ?? {};
  switch (r.kind) {
    case "project":
      return r.id;
    case "task":
    case "kpi":
    case "objective":
    case "reminder":
    case "filemeta":
    case "ledger":
    case "reference":
    case "meeting":
    case "meetingseries":
    case "course":
    case "account":
    case "budget":
    case "recurring":
      return d.projectId;
    case "timeblock":
      return d.projectId ?? (d.taskId ? ix.task.get(d.taskId) : undefined);
    case "note": {
      let cur: { projectId?: string; parentId?: string } | undefined = d;
      const seen = new Set<string>();
      while (cur) {
        if (cur.projectId) return cur.projectId;
        if (!cur.parentId || seen.has(cur.parentId)) return undefined;
        seen.add(cur.parentId);
        cur = ix.note.get(cur.parentId);
      }
      return undefined;
    }
    case "keyresult":
      return d.objectiveId ? ix.objective.get(d.objectiveId) : undefined;
    case "kpientry":
      return d.kpiId ? ix.kpi.get(d.kpiId) : undefined;
    case "outbox":
      return d.projectId ?? (d.taskId ? ix.task.get(d.taskId) : undefined);
    case "comment":
      return d.projectId ?? (d.target === "task" ? ix.task.get(d.targetId) : d.target === "note" ? recordProject({ id: d.targetId, kind: "note", data: ix.note.get(d.targetId) ?? {} }, ix) : undefined);
  }
  return undefined;
}

/** Id proyek yang dibagikan ke workspace lokal `wsLocal` (beserta subproyeknya). */
export function sharedProjects(ix: Index, wsLocal: string): Set<string> {
  const list = [...ix.project.entries()].map(([id, d]) => ({ id, name: d?.name ?? "", parentId: d?.parentId, order: d?.order }));
  const out = new Set<string>();
  for (const [id, d] of ix.project) if (d?.workspaceId === wsLocal) for (const x of subtreeIds(list, id)) out.add(x);
  return out;
}

interface WsState {
  push: number;
  pull: string;
  shared: string[];
  rids: string[];
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  rejected: string[];
}

const toRaw = (r: PbRecord): RawRecord => ({ id: r.rid, kind: r.kind, data: r.deleted ? null : r.data, updatedAt: r.ts, deleted: !!r.deleted });

export async function syncWorkspace(remote: Remote, local: Local, wsRemote: string, me: { userId: string }): Promise<SyncReport> {
  const wsLocal = `ws-${wsRemote}`;
  const key = `team_state_${wsRemote}`;
  let st: WsState = { push: 0, pull: "", shared: [], rids: [] };
  try {
    st = { ...st, ...JSON.parse((await local.getSetting(key)) || "{}") };
  } catch {
    /* mulai baru */
  }
  const ridSet = new Set(st.rids);
  const report: SyncReport = { pushed: 0, pulled: 0, rejected: [] };

  // ---------- Tarik dulu supaya perubahan teman terlihat ----------
  const incoming = await remote.since(wsRemote, st.pull);
  if (incoming.length) {
    report.pulled = await local.importRecords(incoming.map(toRaw));
    for (const r of incoming) ridSet.add(r.rid);
    st.pull = incoming[incoming.length - 1].updated;
  }

  // ---------- Kirim perubahan lokal ----------
  const ix = await buildIndex(local);
  const shared = sharedProjects(ix, wsLocal);
  const newly = [...shared].filter((p) => !st.shared.includes(p));
  const changed = await local.changedSince(st.push);
  const byId = new Map<string, RawRecord>();
  for (const r of changed) {
    if (!SHARED_KINDS.includes(r.kind)) continue;
    if (r.deleted ? ridSet.has(r.id) : shared.has(recordProject(r, ix) ?? "")) byId.set(r.id, r);
  }
  // Proyek yang baru dibagikan: kirim seluruh isinya.
  if (newly.length) {
    const nset = new Set(newly);
    for (const kind of SHARED_KINDS) for (const r of await local.list(kind)) if (nset.has(recordProject(r, ix) ?? "")) byId.set(r.id, r);
  }
  const todo = [...byId.values()];
  const existing = new Map((await remote.find(wsRemote, todo.map((r) => r.id))).map((r) => [r.rid, r]));
  const revert: RawRecord[] = [];
  let maxPushed = st.push;
  for (const r of todo) {
    const ex = existing.get(r.id);
    const body = { rid: r.id, kind: r.kind, data: r.deleted ? null : r.data, ts: r.updatedAt, deleted: !!r.deleted, project: r.deleted ? ex?.project ?? "" : recordProject(r, ix) ?? "" };
    try {
      if (!ex) {
        if (!r.deleted) {
          await remote.create({ ...body, workspace: wsRemote, author: me.userId });
          report.pushed++;
        }
      } else if (ex.ts < r.updatedAt) {
        await remote.update(ex.id, body);
        report.pushed++;
      }
      ridSet.add(r.id);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 0;
      if (status === 0 || status >= 500) throw e; // jaringan/server: coba lagi nanti
      // Ditolak karena peran: kembalikan ke versi server (atau hapus bila tidak ada di server).
      report.rejected.push(`${r.kind} ${r.data?.title ?? r.data?.name ?? r.id}`);
      revert.push(ex ? toRaw(ex) : { id: r.id, kind: r.kind, data: null, updatedAt: Date.now(), deleted: true });
    }
    maxPushed = Math.max(maxPushed, r.updatedAt);
  }
  if (revert.length) await local.force(revert);
  st = { push: Math.max(maxPushed, ...changed.map((r) => r.updatedAt), st.push), pull: st.pull, shared: [...shared], rids: [...ridSet] };
  await local.setSetting(key, JSON.stringify(st));
  return report;
}

/** Sinkronkan semua workspace milik pengguna: daftar workspace, anggota, lalu data. */
export async function syncTeam(team: TeamConfig, local: Local = localApi, remote?: Remote): Promise<SyncReport & { workspaces: number }> {
  const pb = new Pb(team.serverUrl, team.token);
  const r = remote ?? pbRemote(pb);
  const wss = await r.workspaces();
  const total: SyncReport & { workspaces: number } = { pushed: 0, pulled: 0, rejected: [], workspaces: wss.length };
  const localWs = await local.list("workspace");
  const localMembers = await local.list("member");
  const ups: RawRecord[] = [];
  const now = Date.now();
  for (const ws of wss) {
    const members = await r.members(ws.id);
    const mine = members.find((m) => m.email.toLowerCase() === team.email.toLowerCase());
    const role = mine?.role ?? (ws.owner === team.userId ? "pemilik" : "pembaca");
    const wsData = { name: ws.name, serverUrl: team.serverUrl, remoteId: ws.id, role };
    const prev = localWs.find((x) => x.id === `ws-${ws.id}`);
    if (!prev || JSON.stringify(prev.data) !== JSON.stringify(wsData)) ups.push({ id: `ws-${ws.id}`, kind: "workspace", data: wsData, updatedAt: now, deleted: false });
    for (const m of members) {
      const data = { name: m.name || m.email.split("@")[0], email: m.email, role: m.role, wa: m.wa || undefined, telegram: m.telegram || undefined, notifyVia: m.notifyVia ?? [], workspaceId: `ws-${ws.id}`, remoteId: m.id, isMe: m.email.toLowerCase() === team.email.toLowerCase() || undefined };
      const p = localMembers.find((x) => x.id === `pbm-${m.id}`);
      const keep = p?.data?.telegramChatId ? { telegramChatId: p.data.telegramChatId } : {};
      if (!p || JSON.stringify({ ...p.data, telegramChatId: undefined }) !== JSON.stringify({ ...data, telegramChatId: undefined })) ups.push({ id: `pbm-${m.id}`, kind: "member", data: { ...data, ...keep }, updatedAt: now, deleted: false });
    }
    for (const lm of localMembers.filter((x) => x.data?.workspaceId === `ws-${ws.id}` && !members.some((m) => `pbm-${m.id}` === x.id))) ups.push({ ...lm, data: null, deleted: true, updatedAt: now });
  }
  // Workspace yang tidak lagi bisa diakses di server ini dihapus dari lokal.
  for (const w of localWs.filter((x) => x.data?.serverUrl === team.serverUrl && !wss.some((s) => `ws-${s.id}` === x.id))) ups.push({ ...w, data: null, deleted: true, updatedAt: now });
  if (ups.length) await local.force(ups);
  for (const ws of wss) {
    const rep = await syncWorkspace(r, local, ws.id, { userId: team.userId });
    total.pushed += rep.pushed;
    total.pulled += rep.pulled;
    total.rejected.push(...rep.rejected);
  }
  return total;
}
