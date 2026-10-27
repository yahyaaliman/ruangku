// Server MCP Ruangku: membuka alat asisten (tugas, jadwal, rapat, kuliah, keuangan, catatan)
// ke Claude Desktop, Claude Code, ChatGPT, dan klien MCP lain.
// Dual-era: revisi modern 2026-07-28 (tanpa handshake, _meta per permintaan, server/discover)
// sekaligus klien lama yang memakai `initialize` (2025-11-25 ke bawah).
// Transport (HTTP lokal & jembatan stdio) ada di Rust: src-tauri/src/mcp.rs.
import { useEffect, useState } from "react";
import { api, onEvent, isDesktop, type McpStatus } from "../lib/api";
import { TOOLS, runTool, type ToolCtx } from "./tools";
import { load } from "../lib/taskOps";
import type { Member } from "../lib/team";
import { useJsonSetting } from "../lib/useSetting";

export const MODERN = "2026-07-28";
export const LEGACY = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];
export const SUPPORTED = [MODERN, ...LEGACY];
const SERVER_INFO = { name: "ruangku", title: "Ruangku", version: "0.4.1" };
const META_PV = "io.modelcontextprotocol/protocolVersion";

export interface McpConfig {
  enabled: boolean;
  port: number;
  token: string;
  /** Izinkan alat tambah/ubah (hapus tidak pernah dibuka lewat MCP). */
  allowWrite: boolean;
}
export const MCP_KEY = "mcp_config";
export const DEFAULT_MCP: McpConfig = { enabled: false, port: 47821, token: "", allowWrite: true };

export const INSTRUCTIONS = [
  "Ruangku adalah aplikasi produktivitas pribadi pengguna (Bahasa Indonesia): proyek & subproyek, tugas, jadwal harian, kalender, rapat, kuliah, keuangan (buku kas, akun, anggaran, tagihan rutin), catatan, KPI, dan OKR.",
  "Mulai dengan ringkasan_hari atau daftar_proyek untuk konteks. Ambil id dari hasil alat; jangan mengarang id.",
  "Tanggal memakai format YYYY-MM-DD dan jam HH:MM waktu lokal pengguna. Jumlah uang dalam rupiah.",
  "Penghapusan tidak tersedia lewat MCP; minta pengguna menghapus dari aplikasi.",
].join(" ");

export function newToken(): string {
  const a = new Uint8Array(24);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

type Json = Record<string, unknown>;
export interface McpHttpIn {
  body: string;
  protocolVersion?: string | null;
  method?: string | null;
  name?: string | null;
}
export interface McpHttpOut {
  status: number;
  body: string;
}

const ok = (id: unknown, result: Json, status = 200): McpHttpOut => ({ status, body: JSON.stringify({ jsonrpc: "2.0", id, result }) });
const fail = (id: unknown, code: number, message: string, status = 200, data?: unknown): McpHttpOut => ({ status, body: JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data !== undefined ? { data } : {}) } }) });

/** Daftar alat MCP dari alat asisten (urutan tetap). */
export function mcpTools(cfg: Pick<McpConfig, "allowWrite">) {
  return TOOLS.filter((t) => t.access === "read" || (cfg.allowWrite && t.access !== "delete")).map((t) => ({
    name: t.name,
    title: t.name.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
    description: t.description,
    inputSchema: t.input_schema,
    annotations: { readOnlyHint: t.access === "read", destructiveHint: false, idempotentHint: t.access === "read", openWorldHint: false },
  }));
}

function decodeHeader(v: string): string {
  const m = /^=\?base64\?(.*)\?=$/.exec(v);
  if (!m) return v;
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0)));
  } catch {
    return "\u0000";
  }
}

export interface McpDeps {
  cfg: McpConfig;
  ctx: () => Promise<ToolCtx>;
  /** Catat aktivitas (untuk ditampilkan di Pengaturan). */
  log?: (e: { at: number; method: string; tool?: string; ok: boolean; client?: string }) => void;
}

