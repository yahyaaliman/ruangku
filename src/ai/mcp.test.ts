// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { handleMcp, mcpTools, MODERN, type McpDeps } from "./mcp";
import { api } from "../lib/api";

const meta = { "io.modelcontextprotocol/protocolVersion": MODERN, "io.modelcontextprotocol/clientInfo": { name: "uji", version: "1" }, "io.modelcontextprotocol/clientCapabilities": {} };
const deps = (allowWrite = true): McpDeps => ({ cfg: { enabled: true, port: 47821, token: "x".repeat(32), allowWrite }, ctx: async () => ({ role: "pemilik", autoApply: true, viaBot: true }) });
const modern = (method: string, params: Record<string, unknown> = {}, id: unknown = 1, headers: { protocolVersion?: string; method?: string; name?: string } = {}) =>
  handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id, method, params: { ...params, _meta: meta } }), protocolVersion: MODERN, method, name: typeof params.name === "string" ? params.name : undefined, ...headers }, deps());

describe("server MCP", () => {
  beforeEach(() => localStorage.clear());

  it("modern: server/discover, tools/list (cache & deterministik), tools/call", async () => {
    const d = await modern("server/discover");
    expect(d.status).toBe(200);
    const dr = JSON.parse(d.body).result;
    expect(dr).toMatchObject({ resultType: "complete", supportedVersions: [MODERN], capabilities: { tools: {} } });
    expect(dr._meta["io.modelcontextprotocol/serverInfo"].name).toBe("ruangku");

    const l = JSON.parse((await modern("tools/list")).body).result;
    expect(l).toMatchObject({ resultType: "complete", ttlMs: 300000, cacheScope: "private" });
    const names = l.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("catat_kas");
    expect(names).toContain("buat_rapat");
    expect(names).not.toContain("hapus_tugas");
    expect(l.tools.find((t: { name: string }) => t.name === "saldo_kas").annotations.readOnlyHint).toBe(true);

    const c = JSON.parse((await modern("tools/call", { name: "catat_kas", arguments: { jenis: "keluar", jumlah: 25000, keterangan: "makan siang" } })).body).result;
    expect(c.resultType).toBe("complete");
    expect(c.isError).toBe(false);
    expect(c.content[0].text).toContain("Makan & minum");
    expect((await api.list("ledger")).some((r) => (r.data as { amount: number }).amount === 25000)).toBe(true);
  });

  it("modern: validasi header, versi, metode, notifikasi", async () => {
    expect((await modern("tools/list", {}, 1, { method: "tools/call" })).status).toBe(400);
    const mism = JSON.parse((await modern("tools/list", {}, 1, { protocolVersion: "2025-06-18" })).body);
    expect(mism.error.code).toBe(-32020);
    const nameBad = await modern("tools/call", { name: "saldo_kas", arguments: {} }, 1, { name: "daftar_proyek" });
    expect(JSON.parse(nameBad.body).error.code).toBe(-32020);
    const b64 = await modern("tools/call", { name: "saldo_kas", arguments: {} }, 1, { name: `=?base64?${btoa("saldo_kas")}?=` });
    expect(b64.status).toBe(200);
    const old = await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: { _meta: { ...meta, "io.modelcontextprotocol/protocolVersion": "1900-01-01" } } }), protocolVersion: "1900-01-01", method: "tools/list" }, deps());
    expect(old.status).toBe(400);
    expect(JSON.parse(old.body).error).toMatchObject({ code: -32022, data: { supported: [MODERN], requested: "1900-01-01" } });
    const nf = await modern("resources/list");
    expect(nf.status).toBe(404);
    expect(JSON.parse(nf.body).error.code).toBe(-32601);
    const note = await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/cancelled", params: { _meta: meta } }), protocolVersion: MODERN, method: "notifications/cancelled" }, deps());
    expect(note).toEqual({ status: 202, body: "" });
    expect((await handleMcp({ body: "{nope", protocolVersion: MODERN }, deps())).status).toBe(400);
  });

  it("legacy: initialize, initialized, tools/list, tools/call", async () => {
    const init = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "claude-ai", version: "0.1" } } }) }, deps())).body).result;
    expect(init).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "ruangku" } });
    const unk = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: { protocolVersion: "2099-01-01" } }) }, deps())).body).result;
    expect(unk.protocolVersion).toBe("2025-11-25");
    expect(await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), protocolVersion: "2025-06-18" }, deps())).toEqual({ status: 202, body: "" });
    const list = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }), protocolVersion: "2025-06-18" }, deps(false))).body).result;
    expect(list.tools.every((t: { annotations: { readOnlyHint: boolean } }) => t.annotations.readOnlyHint)).toBe(true);
    const denied = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "buat_tugas", arguments: { judul: "x" } } }), protocolVersion: "2025-06-18" }, deps(false))).body).result;
    expect(denied.isError).toBe(true);
    const del = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "hapus_tugas", arguments: { id: "t-1" } } }) }, deps())).body).result;
    expect(del.content[0].text).toContain("Penghapusan hanya dari aplikasi");
    const proj = JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "daftar_proyek", arguments: {} } }) }, deps())).body).result;
    expect(proj.content[0].text).toContain("Jitu");
    expect(JSON.parse((await handleMcp({ body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "ping" }) }, deps())).body).result).toEqual({});
  });

  it("alat hanya-baca saat tulis dimatikan", () => {
    expect(mcpTools({ allowWrite: false }).every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(mcpTools({ allowWrite: true }).some((t) => !t.annotations.readOnlyHint)).toBe(true);
  });
});
