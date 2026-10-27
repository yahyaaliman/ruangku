// Asisten AI: tanya jawab, rekomendasi, dan tambah/ubah data lewat percakapan.
import { Fragment, ReactNode, useEffect, useRef, useState } from "react";
import { Bot, Check, Plus, Send, Settings2, Sparkles, X } from "lucide-react";
import { aiReady, useAiConfig } from "../ai/config";
import { AiModelSettings } from "../ai/AiSettings";
import type { Msg } from "../ai/llm";
import { runAgent } from "../ai/agent";
import { ActionLog, Pending, runTool } from "../ai/tools";
import { errorText } from "../lib/api";
import { useMembers } from "../lib/members";
import type { Role } from "../lib/team";
import { useToast } from "../components/ui";

interface Turn {
  role: "user" | "assistant";
  text: string;
  at: number;
  actions?: ActionLog[];
  pending?: (Pending & { state?: "ok" | "tolak" | "gagal"; result?: string })[];
  error?: boolean;
}
interface Saved {
  turns: Turn[];
  history: Msg[];
}
const KEY = "ruangku-ai-chat";
function loadChat(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "") as Saved;
  } catch {
    return { turns: [], history: [] };
  }
}

const SUGGEST = [
  "Rencanakan hari saya dan buatkan blok jadwalnya",
  "Apa saja yang terlambat dan harus saya kerjakan dulu?",
  "Ringkas kemajuan minggu ini per proyek",
  "Proyek mana yang paling berisiko meleset dari target?",
  "Buat tugas: siapkan slide seminar proposal Jumat, proyek Riset Thesis, prioritas tinggi",
  "Tugaskan rekap infaq minggu ini ke Sari",
];

