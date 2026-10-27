// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAgent } from "./agent";
import { runTool } from "./tools";
import { api } from "../lib/api";
import { DEFAULT_AI } from "./config";

type Call = { url: string; body: any; headers: Record<string, string> };

function stubModel(replies: unknown[]) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: JSON.parse(init.body), headers: init.headers });
    const r = replies.shift();
    return new Response(JSON.stringify(r), { status: 200 });
  });
  return calls;
}

describe("asisten AI", () => {
  beforeEach(() => localStorage.clear());

  it("Claude: memanggil alat buat_tugas lalu menjawab", async () => {
    const calls = stubModel([
      { content: [{ type: "text", text: "Saya buatkan." }, { type: "tool_use", id: "tu1", name: "buat_tugas", input: { judul: "Siapkan slide seminar", proyek: "Riset Thesis", tenggat: "2026-10-30", prioritas: "tinggi" } }], stop_reason: "tool_use" },
      { content: [{ type: "text", text: "Tugas **Siapkan slide seminar** sudah dibuat." }], stop_reason: "end_turn" },
    ]);
    const r = await runAgent({ cfg: { ...DEFAULT_AI, apiKey: "sk-test" }, history: [], userText: "buat tugas slide", ctx: { role: "pemilik", autoApply: true } });
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0].headers["x-api-key"]).toBe("sk-test");
    expect(calls[0].headers["anthropic-version"]).toBe("2026-10-21");
    expect(calls[0].body.tools.some((t: { name: string }) => t.name === "hapus_tugas")).toBe(true);
    expect(calls[1].body.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tu1" });
    expect(r.reply).toContain("sudah dibuat");
    expect(r.actions[0].label).toContain("Siapkan slide seminar");
    const tasks = (await api.list("task")).map((x) => x.data);
    expect(tasks.find((t) => t.title === "Siapkan slide seminar")).toMatchObject({ projectId: "pj-thesis", due: "2026-10-30", priority: "tinggi" });
  });

  it("OpenAI/Ollama: format tool_calls dan role tool", async () => {
    const calls = stubModel([
      { choices: [{ message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "daftar_proyek", arguments: "{}" } }] }, finish_reason: "tool_calls" }] },
      { choices: [{ message: { content: "Ada enam proyek." }, finish_reason: "stop" }] },
    ]);
    const r = await runAgent({ cfg: { ...DEFAULT_AI, provider: "openai", baseUrl: "http://localhost:11434/v1/", model: "qwen2.5:7b" }, history: [], userText: "proyek apa saja?", ctx: { role: "pemilik", autoApply: true } });
    expect(calls[0].url).toBe("http://localhost:11434/v1/chat/completions");
    expect(calls[0].body.messages[0].role).toBe("system");
    expect(calls[0].body.tools[0].type).toBe("function");
    const tool = calls[1].body.messages.find((m: { role: string }) => m.role === "tool");
    expect(tool.tool_call_id).toBe("c1");
    expect(tool.content).toContain("Riset Thesis");
    expect(r.reply).toBe("Ada enam proyek.");
  });

  it("hapus selalu menunggu persetujuan; pembaca ditolak; bot tidak boleh hapus", async () => {
    const p = await runTool("hapus_tugas", { id: "t-x2" }, { role: "pemilik", autoApply: true });
    expect(p.pending?.kind).toBe("delete");
    expect((await api.list("task")).some((x) => x.id === "t-x2")).toBe(true);
    const ok = await runTool("hapus_tugas", { id: "t-x2" }, { role: "pemilik", autoApply: true }, true);
    expect(ok.action?.kind).toBe("delete");
    expect((await api.list("task")).some((x) => x.id === "t-x2")).toBe(false);
    const ro = await runTool("buat_tugas", { judul: "x" }, { role: "pembaca", autoApply: true });
    expect(ro.is_error).toBe(true);
    const bot = await runTool("hapus_tugas", { id: "t-x1" }, { role: "admin", autoApply: true, viaBot: true }, true);
    expect(bot.content).toContain("tidak bisa lewat chat");
  });

  it("kontributor hanya boleh mengubah tugas yang ditugaskan kepadanya", async () => {
    const members = (await api.list("member")).map((m) => ({ ...m.data, id: m.id, updatedAt: m.updatedAt }));
    const sari = members.find((m) => m.id === "m-sari");
    const own = await runTool("ubah_tugas", { id: "t-i2", status: "selesai" }, { role: "kontributor", actor: sari, autoApply: true });
    expect(own.is_error).toBeFalsy();
    const other = await runTool("ubah_tugas", { id: "t-j1", status: "selesai" }, { role: "kontributor", actor: sari, autoApply: true });
    expect(other.content).toContain("Ditolak");
  });
});

describe("asisten AI: OpenAI Responses API", () => {
  beforeEach(() => localStorage.clear());
  it("function_call → function_call_output, reasoning dibawa ke giliran berikutnya", async () => {
    const calls = stubModel([
      { status: "completed", output: [{ type: "reasoning", id: "rs_1", encrypted_content: "xyz", summary: [] }, { type: "function_call", call_id: "fc1", name: "daftar_proyek", arguments: "{}" }] },
      { status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Ada enam proyek aktif." }] }] },
    ]);
    const r = await runAgent({ cfg: { ...DEFAULT_AI, provider: "responses", baseUrl: "https://api.openai.com/v1", model: "gpt-6.1-sol", apiKey: "sk-oa" }, history: [], userText: "proyek apa saja?", ctx: { role: "pemilik", autoApply: true } });
    expect(calls[0].url).toBe("https://api.openai.com/v1/responses");
    expect(calls[0].headers.authorization).toBe("Bearer sk-oa");
    expect(calls[0].body.instructions).toContain("asisten produktivitas");
    expect(calls[0].body.store).toBe(false);
    expect(calls[0].body.tools[0]).toMatchObject({ type: "function", name: "ringkasan_hari" });
    expect(calls[0].body.input).toEqual([{ role: "user", content: "proyek apa saja?" }]);
    const input = calls[1].body.input;
    expect(input[1]).toMatchObject({ type: "reasoning", id: "rs_1", encrypted_content: "xyz" });
    expect(input[2]).toEqual({ type: "function_call", call_id: "fc1", name: "daftar_proyek", arguments: "{}" });
    expect(input[3]).toMatchObject({ type: "function_call_output", call_id: "fc1" });
    expect(String(input[3].output)).toContain("Jitu");
    expect(r.reply).toBe("Ada enam proyek aktif.");
  });
});
