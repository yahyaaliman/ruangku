// Klien model bahasa: Claude (Messages API), ChatGPT/OpenAI (Responses API), atau endpoint
// kompatibel OpenAI chat/completions (Ollama, dll.).
// Format percakapan internal mengikuti blok konten Claude.
import { httpJson } from "../lib/api";
import type { AiConfig } from "./config";

export type Block =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  | ({ type: string } & Record<string, unknown>);
export interface Msg {
  role: "user" | "assistant";
  content: string | Block[];
}
export interface ToolDef {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required?: string[] };
}
export interface Completion {
  blocks: Block[];
  stop: string;
}

export const ANTHROPIC_VERSION = "2026-10-21";
const trimSlash = (u: string) => u.replace(/\/+$/, "");

/** Blok khusus penyedia (mis. item reasoning OpenAI) tidak dikirim ke penyedia lain. */
const OPENAI_ITEM = "openai_item";
const forClaude = (messages: Msg[]): Msg[] =>
  messages
    .map((m) => (typeof m.content === "string" ? m : { ...m, content: m.content.filter((b) => b.type !== OPENAI_ITEM) }))
    .filter((m) => typeof m.content === "string" || m.content.length > 0);

/** Riwayat (format blok Claude) → item input Responses API. */
export function toResponsesInput(messages: Msg[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const m of messages) {
    if (typeof m.content === "string") {
      out.push({ role: m.role, content: m.content });
      continue;
    }
    for (const b of m.content) {
      if (b.type === "text") out.push({ role: m.role, content: (b as { text: string }).text });
      else if (b.type === OPENAI_ITEM) out.push((b as unknown as { item: Record<string, unknown> }).item);
      else if (b.type === "tool_use") {
        const c = b as Extract<Block, { type: "tool_use" }>;
        out.push({ type: "function_call", call_id: c.id, name: c.name, arguments: JSON.stringify(c.input ?? {}) });
      } else if (b.type === "tool_result") {
        const r = b as Extract<Block, { type: "tool_result" }>;
        out.push({ type: "function_call_output", call_id: r.tool_use_id, output: r.content });
      }
    }
  }
  return out;
}

interface ResponsesOut {
  output?: ({ type: "message"; content?: { type: string; text?: string }[] } | { type: "function_call"; call_id: string; name: string; arguments: string } | ({ type: string } & Record<string, unknown>))[];
  status?: string;
  incomplete_details?: { reason?: string } | null;
}

/** Hasil Responses API → blok internal. Item reasoning disimpan apa adanya untuk giliran berikutnya. */
export function fromResponsesOutput(res: ResponsesOut): Completion {
  const blocks: Block[] = [];
  for (const it of res.output ?? []) {
    if (it.type === "message") {
      const text = ((it as { content?: { type: string; text?: string }[] }).content ?? []).filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
      if (text) blocks.push({ type: "text", text });
    } else if (it.type === "function_call") {
      const c = it as { call_id: string; name: string; arguments: string };
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(c.arguments || "{}");
      } catch {
        input = {};
      }
      blocks.push({ type: "tool_use", id: c.call_id, name: c.name, input });
    } else if (it.type === "reasoning") blocks.push({ type: OPENAI_ITEM, item: it });
  }
  const calls = blocks.some((b) => b.type === "tool_use");
  return { blocks, stop: calls ? "tool_use" : res.status === "incomplete" ? res.incomplete_details?.reason ?? "incomplete" : "end_turn" };
}

export async function complete(cfg: AiConfig, system: string, messages: Msg[], tools: ToolDef[]): Promise<Completion> {
  if (cfg.provider === "responses") {
    const res = await httpJson<ResponsesOut>(
      "POST",
      `${trimSlash(cfg.baseUrl)}/responses`,
      {
        model: cfg.model,
        instructions: system,
        input: toResponsesInput(messages),
        tools: tools.map((t) => ({ type: "function", name: t.name, description: t.description, parameters: t.input_schema, strict: false })),
        store: false,
        include: ["reasoning.encrypted_content"],
        max_output_tokens: 4096,
      },
      { authorization: `Bearer ${cfg.apiKey}` },
      120_000,
    );
    return fromResponsesOutput(res);
  }
  if (cfg.provider === "anthropic") {
    const res = await httpJson<{ content: Block[]; stop_reason: string }>(
      "POST",
      `${trimSlash(cfg.baseUrl)}/v1/messages`,
      { model: cfg.model, max_tokens: 4096, system, messages: forClaude(messages), tools },
      { "x-api-key": cfg.apiKey, "anthropic-version": ANTHROPIC_VERSION },
      120_000,
    );
    return { blocks: res.content ?? [], stop: res.stop_reason };
  }
  // OpenAI-compatible (Ollama, dll.)
  const oa: Record<string, unknown>[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (typeof m.content === "string") {
      oa.push({ role: m.role, content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const text = m.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
      const calls = m.content.filter((b) => b.type === "tool_use") as Extract<Block, { type: "tool_use" }>[];
      oa.push({ role: "assistant", content: text || null, ...(calls.length ? { tool_calls: calls.map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: JSON.stringify(c.input) } })) } : {}) });
    } else {
      for (const b of m.content) {
        if (b.type === "tool_result") {
          const r = b as Extract<Block, { type: "tool_result" }>;
          oa.push({ role: "tool", tool_call_id: r.tool_use_id, content: r.content });
        } else if (b.type === "text") oa.push({ role: "user", content: (b as { text: string }).text });
      }
    }
  }
  const res = await httpJson<{ choices: { message: { content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason: string }[] }>(
    "POST",
    `${trimSlash(cfg.baseUrl)}/chat/completions`,
    { model: cfg.model, messages: oa, tools: tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema } })) },
    cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {},
    120_000,
  );
  const msg = res.choices?.[0]?.message;
  const blocks: Block[] = [];
  if (msg?.content) blocks.push({ type: "text", text: msg.content });
  for (const c of msg?.tool_calls ?? []) {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(c.function.arguments || "{}");
    } catch {
      input = {};
    }
    blocks.push({ type: "tool_use", id: c.id || `call_${Math.random().toString(36).slice(2)}`, name: c.function.name, input });
  }
  return { blocks, stop: msg?.tool_calls?.length ? "tool_use" : res.choices?.[0]?.finish_reason ?? "stop" };
}
