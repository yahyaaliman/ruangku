import { useEffect } from "react";
import { api, errorText, isDesktop, onEvent } from "../lib/api";
import { useJsonSetting } from "../lib/useSetting";
import { dataOf, type RawRecord } from "../lib/types";
import { firstDoneStatus, firstOpenStatus, isDoneStatus, type Project } from "../lib/tasks";
import { roleFor } from "../lib/access";
import { ProviderClient, connectionKey, type Connection, type Provider } from "./provider";
import { fingerprint, reconcile, type Doc, type ExternalEntry, type SyncState } from "./reconcile";

const running = new Map<Provider, Promise<unknown>>();
const empty = (provider: Provider): Connection => ({ provider, clientId: "", connected: false });
export const useConnection = (provider: Provider) => useJsonSetting<Connection>(connectionKey(provider), empty(provider))[0];
export const loadConnection = async (provider: Provider): Promise<Connection> => JSON.parse(await api.getSetting(connectionKey(provider)) || JSON.stringify(empty(provider)));
export const saveConnection = (cfg: Connection) => api.setSetting(connectionKey(cfg.provider), JSON.stringify(cfg));
export const stateKey = (cfg: Connection) => `external_state_${cfg.provider}_${cfg.subject}_${cfg.container}_${cfg.projectId}`;
export async function loadSyncState(cfg: Connection): Promise<SyncState> { return JSON.parse(await api.getSetting(stateKey(cfg)) || '{"links":[],"conflicts":[]}'); }
export function exclusive<T>(provider: Provider, action: () => Promise<T>): Promise<T> {
  if (running.has(provider)) return Promise.reject(new Error("Koneksi sedang diproses. Tunggu hingga selesai."));
  const promise = action().finally(() => running.delete(provider)); running.set(provider, promise); return promise;
}
export async function resolveConflict(cfg: Connection, id: string, choice: "local" | "remote") {
  return exclusive(cfg.provider, async () => {
    const state = await loadSyncState(cfg); state.choices = { ...state.choices, [id]: choice };
    await api.setSetting(stateKey(cfg), JSON.stringify(state));
  });
}
export function runExternal(provider: Provider) {
  return exclusive(provider, async () => {
    const cfg = await loadConnection(provider);
    if (!isDesktop || !cfg.connected || !cfg.container || !cfg.projectId) return;
    try {
      const projects = (await api.list("project")).map(r => ({ ...dataOf<Project>(r.data), id: r.id, updatedAt: r.updatedAt }));
      const workspaces = (await api.list("workspace")).map(r => ({ ...r.data, id: r.id, updatedAt: r.updatedAt }));
      const project = projects.find(p => p.id === cfg.projectId);
      if (!project || project.archived) throw new Error("Proyek tujuan tidak tersedia. Periksa izin atau pilih proyek aktif.");
      if (roleFor(project.id, projects, workspaces) === "pembaca") throw new Error("Sinkron dua arah memerlukan izin mengubah proyek.");
      const kind = provider === "google-tasks" ? "task" : "timeblock";
      const client = new ProviderClient(cfg);
      const raw = new Map<string, RawRecord>();
      const remoteIds = new Map<string, string>();
      const normalize = (r: RawRecord): Doc | null => {
        if (r.deleted) return null;
        const d = r.data;
        return provider === "google-tasks" ? { title: d.title || "", notes: d.description || "", due: d.due || null, completed: isDoneStatus(project, d.status) } : { title: d.title || "", date: d.date, start: d.start, end: d.end };
      };
      const current = await loadSyncState(cfg);
      const linked = new Set(current.links.map(l => l.localId));
      await reconcile(current, {
        async locals() {
          const rows = (await api.changedSince(0)).filter(r => r.kind === kind && (r.deleted ? linked.has(r.id) : r.data?.projectId === project.id));
          rows.forEach(r => raw.set(r.id, r));
          return rows.map(r => ({ id: r.id, doc: normalize(r) }));
        },
        async remotes() {
          const rows = await client.list();
          for (const r of rows) {
            const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${provider}:${cfg.subject}:${cfg.container}:${r.id}`));
            remoteIds.set(r.id, "ext_" + Array.from(new Uint8Array(digest)).slice(0, 16).map(b => b.toString(16).padStart(2, "0")).join(""));
          }
          return rows;
        },
        newId: remoteId => remoteIds.get(remoteId)!,
        getRemote: remoteId => client.get(remoteId),
        async saveLocal(localId, doc) {
          const now = (await api.changedSince(0)).find(r => r.id === localId);
          const before = raw.get(localId);
          if (now && (!before || now.updatedAt !== before.updatedAt)) throw new Error("Item berubah di Ruangku saat sinkronisasi. Coba sinkronkan lagi.");
          if (!doc) { if (now && !now.deleted) await api.remove(localId, kind); return; }
          const previous = now && !now.deleted ? dataOf<Record<string, any>>(now.data) : {};
          const data = provider === "google-tasks" ? { tags: [], checklist: [], dependsOn: [], order: Date.now(), createdAt: Date.now(), ...previous, projectId: project.id, title: doc.title, description: doc.notes, due: doc.due || undefined, status: doc.completed ? firstDoneStatus(project) : isDoneStatus(project, previous.status) || !previous.status ? firstOpenStatus(project) : previous.status, completedAt: doc.completed ? previous.completedAt || Date.now() : undefined } : { color: "laut", ...previous, projectId: project.id, ...doc };
          const saved = await api.save(localId, kind, data); raw.set(localId, saved);
        },
        async saveRemote(remoteId, localId, doc, etag): Promise<ExternalEntry> {
          // Verify local content has not changed while remote pages were loading.
          const now = (await api.changedSince(0)).find(r => r.id === localId);
          if (now && fingerprint(normalize(now)) !== fingerprint(doc)) throw new Error("Item lokal berubah. Sinkronkan kembali.");
          return client.save(remoteId, localId, doc, etag);
        },
        checkpoint: state => api.setSetting(stateKey(cfg), JSON.stringify(state)),
      });
      await saveConnection({ ...cfg, lastSync: Date.now(), lastError: undefined });
    } catch (e) { await saveConnection({ ...cfg, lastError: errorText(e) }); throw e; }
  });
}
export function useExternalSyncLoop() {
  useEffect(() => {
    if (!isDesktop) return;
    const tick = () => { for (const p of ["google-tasks", "outlook"] as const) if (!running.has(p)) void runExternal(p).catch(() => {}); };
    const start = window.setTimeout(tick, 15000), timer = window.setInterval(tick, 600000);
    const stop = onEvent<string>("setting-changed", k => { if (k === "external_sync_requested") tick(); });
    window.addEventListener("online", tick);
    return () => { clearTimeout(start); clearInterval(timer); stop(); window.removeEventListener("online", tick); };
  }, []);
}
