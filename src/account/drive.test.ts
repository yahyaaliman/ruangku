import { describe, it, expect, vi } from "vitest";
import { DRIVE_SCOPE, DriveClient, loginAccount, parseSnapshot, portableRecord, portableSetting, syncAccount } from "./drive";
import type { RawRecord } from "../lib/types";
import type { LoginDeps } from "../calendar/gcal";

const record = (id: string, deleted = false): RawRecord => ({ id, kind: "note", data: deleted ? null : { title: id }, updatedAt: 10, deleted });
describe("personal Google sync", () => {
  it("never publishes credentials or subscription URLs as preferences", () => {
    for (const key of ["secret:token", "google_account", "gcal_config", "device_id", "sync_folder", "ai_config", "layout_secret"]) expect(portableSetting(key)).toBe(false);
    expect(portableSetting("calendar_size")).toBe(true);
    expect(portableSetting("layout_kuliah")).toBe(true);
    expect(portableRecord({ ...record("x"), kind: "workspace" })).toBe(false);
    expect(portableRecord({ ...record("x"), kind: "calsub" })).toBe(false);
    expect(portableRecord({ ...record("account-pref:theme"), kind: "account_preference", data: { key: "device_id", value: "bad" } })).toBe(false);
  });
  it("rejects invalid or future formats before import", () => {
    expect(() => parseSnapshot('{"format":2,"deviceId":"a","records":[]}')).toThrow();
    expect(() => parseSnapshot(JSON.stringify({ format: 1, deviceId: "a", records: [{ ...record("x"), updatedAt: "bad" }] }))).toThrow();
    expect(parseSnapshot(JSON.stringify({ format: 1, deviceId: "a", records: [record("gone", true)] })).records[0].deleted).toBe(true);
  });
  it("pulls both devices before uploading merged records, preserving deletions", async () => {
    const local: RawRecord[] = [record("local")];
    const client = {
      files: vi.fn(async () => [{ id: "1", name: "ruangku-device-A.json" }, { id: "2", name: "ruangku-device-B.json" }]),
      read: vi.fn(async (id: string) => ({ format: 1 as const, deviceId: id, records: [record(id, id === "2")] })),
      write: vi.fn(async () => {}),
    };
    await syncAccount(client, "A", { merge: async r => { local.push(...r); }, export: async () => local });
    expect(client.write).toHaveBeenCalledWith("1", { format: 1, deviceId: "A", records: [record("local"), record("1"), record("2", true)] });
  });
  it("does not import or overwrite snapshots when a download fails", async () => {
    const merge = vi.fn(), write = vi.fn();
    const client = { files: async () => [{ id: "1", name: "ruangku-device-A.json" }], read: async () => { throw Error("offline"); }, write };
    await expect(syncAccount(client, "B", { merge, export: async () => [] })).rejects.toThrow("offline");
    expect(merge).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it("follows Drive pagination and refreshes expired access tokens", async () => {
    let tokenCalls = 0, listCalls = 0;
    const http = vi.fn(async (req: { url: string }) => {
      if (req.url.includes("oauth2.googleapis")) return { status: 200, body: JSON.stringify({ access_token: `token${++tokenCalls}` }) };
      listCalls++;
      if (listCalls === 1) return { status: 401, body: "{}" };
      if (listCalls === 2) return { status: 200, body: JSON.stringify({ nextPageToken: "next", files: [{ id: "a", name: "ruangku-device-A.json" }] }) };
      expect(req.url).toContain("pageToken=next");
      return { status: 200, body: JSON.stringify({ files: [{ id: "b", name: "ruangku-device-B.json" }] }) };
    });
    const client = new DriveClient({ clientId: "client", connected: true }, http, { get: async () => "secret", set: async () => {} });
    expect(await client.files()).toHaveLength(2); expect(tokenCalls).toBe(2);
  });
});

function loginDeps(subject = "alice", scope = DRIVE_SCOPE) {
  const set = vi.fn(async () => {});
  const deps: LoginDeps = {
    secrets: { get: async () => null, set },
    loopback: async url => ({ code: "code", state: new URL(url).searchParams.get("state"), redirectUri: "http://127.0.0.1:1234" }),
    http: vi.fn(async req => req.url.includes("userinfo") ? { status: 200, body: JSON.stringify({ sub: subject, email: `${subject}@example.com`, email_verified: true }) } : { status: 200, body: JSON.stringify({ access_token: "access", refresh_token: "refresh", scope }) }),
  };
  return { deps, set };
}
describe("Google account login", () => {
  it("uses PKCE, requests only identity and app-data access and stores separate credentials", async () => {
    const { deps, set } = loginDeps();
    const original = deps.loopback;
    deps.loopback = async url => {
      const params = new URL(url).searchParams;
      expect(params.get("code_challenge_method")).toBe("S256");
      expect(params.get("scope")).toBe(`openid email ${DRIVE_SCOPE}`);
      return original(url);
    };
    expect((await loginAccount("client", "secret", null, deps)).subject).toBe("alice");
    expect(set).toHaveBeenCalledWith("account_google_refresh", "refresh");
  });
  it("rejects a wrong OAuth state before exchanging credentials", async () => {
    const { deps, set } = loginDeps();
    deps.loopback = async () => ({ code: "code", state: "wrong", redirectUri: "http://127.0.0.1:1234" });
    await expect(loginAccount("c", "s", null, deps)).rejects.toThrow("tidak valid");
    expect(deps.http).not.toHaveBeenCalled(); expect(set).not.toHaveBeenCalled();
  });
  it("does not replace credentials when a different Google account signs in", async () => {
    const { deps, set } = loginDeps("bob");
    await expect(loginAccount("c", "s", { connected: false, clientId: "c", subject: "alice", email: "alice@example.com" }, deps)).rejects.toThrow("tidak tercampur");
    expect(set).not.toHaveBeenCalled();
  });
  it("requires Drive permission even if Google identity was granted", async () => {
    const { deps, set } = loginDeps("alice", "openid email");
    await expect(loginAccount("c", "s", null, deps)).rejects.toThrow("diperlukan");
    expect(set).not.toHaveBeenCalled();
  });
});
