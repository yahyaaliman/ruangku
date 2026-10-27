import { describe, expect, it } from "vitest";
import type { HttpReq, HttpRes } from "../lib/api";
import type { Item, TimeBlock } from "../lib/types";
import { blockIdOf, connectGoogle, eventIdOf, GcalClient, isoLocal, slotOf, syncGoogle, type GcalConfig, type SyncState } from "./gcal";

/** Server Google tiruan: token, daftar kalender, dan acara. */
class FakeGoogle {
  events = new Map<string, Map<string, any>>([
    ["primary", new Map()],
    ["kantor", new Map()],
  ]);
  tokens = 0;
  calls: string[] = [];
  revoked = false;
  clock = Date.parse("2026-10-26T00:00:00Z");

  http = async (r: HttpReq): Promise<HttpRes> => {
    const u = new URL(r.url);
    this.calls.push(`${r.method} ${u.pathname}`);
    if (u.pathname === "/token") {
      const p = new URLSearchParams(r.body);
      if (this.revoked) return { status: 400, body: JSON.stringify({ error: "invalid_grant" }) };
      this.tokens++;
      if (p.get("grant_type") === "authorization_code") {
        expect(p.get("code_verifier")).toBeTruthy();
        expect(p.get("redirect_uri")).toBe("http://127.0.0.1:5555");
        const idt = ["x", btoa(JSON.stringify({ email: "saya@example.com" })), "y"].join(".");
        return { status: 200, body: JSON.stringify({ access_token: "at1", refresh_token: "rt1", expires_in: 3600, id_token: idt }) };
      }
      return { status: 200, body: JSON.stringify({ access_token: `at${this.tokens}`, expires_in: 3600 }) };
    }
    if (!r.headers?.authorization?.startsWith("Bearer at")) return { status: 401, body: "{}" };
    if (u.pathname === "/cal/users/me/calendarList") return { status: 200, body: JSON.stringify({ items: [{ id: "primary", summary: "Saya", primary: true, accessRole: "owner" }, { id: "kantor", summary: "Kantor", accessRole: "reader" }] }) };
    const m = /^\/cal\/calendars\/([^/]+)\/events(?:\/([^/]+))?$/.exec(u.pathname);
    if (!m) return { status: 404, body: "{}" };
    const cal = this.events.get(decodeURIComponent(m[1]))!;
    const id = m[2];
    const now = new Date((this.clock += 1000)).toISOString();
    if (r.method === "GET") {
      const showDeleted = u.searchParams.get("showDeleted") === "true";
      return { status: 200, body: JSON.stringify({ items: [...cal.values()].filter((e) => showDeleted || e.status !== "cancelled") }) };
    }
    if (r.method === "POST") {
      const body = JSON.parse(r.body!);
      if (cal.has(body.id)) return { status: 409, body: "{}" };
      cal.set(body.id, { ...body, updated: now });
      return { status: 200, body: JSON.stringify(cal.get(body.id)) };
    }
    if (r.method === "PUT") {
      if (!cal.has(id!)) return { status: 404, body: "{}" };
      cal.set(id!, { ...JSON.parse(r.body!), id, updated: now });
      return { status: 200, body: "{}" };
    }
    if (r.method === "DELETE") {
      if (!cal.has(id!)) return { status: 410, body: "{}" };
      cal.get(id!).status = "cancelled";
      return { status: 204, body: "" };
    }
    return { status: 405, body: "{}" };
  };
}

const store = () => {
  const m = new Map<string, string>();
  return { m, get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: string) => void m.set(k, v) };
};

const cfg: GcalConfig = { clientId: "cid", connected: true, targetId: "primary", authBase: "https://g.test/auth", tokenUrl: "https://g.test/token", apiBase: "https://g.test/cal" };

const block = (id: string, extra: Partial<TimeBlock> = {}): Item<TimeBlock> => ({ id, updatedAt: Date.parse("2026-10-25T00:00:00Z"), date: "2026-10-27", start: 540, end: 600, title: `Blok ${id}`, color: "nila", ...extra });

function harness(g: FakeGoogle, initial: Item<TimeBlock>[]) {
  const secrets = store();
  secrets.m.set("gcal_refresh_token", "rt1");
  const client = new GcalClient(cfg, g.http, secrets);
  const blocks = new Map(initial.map((b) => [b.id, b]));
  const caches = new Map<string, unknown[]>();
  const state: SyncState = { pushed: {} };
  const run = () =>
    syncGoogle(cfg, state, {
      client,
      blocks: [...blocks.values()],
      saveBlock: async (b) => void blocks.set(b.id, { ...(b as Item<TimeBlock>), updatedAt: Date.now() }),
      removeBlock: async (id) => void blocks.delete(id),
      shown: [{ subId: "sub-kantor", calId: "kantor" }],
      writeCache: async (id, ev) => void caches.set(id, ev),
      today: "2026-10-26",
    });
  return { blocks, caches, state, run };
}

describe("gcal util", () => {
  it("id acara bolak-balik", () => {
    const id = eventIdOf("b-xyz_09");
    expect(id).toMatch(/^rk[0-9a-f]+$/);
    expect(blockIdOf(id)).toBe("b-xyz_09");
    expect(blockIdOf("abc")).toBeNull();
  });
  it("isoLocal & slotOf saling balik", () => {
    const iso = isoLocal("2026-10-27", 570);
    expect(slotOf({ id: "x", summary: "A", start: { dateTime: iso }, end: { dateTime: isoLocal("2026-10-27", 630) } })).toEqual({ date: "2026-10-27", start: 570, end: 630, title: "A" });
  });
});

