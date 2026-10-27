import { describe, expect, it } from "vitest";
import type { RawRecord } from "../lib/types";
import { Local, PbRecord, Remote, syncWorkspace } from "./teamSync";

/** Server tiruan dengan aturan peran sederhana (mirip API rules PocketBase). */
class FakeServer {
  recs: PbRecord[] = [];
  seq = 0;
  clock = 1000;
  roles: Record<string, string> = {};
  remote(user: string, email: string): Remote {
    const lv = () => ({ pemilik: 5, admin: 4, editor: 3, kontributor: 2, pembaca: 1 }[this.roles[user]] ?? 0);
    const stamp = () => `2026-10-26 10:00:${String(this.clock++).padStart(4, "0")}Z`;
    return {
      workspaces: async () => [{ id: "W1", name: "Tim", owner: "u1" }],
      members: async () => [],
      find: async (ws, rids) => this.recs.filter((r) => r.workspace === ws && rids.includes(r.rid)),
      since: async (ws, cur) => this.recs.filter((r) => r.workspace === ws && r.updated > cur).sort((a, b) => a.updated.localeCompare(b.updated)),
      create: async (b) => {
        if (lv() < 2) throw Object.assign(new Error("Failed to create"), { status: 400 });
        const r = { ...b, id: `r${++this.seq}`, updated: stamp() } as PbRecord;
        this.recs.push(r);
        return r;
      },
      update: async (id, b) => {
        const r = this.recs.find((x) => x.id === id)!;
        const assigned = (r.data?.assignees ?? []).includes(email);
        const ok = lv() >= 3 || (lv() === 2 && (r.author === user || (assigned && !b.deleted)));
        if (!ok) throw Object.assign(new Error("not found"), { status: 404 });
        Object.assign(r, b, { updated: stamp() });
        return r;
      },
    };
  }
}

class FakeLocal implements Local {
  rows: RawRecord[] = [];
  settings: Record<string, string> = {};
  t = 1;
  put(id: string, kind: string, data: any) {
    const prev = this.rows.find((r) => r.id === id);
    const rec = { id, kind, data, updatedAt: ++this.t * 1000, deleted: false };
    if (prev) Object.assign(prev, rec);
    else this.rows.push(rec);
  }
  del(id: string) {
    Object.assign(this.rows.find((r) => r.id === id)!, { deleted: true, data: null, updatedAt: ++this.t * 1000 });
  }
  get = (id: string) => this.rows.find((r) => r.id === id);
  changedSince = async (s: number) => this.rows.filter((r) => r.updatedAt > s);
  list = async (k: string) => this.rows.filter((r) => r.kind === k && !r.deleted);
  importRecords = async (rs: RawRecord[]) => {
    let n = 0;
    for (const r of rs) {
      const l = this.get(r.id);
      if (!l || r.updatedAt > l.updatedAt) {
        if (l) Object.assign(l, r);
        else this.rows.push({ ...r });
        n++;
      }
    }
    return n;
  };
  force = async (rs: RawRecord[]) => {
    for (const r of rs) {
      const l = this.get(r.id);
      if (l) Object.assign(l, r);
      else this.rows.push({ ...r });
    }
    return rs.length;
  };
  getSetting = async (k: string) => this.settings[k] ?? null;
  setSetting = async (k: string, v: string) => void (this.settings[k] = v);
}

