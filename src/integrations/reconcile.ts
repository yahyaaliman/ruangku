// Both sides retain independent baselines. Conflicts require an explicit choice;
// clocks on different devices are never used to silently pick a winner.
export type Doc = Record<string, string | number | boolean | null>;
export interface ExternalEntry { id: string; doc: Doc | null; etag?: string; localId?: string }
export interface Link { localId: string; remoteId: string; local: string; remote: string }
export interface Conflict { localId: string; remoteId: string; title: string; local: Doc | null; remote: Doc | null }
export interface SyncState { links: Link[]; conflicts: Conflict[]; choices?: Record<string, "local" | "remote"> }
export const fingerprint = (doc: Doc | null) => doc === null ? "null" : JSON.stringify(Object.entries(doc).sort(([a], [b]) => a.localeCompare(b)));
export interface SyncDeps {
  locals(): Promise<ExternalEntry[]>;
  remotes(): Promise<ExternalEntry[]>;
  getRemote(id: string): Promise<ExternalEntry>;
  saveLocal(id: string, doc: Doc | null): Promise<void>;
  saveRemote(id: string | undefined, localId: string, doc: Doc | null, etag?: string): Promise<ExternalEntry>;
  newId(remoteId: string): string;
  checkpoint(state: SyncState): Promise<void>;
}
export async function reconcile(state: SyncState, deps: SyncDeps): Promise<SyncState> {
  const local = new Map((await deps.locals()).map(r => [r.id, r]));
  const remote = new Map((await deps.remotes()).map(r => [r.id, r]));
  const links = state.links.map(l => ({ ...l }));
  // Recover a successful create whose response/checkpoint was lost.
  for (const r of remote.values()) if (r.doc && !links.some(l => l.remoteId === r.id)) {
    const localId = r.localId && local.has(r.localId) ? r.localId : deps.newId(r.id);
    if (links.some(l => l.localId === localId)) throw new Error("Ditemukan duplikat tautan sinkronisasi. Periksa item di kalender/tugas eksternal.");
    const old = local.get(localId);
    if (!old) { await deps.saveLocal(localId, r.doc); local.set(localId, { id: localId, doc: r.doc }); }
    links.push({ localId, remoteId: r.id, local: old && fingerprint(old.doc) !== fingerprint(r.doc) ? "" : fingerprint(r.doc), remote: old && fingerprint(old.doc) !== fingerprint(r.doc) ? "" : fingerprint(r.doc) });
  }
  state = { links, conflicts: [], choices: { ...state.choices } };
  for (const link of [...links]) {
    // A scoped/moved item is not a deletion. Only explicit tombstones are deletions.
    const l = local.get(link.localId);
    if (!l) continue;
    const r = remote.get(link.remoteId) ?? await deps.getRemote(link.remoteId);
    const a = fingerprint(l.doc), b = fingerprint(r.doc);
    const lc = a !== link.local, rc = b !== link.remote;
    const choice = state.choices?.[link.localId];
    if (a !== b && lc && rc && !choice) {
      state.conflicts.push({ localId: link.localId, remoteId: link.remoteId, title: String(l.doc?.title || r.doc?.title || "Item dihapus"), local: l.doc, remote: r.doc });
      continue;
    }
    if (a !== b) {
      if (choice === "local" || (lc && !rc && choice !== "remote")) {
        const result = await deps.saveRemote(r.doc === null ? undefined : r.id, l.id, l.doc, r.etag);
        link.remoteId = result.id || link.remoteId; link.remote = fingerprint(result.doc); link.local = a;
      } else { await deps.saveLocal(l.id, r.doc); link.local = b; link.remote = b; }
    } else { link.local = a; link.remote = b; }
    delete state.choices?.[link.localId];
    // Persist each successful mutation so a later HTTP failure is retryable.
    await deps.checkpoint(state);
  }
  for (const l of local.values()) if (l.doc && !links.some(link => link.localId === l.id)) {
    const r = await deps.saveRemote(undefined, l.id, l.doc);
    links.push({ localId: l.id, remoteId: r.id, local: fingerprint(l.doc), remote: fingerprint(r.doc) });
    await deps.checkpoint(state);
  }
  await deps.checkpoint(state);
  return state;
}
