// Pengaturan model AI (dipakai di halaman Asisten dan Pengaturan › Connector).
import { KeyRound } from "lucide-react";
import { AI_PRESETS, PROVIDER_LABEL, useAiConfig, type Provider } from "./config";
import { isDesktop } from "../lib/api";

const KEY_HINT: Record<Provider, string> = {
  anthropic: "Buat kunci di platform.claude.com → API keys. Kunci disimpan hanya di komputer ini dan tidak ikut sinkronisasi.",
  responses: "Buat kunci di platform.openai.com → API keys (penagihan API terpisah dari langganan ChatGPT Plus/Pro). Kunci disimpan hanya di komputer ini.",
  openai: "Untuk Ollama: pasang dari ollama.com, jalankan `ollama pull qwen2.5:7b`, lalu biarkan Ollama berjalan. Untuk layanan lain, isi alamat /v1 dan kuncinya.",
};

export function AiModelSettings({ compact }: { compact?: boolean }) {
  const ai = useAiConfig();
  return (
    <>
      {!compact && (
        <h2>
          <KeyRound size={16} /> Model AI
        </h2>
      )}
      <div className="as-presets">
        {AI_PRESETS.map((p) => {
          const on = ai.cfg.provider === p.cfg.provider && (!p.cfg.model || ai.cfg.model === p.cfg.model) && (p.id !== "custom" || ai.cfg.baseUrl !== "http://localhost:11434/v1");
          return (
            <button key={p.id} className={`as-preset ${on ? "on" : ""}`} onClick={() => ai.save(p.cfg)}>
              <b>{p.label}</b>
              <small>{p.hint}</small>
            </button>
          );
        })}
      </div>
      <div className="form-row">
        <label className="field">
          <span className="field-label">Penyedia</span>
          <select value={ai.cfg.provider} onChange={(e) => ai.save({ provider: e.target.value as Provider })}>
            {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABEL[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Model</span>
          <input value={ai.cfg.model} onChange={(e) => ai.save({ model: e.target.value.trim() })} />
        </label>
        <label className="field">
          <span className="field-label">Alamat API</span>
          <input value={ai.cfg.baseUrl} onChange={(e) => ai.save({ baseUrl: e.target.value.trim() })} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">API key {ai.cfg.provider === "openai" ? "(opsional untuk Ollama)" : ""}</span>
        <input type="password" value={ai.cfg.apiKey} placeholder={ai.cfg.provider === "anthropic" ? "sk-ant-…" : ai.cfg.provider === "responses" ? "sk-…" : "Kosongkan untuk Ollama"} onChange={(e) => ai.save({ apiKey: e.target.value.trim() })} autoComplete="off" />
        <span className="field-hint">{KEY_HINT[ai.cfg.provider]}</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={ai.cfg.autoApply} onChange={(e) => ai.save({ autoApply: e.target.checked })} />
        <span>Jalankan tambah & ubah data langsung (matikan agar setiap perubahan minta persetujuan)</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={ai.cfg.botAi} onChange={(e) => ai.save({ botAi: e.target.checked })} />
        <span>Pesan bebas di bot WhatsApp/Telegram/email dijawab oleh asisten (sesuai peran pengirim)</span>
      </label>
      {!isDesktop && <p className="muted small">Di pratinjau browser, permintaan ke model bisa terhalang CORS. Di aplikasi desktop permintaan dikirim dari backend.</p>}
    </>
  );
}