describe("sinkron proyek tim", () => {
  it("hanya proyek yang dibagikan yang terkirim, lalu sampai ke anggota lain", async () => {
    const srv = new FakeServer();
    srv.roles = { u1: "pemilik", u2: "kontributor" };
    const a = new FakeLocal();
    a.t = 10;
    a.put("pj-jitu", "project", { name: "Jitu", workspaceId: "ws-W1" });
    a.put("pj-jitu-dev", "project", { name: "Dev", parentId: "pj-jitu" });
    a.put("pj-pribadi", "project", { name: "Pribadi" });
    a.put("t1", "task", { title: "Onboarding", projectId: "pj-jitu-dev", assignees: ["pbm-bayu"] });
    a.put("t2", "task", { title: "Rahasia", projectId: "pj-pribadi" });
    a.put("t3", "task", { title: "Untuk Bayu", projectId: "pj-jitu", assignees: ["bayu@x.id"] });
    a.put("ibd", "ibadahlog", { date: "2026-10-26" });
    const r1 = await syncWorkspace(srv.remote("u1", "me@x.id"), a, "W1", { userId: "u1" });
    expect(r1.pushed).toBe(4);
    expect(srv.recs.map((r) => r.rid).sort()).toEqual(["pj-jitu", "pj-jitu-dev", "t1", "t3"]);

    const b = new FakeLocal();
    const r2 = await syncWorkspace(srv.remote("u2", "bayu@x.id"), b, "W1", { userId: "u2" });
    expect(r2.pulled).toBe(4);
    expect(b.get("t1")!.data.title).toBe("Onboarding");

    // Kontributor menyelesaikan tugas yang ditugaskan kepadanya: diterima.
    b.t = 100;
    b.put("t3", "task", { ...b.get("t3")!.data, status: "done" });
    // Kontributor mengubah tugas orang lain: ditolak dan dikembalikan.
    b.put("t1", "task", { ...b.get("t1")!.data, title: "Diubah diam-diam" });
    const r3 = await syncWorkspace(srv.remote("u2", "bayu@x.id"), b, "W1", { userId: "u2" });
    expect(r3.pushed).toBe(1);
    expect(r3.rejected).toEqual(["task Diubah diam-diam"]);
    expect(b.get("t1")!.data.title).toBe("Onboarding");

    // Pemilik menerima perubahan status dari kontributor.
    await syncWorkspace(srv.remote("u1", "me@x.id"), a, "W1", { userId: "u1" });
    expect(a.get("t3")!.data.status).toBe("done");

    // Hapus oleh pemilik menyebar sebagai tombstone.
    a.t = 300;
    a.del("t1");
    await syncWorkspace(srv.remote("u1", "me@x.id"), a, "W1", { userId: "u1" });
    await syncWorkspace(srv.remote("u2", "bayu@x.id"), b, "W1", { userId: "u2" });
    expect(b.get("t1")!.deleted).toBe(true);
  });

  it("pembaca tidak bisa membuat data; proyek baru dibagikan mengirim isi lamanya", async () => {
    const srv = new FakeServer();
    srv.roles = { u1: "pemilik", u3: "pembaca" };
    const c = new FakeLocal();
    c.t = 10;
    c.put("pj-x", "project", { name: "X", workspaceId: "ws-W1" });
    await syncWorkspace(srv.remote("u3", "c@x.id"), c, "W1", { userId: "u3" });
    expect(c.get("pj-x")!.deleted).toBe(true);

    const a = new FakeLocal();
    a.t = 10;
    a.put("pj-r", "project", { name: "Riset" });
    a.put("n1", "note", { title: "Kerangka", projectId: "pj-r" });
    a.put("n2", "note", { title: "Bab 1", parentId: "n1" });
    a.put("o1", "objective", { title: "Proposal", projectId: "pj-r" });
    a.put("k1", "keyresult", { title: "Paper", objectiveId: "o1" });
    await syncWorkspace(srv.remote("u1", "me@x.id"), a, "W1", { userId: "u1" });
    expect(srv.recs.length).toBe(0);
    a.put("pj-r", "project", { name: "Riset", workspaceId: "ws-W1" });
    await syncWorkspace(srv.remote("u1", "me@x.id"), a, "W1", { userId: "u1" });
    expect(srv.recs.map((r) => r.rid).sort()).toEqual(["k1", "n1", "n2", "o1", "pj-r"]);
  });
});
