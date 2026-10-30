import { it, expect } from "vitest";
import { fingerprint, reconcile, type Doc, type ExternalEntry, type SyncDeps, type SyncState } from "./reconcile";
import { outlookDoc, taskDoc } from "./provider";

const doc = (title: string): Doc => ({ title, completed: false });
function fixture(local: ExternalEntry[], remote: ExternalEntry[]) {
  let saved: SyncState = { links: [], conflicts: [] }; let writes = 0;
  const deps: SyncDeps = {
    locals: async () => local, remotes: async () => remote,
    getRemote: async id => remote.find(r => r.id === id) || { id, doc: null },
    newId: id => `import-${id}`,
    async saveLocal(id, value) { const r = local.find(r => r.id === id); if (r) r.doc = value; else local.push({ id, doc: value }); },
    async saveRemote(id, localId, value) { writes++; const r = remote.find(r => r.id === id); if (r) { r.doc = value; return r; } const next = { id: id || `new-${localId}`, localId, doc: value }; remote.push(next); return next; },
    checkpoint: async state => { saved = structuredClone(state); },
  };
  return { deps, local, remote, writes: () => writes, state: () => saved };
}
const base = (): SyncState => ({ links: [{ localId: "l", remoteId: "r", local: fingerprint(doc("old")), remote: fingerprint(doc("old")) }], conflicts: [] });
it("detects both-side conflicts without overwriting and resolves explicit choices", async () => {
  const f = fixture([{ id: "l", doc: doc("local") }], [{ id: "r", doc: doc("remote") }]);
  const state = await reconcile(base(), f.deps);
  expect(state.conflicts).toHaveLength(1); expect(f.writes()).toBe(0);
  await reconcile({ ...state, choices: { l: "local" } }, f.deps);
  expect(f.remote[0].doc).toEqual(doc("local")); expect(f.state().conflicts).toEqual([]);
});
it("propagates deletion only for known linked tombstones, and conflicts with edits", async () => {
  const f = fixture([{ id: "l", doc: null }], [{ id: "r", doc: doc("old") }]);
  await reconcile(base(), f.deps); expect(f.remote[0].doc).toBeNull();
  const g = fixture([{ id: "l", doc: doc("changed") }], []);
  expect((await reconcile(base(), g.deps)).conflicts).toHaveLength(1);
  const moved = fixture([], [{ id: "r", doc: doc("old") }]);
  await reconcile(base(), moved.deps); expect(moved.writes()).toBe(0);
});
it("recovers response loss from stable remote marker without creating duplicates", async () => {
  const f = fixture([{ id: "l", doc: doc("new") }], [{ id: "r", localId: "l", doc: doc("new") }]);
  const state = await reconcile({ links: [], conflicts: [] }, f.deps);
  await reconcile(state, f.deps); expect(f.writes()).toBe(0); expect(state.links).toHaveLength(1);
});
it("keeps checkpoints when a later mutation fails", async () => {
  const f = fixture([{ id: "a", doc: doc("a") }, { id: "b", doc: doc("b") }], []);
  const save = f.deps.saveRemote; f.deps.saveRemote = async (...args) => { if (args[1] === "b") throw Error("offline"); return save(...args); };
  await expect(reconcile({ links: [], conflicts: [] }, f.deps)).rejects.toThrow("offline");
  expect(f.state().links[0].localId).toBe("a");
});
it("preserves task date and strips only the trailing app marker", () => {
  expect(taskDoc({ title: "Task", due: "2026-10-30T00:00:00.000Z", notes: "note\n[Ruangku:abc]", status: "completed" })).toEqual({ title: "Task", due: "2026-10-30", notes: "note", completed: true });
  expect(taskDoc({ deleted: true })).toBeNull();
  expect(() => outlookDoc({ isAllDay: true })).toThrow();
});