/** Markdown sangat ringan: **tebal**, daftar, baris baru. */
function Rich({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i}>{p.slice(2, -2)}</b> : <Fragment key={i}>{p}</Fragment>));
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`}>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>);
    list = [];
  };
  for (const l of lines) {
    const m = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) list.push(m[1]);
    else {
      flush();
      if (l.trim().startsWith("#")) out.push(<p key={`h${out.length}`} className="as-h">{inline(l.replace(/^#+\s*/, ""))}</p>);
      else if (l.trim()) out.push(<p key={`p${out.length}`}>{inline(l)}</p>);
    }
  }
  flush();
  return <>{out}</>;
}

export default function Assistant() {
  const ai = useAiConfig();
  const toast = useToast();
  const members = useMembers();
  const me = members.find((m) => m.isMe && !m.workspaceId) ?? members.find((m) => m.isMe);
  const role: Role = me?.role ?? "pemilik";
  const [chat, setChat] = useState<Saved>(loadChat);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [showCfg, setShowCfg] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const ready = aiReady(ai.cfg);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ turns: chat.turns.slice(-80), history: chat.history.slice(-40) }));
    } catch {
      /* abaikan */
    }
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [chat]);
  useEffect(() => {
    if (ai.loaded && !ready) setShowCfg(true);
  }, [ai.loaded, ready]);

  const send = async (q: string) => {
    const msg = q.trim();
    if (!msg || busy) return;
    if (!ready) return setShowCfg(true);
    setText("");
    const turns = [...chat.turns, { role: "user" as const, text: msg, at: Date.now() }];
    setChat({ ...chat, turns });
    setBusy("Berpikir…");
    try {
      const r = await runAgent({ cfg: ai.cfg, history: chat.history, userText: msg, ctx: { role, actor: me, autoApply: ai.cfg.autoApply }, onStep: (s) => setBusy(s.length > 90 ? s.slice(0, 90) + "…" : s) });
      setChat({ history: r.history, turns: [...turns, { role: "assistant", text: r.reply || (r.pending.length ? "Perlu persetujuan Anda:" : "Selesai."), at: Date.now(), actions: r.actions, pending: r.pending }] });
    } catch (e) {
      const m = errorText(e);
      const hint = /401|403|invalid x-api-key|authentication/i.test(m) ? " Periksa API key di pengaturan asisten." : /Tidak bisa terhubung|connect/i.test(m) ? " Periksa koneksi internet atau alamat server model." : "";
      setChat({ ...chat, turns: [...turns, { role: "assistant", text: `Maaf, permintaan ke model gagal: ${m}.${hint}`, at: Date.now(), error: true }] });
    } finally {
      setBusy(null);
      input.current?.focus();
    }
  };

  const decide = async (ti: number, p: Pending, ok: boolean) => {
    let state: "ok" | "tolak" | "gagal" = "tolak";
    let result = "Dibatalkan";
    if (ok) {
      const out = await runTool(p.tool, p.input, { role, actor: me, autoApply: true }, true);
      state = out.is_error ? "gagal" : "ok";
      result = out.content;
      if (out.is_error) toast(out.content, "error");
    }
    setChat((c) => {
      const turns = c.turns.map((t, i) => (i === ti ? { ...t, pending: t.pending?.map((x) => (x.id === p.id ? { ...x, state, result } : x)) } : t));
      const note: Msg = { role: "user", content: `(Catatan sistem: pengguna ${ok ? "menyetujui" : "menolak"} "${p.label}". ${ok ? `Hasil: ${result}` : ""})` };
      const ack: Msg = { role: "assistant", content: [{ type: "text", text: ok ? "Baik, sudah dijalankan." : "Baik, dibatalkan." }] };
      return { turns, history: [...c.history, note, ack] };
    });
  };

  return (
    <div className="page as-page">
      <header className="page-head">
        <div>
          <h1><Bot size={24} /> Asisten AI</h1>
          <p className="page-sub">Tanya rekomendasi, minta ringkasan, atau suruh menambah dan mengubah tugas, jadwal, catatan, KPI, dan OKR. Penghapusan selalu minta persetujuan Anda.</p>
        </div>
        <div className="btn-row">
          <button className="btn" onClick={() => setChat({ turns: [], history: [] })} disabled={!chat.turns.length}><Plus size={15} /> Percakapan baru</button>
          <button className={`btn ${showCfg ? "btn-primary" : ""}`} onClick={() => setShowCfg(!showCfg)}><Settings2 size={15} /> Model</button>
        </div>
      </header>

      {showCfg && (
        <section className="as-cfg">
          <AiModelSettings />
        </section>
      )}

      <div className="as-log" ref={log} aria-live="polite">
        {chat.turns.length === 0 && (
          <div className="as-empty">
            <Sparkles size={26} />
            <p className="as-empty-title">Mau dibantu apa hari ini?</p>
            <p className="muted">Asisten membaca proyek, tugas, jadwal, KPI, dan OKR Anda, lalu bisa langsung mencatatkan perubahan.</p>
          </div>
        )}
        {chat.turns.map((t, i) => (
          <div key={i} className={`as-msg ${t.role} ${t.error ? "err" : ""}`}>
            <div className="as-bubble">
              {t.role === "assistant" ? <Rich text={t.text} /> : <p>{t.text}</p>}
              {!!t.actions?.length && (
                <ul className="as-actions">
                  {t.actions.map((a, j) => (
                    <li key={j} className={`as-act ${a.kind}`}>
                      <Check size={12} /> {a.label}
                    </li>
                  ))}
                </ul>
              )}
              {t.pending?.map((p) => (
                <div key={p.id} className={`as-pending ${p.kind} ${p.state ?? ""}`}>
                  <span>{p.kind === "delete" ? "Hapus? " : "Usulan: "}{p.label}</span>
                  {p.state ? (
                    <em>{p.state === "ok" ? "✓ Dijalankan" : p.state === "gagal" ? `Gagal: ${p.result}` : "Dibatalkan"}</em>
                  ) : (
                    <span className="as-pending-btns">
                      <button className={`btn btn-sm ${p.kind === "delete" ? "btn-danger" : "btn-primary"}`} onClick={() => decide(i, p, true)}><Check size={13} /> Setujui</button>
                      <button className="btn btn-sm" onClick={() => decide(i, p, false)}><X size={13} /> Tolak</button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {busy && (
          <div className="as-msg assistant">
            <div className="as-bubble as-busy"><span className="as-dots"><i /><i /><i /></span> {busy}</div>
          </div>
        )}
      </div>

      <div className="as-suggest">
        {SUGGEST.map((s) => (
          <button key={s} className="chip-btn" onClick={() => send(s)} disabled={!!busy}>{s}</button>
        ))}
      </div>
      <form className="as-input" onSubmit={(e) => (e.preventDefault(), send(text))}>
        <textarea
          ref={input}
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), send(text))}
          placeholder={ready ? "Tulis pesan… (Enter kirim, Shift+Enter baris baru)" : "Atur model AI dulu di tombol Model"}
          aria-label="Pesan untuk asisten"
        />
        <button className="btn btn-primary" type="submit" disabled={!text.trim() || !!busy}><Send size={15} /> Kirim</button>
      </form>
    </div>
  );
}