/** Proses satu pesan JSON-RPC dari transport HTTP (jembatan stdio memakai jalur yang sama). */
export async function handleMcp(input: McpHttpIn, deps: McpDeps): Promise<McpHttpOut> {
  let msg: Json;
  try {
    msg = JSON.parse(input.body);
  } catch {
    return fail(null, -32700, "Parse error: JSON tidak valid", 400);
  }
  if (Array.isArray(msg)) return fail(null, -32600, "Batch JSON-RPC tidak didukung", 400);
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail((msg as Json)?.id, -32600, "Invalid Request", 400);
  const id = msg.id;
  const isNotification = id === undefined;
  const method = msg.method as string;
  const params = (msg.params && typeof msg.params === "object" ? msg.params : {}) as Json;
  const meta = (params._meta && typeof params._meta === "object" ? params._meta : {}) as Json;
  const pv = typeof meta[META_PV] === "string" ? (meta[META_PV] as string) : undefined;
  const clientInfo = (meta["io.modelcontextprotocol/clientInfo"] ?? undefined) as { name?: string } | undefined;

  // ----- Era modern: versi di _meta setiap permintaan -----
  if (pv) {
    if (input.protocolVersion !== pv) return fail(id, -32020, `Header mismatch: MCP-Protocol-Version '${input.protocolVersion ?? "(kosong)"}' tidak sama dengan _meta '${pv}'`, 400);
    if (input.method !== method) return fail(id, -32020, `Header mismatch: Mcp-Method '${input.method ?? "(kosong)"}' tidak sama dengan method '${method}'`, 400);
    if (["tools/call", "resources/read", "prompts/get"].includes(method)) {
      const bodyName = String(params.name ?? params.uri ?? "");
      if (!input.name || decodeHeader(input.name) !== bodyName) return fail(id, -32020, `Header mismatch: Mcp-Name tidak sama dengan '${bodyName}'`, 400);
    }
    // Versi lama hanya dilayani lewat handshake initialize, bukan lewat _meta.
    if (pv !== MODERN) return fail(id, -32022, "Unsupported protocol version", 400, { supported: [MODERN], requested: pv });
    if (isNotification) return { status: 202, body: "" };
    const withMeta = (r: Json): Json => ({ resultType: "complete", ...r, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } });
    switch (method) {
      case "server/discover":
        return ok(id, withMeta({ supportedVersions: [MODERN], capabilities: { tools: {} }, instructions: INSTRUCTIONS, ttlMs: 300000, cacheScope: "private" }));
      case "tools/list":
        return ok(id, withMeta({ tools: mcpTools(deps.cfg), ttlMs: 300000, cacheScope: "private" }));
      case "tools/call":
        return ok(id, withMeta(await callTool(params, deps, clientInfo?.name)));
      default:
        return fail(id, -32601, `Method not found: ${method}`, 404);
    }
  }

  // Header modern tanpa _meta = klien modern yang keliru.
  if (input.protocolVersion === MODERN) return fail(id, -32020, "Header mismatch: _meta io.modelcontextprotocol/protocolVersion wajib ada", 400);

  // ----- Era lama: handshake initialize -----
  if (isNotification) return { status: 202, body: "" };
  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : LEGACY[0];
      const v = LEGACY.includes(asked) ? asked : LEGACY[0];
      return ok(id, { protocolVersion: v, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: mcpTools(deps.cfg) });
    case "tools/call":
      return ok(id, await callTool(params, deps, (params.clientInfo as { name?: string } | undefined)?.name));
    case "server/discover":
      return ok(id, { resultType: "complete", supportedVersions: [MODERN], capabilities: { tools: {} }, instructions: INSTRUCTIONS, _meta: { "io.modelcontextprotocol/serverInfo": SERVER_INFO } });
    default:
      return fail(id, -32601, `Method not found: ${method}`);
  }
}

async function callTool(params: Json, deps: McpDeps, client?: string): Promise<Json> {
  const name = String(params.name ?? "");
  const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
  const allowed = mcpTools(deps.cfg).some((t) => t.name === name);
  if (!allowed) {
    deps.log?.({ at: Date.now(), method: "tools/call", tool: name, ok: false, client });
    const exists = TOOLS.some((t) => t.name === name);
    return { content: [{ type: "text", text: exists ? `Alat "${name}" tidak diizinkan lewat MCP. ${TOOLS.find((t) => t.name === name)?.access === "delete" ? "Penghapusan hanya dari aplikasi Ruangku." : "Aktifkan 'Izinkan tambah & ubah' di Pengaturan › Connector."}` : `Alat "${name}" tidak dikenal.` }], isError: true };
  }
  const out = await runTool(name, args, await deps.ctx(), false);
  deps.log?.({ at: Date.now(), method: "tools/call", tool: name, ok: !out.is_error, client });
  return { content: [{ type: "text", text: out.content }], isError: !!out.is_error };
}

// ---------- Hook di jendela utama ----------

export interface McpLogEntry {
  at: number;
  method: string;
  tool?: string;
  ok: boolean;
  client?: string;
}
const logBuf: McpLogEntry[] = [];
const logListeners = new Set<() => void>();
export function useMcpLog(): McpLogEntry[] {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    logListeners.add(f);
    return () => void logListeners.delete(f);
  }, []);
  return logBuf;
}
function pushLog(e: McpLogEntry) {
  logBuf.unshift(e);
  logBuf.length = Math.min(logBuf.length, 30);
  logListeners.forEach((f) => f());
}

async function ownerCtx(): Promise<ToolCtx> {
  const members = await load<Member>("member");
  const me = members.find((m) => m.isMe && !m.workspaceId) ?? members.find((m) => m.isMe);
  return { role: "pemilik", actor: me, autoApply: true, viaBot: true };
}

/** Jalankan server MCP sesuai pengaturan dan layani permintaan (dipasang sekali di App). */
export function useMcpServer() {
  const [cfg, , loaded] = useJsonSetting<McpConfig>(MCP_KEY, DEFAULT_MCP);
  useEffect(() => {
    if (!loaded || !isDesktop) return;
    if (cfg.enabled && cfg.token) api.mcpStart(cfg.port, cfg.token).catch((e) => api.log("WARN", `MCP gagal dimulai: ${e}`));
    else api.mcpStop().catch(() => {});
  }, [loaded, cfg.enabled, cfg.port, cfg.token]);
  useEffect(
    () =>
      onEvent<{ id: number; body: string; protocolVersion?: string; method?: string; name?: string }>("mcp-request", async (r) => {
        let out: McpHttpOut;
        try {
          out = await handleMcp(r, { cfg, ctx: ownerCtx, log: pushLog });
        } catch (e) {
          out = fail(null, -32603, `Galat internal: ${e instanceof Error ? e.message : String(e)}`, 500);
        }
        await api.mcpRespond(r.id, out.status, out.body);
      }),
    [cfg],
  );
}

export function useMcpStatus() {
  const [st, setSt] = useState<McpStatus | null>(null);
  useEffect(() => {
    let alive = true;
    const f = () => api.mcpStatus().then((s) => alive && setSt(s)).catch(() => {});
    f();
    const t = window.setInterval(f, 2500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);
  return st;
}