describe("connectGoogle", () => {
  it("PKCE + loopback + simpan refresh token", async () => {
    const g = new FakeGoogle();
    const secrets = store();
    let authUrl = "";
    const out = await connectGoogle({ ...cfg, connected: false }, "rahasia", {
      http: g.http,
      secrets,
      loopback: async (url) => {
        authUrl = url;
        const state = new URL(url).searchParams.get("state");
        return { code: "4/abc", state, redirectUri: "http://127.0.0.1:5555" };
      },
    });
    const q = new URL(authUrl).searchParams;
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("scope")).toContain("calendar.events");
    expect(out).toMatchObject({ connected: true, email: "saya@example.com" });
    expect(secrets.m.get("gcal_refresh_token")).toBe("rt1");
    expect(secrets.m.get("gcal_client_secret")).toBe("rahasia");
  });

  it("menolak state yang tidak cocok", async () => {
    const g = new FakeGoogle();
    await expect(connectGoogle(cfg, "s", { http: g.http, secrets: store(), loopback: async () => ({ code: "x", state: "lain", redirectUri: "http://127.0.0.1:5555" }) })).rejects.toThrow(/tidak valid/);
  });
});

describe("syncGoogle", () => {
  it("kirim blok, baca kalender lain, lalu tidak mengirim ulang bila tidak berubah", async () => {
    const g = new FakeGoogle();
    g.events.get("kantor")!.set("k1", { id: "k1", summary: "Rapat dosen", start: { dateTime: isoLocal("2026-10-28", 600) }, end: { dateTime: isoLocal("2026-10-28", 660) } });
    g.events.get("kantor")!.set("k2", { id: "k2", summary: "Libur kantor", start: { date: "2026-10-30" }, end: { date: "2026-11-01" } });
    const h = harness(g, [block("a"), block("lama", { date: "2026-01-01" }), block("t", { tracked: true })]);
    const r1 = await h.run();
    expect(r1).toMatchObject({ pushed: 1, pulled: 2 });
    const ev = g.events.get("primary")!.get(eventIdOf("a"));
    expect(ev.summary).toBe("Blok a");
    expect(ev.extendedProperties.private.ruangku).toBe("1");
    expect(h.caches.get("sub-kantor")).toEqual([
      expect.objectContaining({ title: "Rapat dosen", date: "2026-10-28", start: 600 }),
      expect.objectContaining({ title: "Libur kantor", date: "2026-10-30", endDate: "2026-10-31", allDay: true }),
    ]);
    const r2 = await h.run();
    expect(r2.pushed).toBe(0);
  });

  it("perubahan jam di Google kembali ke blok; perubahan lokal terkirim", async () => {
    const g = new FakeGoogle();
    const h = harness(g, [block("a"), block("b")]);
    await h.run();
    // Diubah di Google
    const ea = g.events.get("primary")!.get(eventIdOf("a"));
    Object.assign(ea, { summary: "Blok a (geser)", start: { dateTime: isoLocal("2026-10-27", 780) }, end: { dateTime: isoLocal("2026-10-27", 840) }, updated: "2026-10-26T10:00:00Z" });
    // Diubah lokal
    h.blocks.set("b", { ...h.blocks.get("b")!, start: 600, end: 690, updatedAt: Date.now() });
    const r = await h.run();
    expect(r).toMatchObject({ updatedLocal: 1, pushed: 1 });
    expect(h.blocks.get("a")).toMatchObject({ start: 780, end: 840, title: "Blok a (geser)" });
    expect(slotOf(g.events.get("primary")!.get(eventIdOf("b")))).toMatchObject({ start: 600, end: 690 });
    // Stabil setelahnya
    expect((await h.run()).pushed).toBe(0);
  });

  it("hapus dua arah", async () => {
    const g = new FakeGoogle();
    const h = harness(g, [block("a"), block("b")]);
    await h.run();
    g.events.get("primary")!.get(eventIdOf("a")).status = "cancelled"; // dihapus di Google
    h.blocks.delete("b"); // dihapus di Ruangku
    const r = await h.run();
    expect(r).toMatchObject({ removedLocal: 1, removedRemote: 1 });
    expect(h.blocks.has("a")).toBe(false);
    expect(g.events.get("primary")!.get(eventIdOf("b")).status).toBe("cancelled");
    expect(h.state.pushed).toEqual({});
  });

  it("blok yang diubah lokal setelah dihapus di Google dikirim ulang", async () => {
    const g = new FakeGoogle();
    const h = harness(g, [block("a")]);
    await h.run();
    g.events.get("primary")!.get(eventIdOf("a")).status = "cancelled";
    h.blocks.set("a", { ...h.blocks.get("a")!, title: "Masih perlu", updatedAt: Date.now() });
    await h.run();
    expect(h.blocks.has("a")).toBe(true);
    expect(g.events.get("primary")!.get(eventIdOf("a"))).toMatchObject({ status: "confirmed", summary: "Masih perlu" });
  });

  it("token diperbarui saat 401 dan galat jelas saat izin dicabut", async () => {
    const g = new FakeGoogle();
    const h = harness(g, [block("a")]);
    await h.run();
    expect(g.tokens).toBe(1);
    g.revoked = true;
    const secrets = store();
    secrets.m.set("gcal_refresh_token", "rt1");
    const c = new GcalClient(cfg, g.http, secrets);
    await expect(c.calendars()).rejects.toThrow(/Hubungkan ulang/);
  });
});
