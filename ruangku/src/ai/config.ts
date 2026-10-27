// Pengaturan asisten AI (disimpan lokal per perangkat, tidak ikut tersinkron).
import { useEffect, useState } from "react";
import { api, onEvent } from "../lib/api";
import { loadSecure, saveSecure } from "../lib/secrets";

/** anthropic = Claude Messages API · responses = OpenAI Responses API (ChatGPT) · openai = chat/completions kompatibel (Ollama, dll.) */
export type Provider = "anthropic" | "responses" | "openai";
export interface AiConfig {
  provider: Provider;
  model: string;
  baseUrl: string;
  apiKey: string;
  /** Jalankan tambah/ubah data langsung (hapus selalu minta konfirmasi). */
  autoApply: boolean;
  /** Pesan bebas di bot WA/Telegram/email dijawab oleh AI. */
  botAi: boolean;
}

export const DEFAULT_AI: AiConfig = { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com", apiKey: "", autoApply: true, botAi: true };

export const AI_PRESETS: { id: string; label: string; hint: string; cfg: Partial<AiConfig> }[] = [
  { id: "sonnet", label: "Claude Sonnet 5.5", hint: "Disarankan: cepat dan cerdas. Sekitar $2/$10 per juta token.", cfg: { provider: "anthropic", model: "claude-sonnet-5-5", baseUrl: "https://api.anthropic.com" } },
  { id: "haiku", label: "Claude Haiku 5.5", hint: "Paling hemat dan cepat untuk perintah sederhana.", cfg: { provider: "anthropic", model: "claude-haiku-5-5", baseUrl: "https://api.anthropic.com" } },
  { id: "opus", label: "Claude Opus 5.5", hint: "Paling cerdas untuk perencanaan rumit. Lebih mahal.", cfg: { provider: "anthropic", model: "claude-opus-5-5", baseUrl: "https://api.anthropic.com" } },
  { id: "gpt-sol", label: "ChatGPT · GPT-6.1 Sol", hint: "Model OpenAI lewat Responses API. Perlu kunci API dari platform.openai.com (berbayar per token).", cfg: { provider: "responses", model: "gpt-6.1-sol", baseUrl: "https://api.openai.com/v1" } },
  { id: "gpt-terra", label: "ChatGPT · GPT-6.1 Terra", hint: "Varian OpenAI yang lebih ringan dan hemat untuk perintah sehari-hari.", cfg: { provider: "responses", model: "gpt-6.1-terra", baseUrl: "https://api.openai.com/v1" } },
  { id: "gpt-astra", label: "ChatGPT · GPT-6 Astra", hint: "Model OpenAI paling cerdas untuk perencanaan rumit. Lebih mahal.", cfg: { provider: "responses", model: "gpt-6-astra", baseUrl: "https://api.openai.com/v1" } },
  { id: "ollama", label: "Ollama (lokal, gratis)", hint: "Berjalan di komputer Anda tanpa internet. Perlu model yang mendukung tool calling, mis. qwen2.5:7b.", cfg: { provider: "openai", model: "qwen2.5:7b", baseUrl: "http://localhost:11434/v1", apiKey: "" } },
  { id: "custom", label: "Endpoint kompatibel OpenAI", hint: "Layanan lain dengan API chat/completions (isi URL, model, dan kunci).", cfg: { provider: "openai" } },
];

const KEY = "ai_config";
const SECRET_PATHS = ["apiKey"];
export async function loadAiConfig(): Promise<AiConfig> {
  try {
    const v = await api.getSetting(KEY);
    return await loadSecure(KEY, { ...DEFAULT_AI, ...(v ? JSON.parse(v) : {}) }, SECRET_PATHS);
  } catch {
    return DEFAULT_AI;
  }
}
export const saveAiConfig = (c: AiConfig) => saveSecure(KEY, c, SECRET_PATHS);
export const aiReady = (c: AiConfig) => !!c.model && !!c.baseUrl && (c.provider === "openai" || !!c.apiKey);
export const PROVIDER_LABEL: Record<Provider, string> = { anthropic: "Claude (Anthropic)", responses: "ChatGPT (OpenAI Responses API)", openai: "Kompatibel OpenAI (chat/completions)" };

export function useAiConfig() {
  const [cfg, setCfg] = useState<AiConfig>(DEFAULT_AI);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => loadAiConfig().then((c) => (setCfg(c), setLoaded(true)));
    load();
    return onEvent<string>("setting-changed", (k) => k === KEY && load());
  }, []);
  const save = async (patch: Partial<AiConfig>) => {
    const n = { ...cfg, ...patch };
    setCfg(n);
    await saveAiConfig(n);
  };
  return { cfg, save, loaded };
}
