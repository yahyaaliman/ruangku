// Connector: hubungkan Ruangku ke Claude/ChatGPT (MCP & model AI), kalender, server tim,
// kanal pesan (Telegram, WhatsApp, Gmail), folder cloud, dan pembaruan GitHub.
import { useEffect, useMemo, useState } from "react";
import { Bot, CalendarDays, Check, Cloud, Copy, Download, Eye, EyeOff, FileText, PackageCheck, KeyRound, Mail, MessageCircle, Plug, RefreshCw, Send, Server, Users } from "lucide-react";
import { api, errorText, isDesktop, saveTextFile } from "../lib/api";
import { useToast } from "../components/ui";
import { useJsonSetting } from "../lib/useSetting";
import { DEFAULT_MCP, MCP_KEY, newToken, useMcpLog, useMcpStatus, type McpConfig } from "../ai/mcp";
import { AiModelSettings } from "../ai/AiSettings";
import { aiReady, PROVIDER_LABEL, useAiConfig } from "../ai/config";
import { projectContextMarkdown } from "../ai/contextExport";
import { GCAL_KEY, type GcalConfig } from "../calendar/gcal";
import { loadTeam } from "../team/pb";
import { loadBot } from "../team/bot";
import { UPDATE_REPO_KEY } from "../lib/update";
import { useScope } from "../lib/scope";
import { dataOf, type KeyResult, type Note, type Objective } from "../lib/types";
import { load } from "../lib/taskOps";
import type { Task } from "../lib/tasks";
import { MEETING_KIND, type Meeting } from "../lib/meetings";
import { COURSE_KIND, type Course } from "../lib/courses";
import type { LedgerEntry } from "../lib/ledger";
import { BUDGET_KIND, type Budget } from "../lib/finance";
import { dateKey, relativeAgo } from "../lib/date";
import { requestOpen } from "../lib/deeplink";
import type { Sync } from "./SyncSettings";

type Client = "claude-desktop" | "claude-code" | "chatgpt" | "lain";
const CLIENTS: { id: Client; label: string }[] = [
  { id: "claude-desktop", label: "Claude Desktop" },
  { id: "claude-code", label: "Claude Code" },
  { id: "chatgpt", label: "ChatGPT" },
  { id: "lain", label: "Klien lain" },
];

function CopyBox({ text, label }: { text: string; label?: string }) {
  const toast = useToast();
  const [done, setDone] = useState(false);
  return (
    <div className="cn-code">
      {label && <span className="cn-code-label">{label}</span>}
      <pre>{text}</pre>
      <button
        className="btn btn-sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setDone(true);
            window.setTimeout(() => setDone(false), 1500);
          } catch {
            toast("Tidak bisa menyalin otomatis; pilih teksnya lalu Ctrl+C", "error");
          }
        }}
      >
        {done ? <Check size={14} /> : <Copy size={14} />} {done ? "Tersalin" : "Salin"}
      </button>
    </div>
  );
}

const jsonStr = (s: string) => JSON.stringify(s);

export function McpPanel() {
  const toast = useToast();
  const [cfg, save, loaded] = useJsonSetting<McpConfig>(MCP_KEY, DEFAULT_MCP);
  const st = useMcpStatus();
  const log = useMcpLog();
  const [client, setClient] = useState<Client>("claude-desktop");
  const [show, setShow] = useState(false);
  const [exe, setExe] = useState("C:\\Program Files\\Ruangku\\ruangku.exe");
  const [port, setPort] = useState(String(DEFAULT_MCP.port));
  useEffect(() => {
    api.appExePath().then(setExe).catch(() => {});
  }, []);
  useEffect(() => setPort(String(cfg.port)), [cfg.port]);
  // Buat token sekali saat pertama dinyalakan.
  useEffect(() => {
    if (loaded && cfg.enabled && !cfg.token) save({ ...cfg, token: newToken() });
  }, [loaded, cfg, save]);
  const url = `http://127.0.0.1:${cfg.port}/mcp`;
  const tok = cfg.token || "(nyalakan server untuk membuat token)";
  const masked = cfg.token ? `${cfg.token.slice(0, 6)}${"•".repeat(18)}${cfg.token.slice(-4)}` : "—";
  const desktopJson = `{\n  "mcpServers": {\n    "ruangku": {\n      "command": ${jsonStr(exe)},\n      "args": ["--mcp"]\n    }\n  }\n}`;
  const running = !!st?.running;

  return (
    <section className="setting cn-mcp">
      <div className="setting-icon">
        <Plug size={20} />
      </div>
      <div className="setting-body">
        <h2>Server MCP · Claude & ChatGPT</h2>
        <p className="muted">
          Model Context Protocol membuat Claude Desktop, Claude Code, ChatGPT, dan aplikasi AI lain bisa membaca dan mencatat ke Ruangku: tugas, jadwal, rapat, kuliah, keuangan, catatan, KPI, dan OKR. Server hanya mendengar di komputer ini (127.0.0.1) dan memakai token rahasia. Penghapusan tidak pernah dibuka lewat MCP.
        </p>
        <div className="cn-mcp-top">
          <label className="switch">
            <input type="checkbox" checked={cfg.enabled} onChange={(e) => save({ ...cfg, enabled: e.target.checked, token: cfg.token || newToken() })} />
            <span>Aktifkan server MCP</span>
          </label>
          <span className={`cn-pill ${running ? "ok" : cfg.enabled ? "warn" : ""}`}>{running ? `Berjalan · ${st!.requests} permintaan` : cfg.enabled ? (isDesktop ? "Memulai…" : "Hanya di aplikasi desktop") : "Mati"}</span>
        </div>
        {st?.error && <p className="text-danger small">{st.error}</p>}
        <div className="cn-grid">
          <label className="field">
            <span className="field-label">Port</span>
            <input
              inputMode="numeric"
              value={port}
              onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
              onBlur={() => {
                const n = Number(port);
                if (n >= 1024 && n <= 65535) save({ ...cfg, port: n });
                else setPort(String(cfg.port));
              }}
            />
          </label>
          <div className="field">
            <span className="field-label">Token</span>
            <div className="cn-token">
              <code>{show ? cfg.token || "—" : masked}</code>
              <button className="icon-btn sm" onClick={() => setShow(!show)} aria-label={show ? "Sembunyikan token" : "Tampilkan token"}>
                {show ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <button className="icon-btn sm" onClick={() => cfg.token && navigator.clipboard.writeText(cfg.token).then(() => toast("Token disalin"))} aria-label="Salin token">
                <Copy size={14} />
              </button>
              <button
                className="icon-btn sm"
                onClick={() => {
                  save({ ...cfg, token: newToken() });
                  toast("Token baru dibuat. Perbarui konfigurasi di klien yang memakai HTTP.");
                }}
                aria-label="Buat token baru"
                title="Buat token baru (klien lama perlu diperbarui)"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </div>
        </div>
        <label className="switch">
          <input type="checkbox" checked={cfg.allowWrite} onChange={(e) => save({ ...cfg, allowWrite: e.target.checked })} />
          <span>Izinkan AI menambah & mengubah data (tugas, blok jadwal, rapat, transaksi, catatan). Matikan untuk mode baca saja.</span>
        </label>

        <div className="seg cn-clients" role="tablist" aria-label="Klien">
          {CLIENTS.map((c) => (
            <button key={c.id} role="tab" aria-selected={client === c.id} className={client === c.id ? "active" : ""} onClick={() => setClient(c.id)}>
              {c.label}
            </button>
          ))}
        </div>
        <div className="cn-howto">
          {client === "claude-desktop" && (
            <>
              <ol>
                <li>Buka Claude Desktop › Settings › Developer › <b>Edit Config</b> (berkas <code>%APPDATA%\Claude\claude_desktop_config.json</code>).</li>
                <li>Tempelkan bagian <code>ruangku</code> berikut ke dalam <code>mcpServers</code>, simpan, lalu tutup dan buka lagi Claude Desktop.</li>
                <li>Pastikan Ruangku berjalan (ikon tray) dengan server MCP aktif. Claude menjalankan <code>ruangku.exe --mcp</code> sebagai jembatan; token dibaca otomatis.</li>
              </ol>
              <CopyBox text={desktopJson} label="claude_desktop_config.json" />
            </>
          )}
          {client === "claude-code" && (
            <>
              <p>Jalankan sekali di terminal (PowerShell). Lewat HTTP dengan token:</p>
              <CopyBox text={`claude mcp add --transport http --scope user ruangku ${url} --header "Authorization: Bearer ${tok}"`} />
              <p>Atau lewat jembatan stdio (tanpa token di konfigurasi):</p>
              <CopyBox text={`claude mcp add --scope user ruangku -- ${jsonStr(exe)} --mcp`} />
              <p className="muted small">Periksa dengan <code>claude mcp list</code>, lalu di Claude Code ketik mis. "apa rapat saya minggu ini?"</p>
            </>
          )}
          {client === "chatgpt" && (
            <>
              <p>
                ChatGPT berjalan di cloud, jadi perlu jalur aman ke komputer ini. Cara resmi: <b>Secure MCP Tunnel</b> dari OpenAI (tersedia untuk workspace yang diizinkan admin menambah server MCP kustom).
              </p>
              <ol>
                <li>
                  Buat tunnel di <a href="https://platform.openai.com/settings/organization/tunnels" target="_blank" rel="noreferrer">platform.openai.com › Settings › Tunnels</a>, kaitkan ke workspace ChatGPT, salin <code>tunnel_id</code>.
                </li>
                <li>
                  Pasang <a href="https://github.com/openai/tunnel-client/releases/latest" target="_blank" rel="noreferrer">tunnel-client</a>, isi <code>CONTROL_PLANE_API_KEY</code> dengan kunci API runtime, lalu jalankan:
                </li>
              </ol>
              <CopyBox text={`tunnel-client init --sample sample_mcp_stdio_local --profile ruangku --tunnel-id <TUNNEL_ID> --mcp-command "${exe.replace(/"/g, '\\"')} --mcp"\ntunnel-client run --profile ruangku`} />
              <ol start={3}>
                <li>
                  Di ChatGPT buka <a href="https://chatgpt.com/plugins" target="_blank" rel="noreferrer">Plugins</a> › + › <b>Add custom MCP server</b> › Connection: <b>Tunnel</b>, pilih tunnel tadi.
                </li>
              </ol>
              <p className="muted small">Alternatif tanpa akun bisnis: buka port ini lewat tunnel publik (mis. Cloudflare Tunnel) lalu pakai URL rahasia <code>https://&lt;alamat-tunnel&gt;/mcp/{show ? cfg.token || "TOKEN" : "TOKEN"}</code> dengan autentikasi "No auth". Siapa pun yang tahu URL itu bisa mengakses data Anda, jadi matikan mode tulis bila ragu.</p>
            </>
          )}
          {client === "lain" && (
            <>
              <p>Klien MCP mana pun yang mendukung Streamable HTTP (revisi 2026-07-28 maupun 2025-xx):</p>
              <CopyBox text={`URL     ${url}\nHeader  Authorization: Bearer ${tok}`} />
              <p>Atau perintah stdio:</p>
              <CopyBox text={`${jsonStr(exe)} --mcp`} />
            </>
          )}
        </div>
        {log.length > 0 && (
          <div className="cn-log">
            <p className="set-list-head">Aktivitas terakhir</p>
            <ul>
              {log.slice(0, 8).map((l, i) => (
                <li key={i} className={l.ok ? "" : "err"}>
                  <span>{new Date(l.at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  <code>{l.tool ?? l.method}</code>
                  {l.client && <small className="muted">{l.client}</small>}
                  {!l.ok && <small className="text-danger">gagal</small>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export function ContextExport() {
  const toast = useToast();
  const scope = useScope();
  const [pid, setPid] = useState<string>(scope.current?.id ?? "");
  const [bodies, setBodies] = useState(true);
  const [busy, setBusy] = useState(false);
  const build = async () => {
    const [tasks, notes, meetings, courses, ledger, budgets, objectives, keyResults] = await Promise.all([load<Task>("task"), load<Note>("note"), load<Meeting>(MEETING_KIND), load<Course>(COURSE_KIND), load<LedgerEntry>("ledger"), load<Budget>(BUDGET_KIND), load<Objective>("objective"), load<KeyResult>("keyresult")]);
    return projectContextMarkdown({ projectId: pid || null, today: dateKey(), projects: scope.allProjects, tasks, notes, meetings, courses, ledger, budgets, objectives, keyResults, noteBodies: bodies });
  };
  const name = pid ? scope.byId(pid)?.name ?? "proyek" : "semua-proyek";
  return (
    <section className="setting">
      <div className="setting-icon">
        <FileText size={20} />
      </div>
      <div className="setting-body">
        <h2>Konteks untuk Claude & ChatGPT Projects</h2>
        <p className="muted">Ekspor ringkasan proyek (proyek, tugas terbuka, rapat, kuliah, OKR, keuangan proyek, catatan) sebagai Markdown. Tempelkan atau unggah ke pengetahuan Project di Claude atau ChatGPT supaya percakapan di sana memahami pekerjaan Anda. Keuangan pribadi tidak ikut diekspor.</p>
        <div className="btn-row">
          <select value={pid} onChange={(e) => setPid(e.target.value)} aria-label="Proyek">
            <option value="">Semua proyek</option>
            {scope.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {scope.path(p.id)}
              </option>
            ))}
          </select>
          <label className="check-row">
            <input type="checkbox" checked={bodies} onChange={(e) => setBodies(e.target.checked)} /> Sertakan isi catatan
          </label>
        </div>
        <div className="btn-row">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const md = await build();
                await navigator.clipboard.writeText(md);
                toast(`Konteks disalin (${Math.round(md.length / 1000)} rb karakter). Tempel ke Project di Claude/ChatGPT.`);
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Copy size={15} /> Salin Markdown
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              const md = await build();
              const p = await saveTextFile("Simpan konteks", `konteks-${name.toLowerCase().replace(/[^\w]+/g, "-")}-${dateKey()}.md`, md, { name: "Markdown", extensions: ["md"] }, "text/markdown");
              if (p) toast(`Disimpan: ${p}`);
            }}
          >
            <Download size={15} /> Simpan .md
          </button>
        </div>
      </div>
    </section>
  );
}

interface Statuses {
  gcal?: GcalConfig | null;
  ics: number;
  team?: { url: string; email: string } | null;
  bot?: { on: boolean; tg: boolean; wa: boolean; mail: boolean; digest: boolean };
  repo?: string | null;
}

function useStatuses(): Statuses {
  const [s, setS] = useState<Statuses>({ ics: 0 });
  useEffect(() => {
    (async () => {
      const gcalRaw = await api.getSetting(GCAL_KEY).catch(() => null);
      let gcal: GcalConfig | null = null;
      try {
        gcal = gcalRaw ? JSON.parse(gcalRaw) : null;
      } catch {
        gcal = null;
      }
      const subs = (await api.list("calsub").catch(() => [])).map((r) => dataOf<{ source: string; enabled: boolean }>(r.data));
      const team = await loadTeam().catch(() => null);
      const bot = await loadBot().catch(() => null);
      const repo = await api.getSetting(UPDATE_REPO_KEY).catch(() => null);
      setS({
        gcal,
        ics: subs.filter((x) => x.source === "ics" && x.enabled).length,
        team: team ? { url: team.serverUrl, email: team.email } : null,
        bot: bot ? { on: bot.enabled, tg: bot.telegram.enabled && !!bot.telegram.token, wa: bot.wa.enabled && !!bot.wa.token, mail: bot.email.enabled && !!bot.email.user, digest: bot.digest.enabled } : undefined,
        repo,
      });
    })();
  }, []);
  return s;
}

function Card({ icon, name, kind, desc, status, tone, action, onAction }: { icon: React.ReactNode; name: string; kind: string; desc: string; status: string; tone: "ok" | "warn" | "off"; action: string; onAction: () => void }) {
  return (
    <article className="cn-card">
      <header>
        <span className="cn-ico">{icon}</span>
        <div>
          <b>{name}</b>
          <small className="muted">{kind}</small>
        </div>
        <span className={`cn-pill ${tone === "off" ? "" : tone}`}>{status}</span>
      </header>
      <p className="muted small">{desc}</p>
      <button className="btn btn-sm" onClick={onAction}>
        {action}
      </button>
    </article>
  );
}

export function ConnectorsTab({ go, sync, openTab }: { go: (page: string) => void; sync: Sync; openTab: (t: string) => void }) {
  const s = useStatuses();
  const ai = useAiConfig();
  const [aiOpen, setAiOpen] = useState(false);
  const toCal = () => (requestOpen("calendars", "1"), go("calendar"));
  const cards = useMemo(
    () => [
      { icon: <CalendarDays size={18} />, name: "Google Calendar", kind: "Kalender · dua arah", desc: "Kirim blok jadwal, rapat, dan kelas ke Google Calendar dan tampilkan kalender Google di Ruangku.", status: s.gcal?.connected ? `Terhubung${s.gcal.email ? ` · ${s.gcal.email}` : ""}` : "Belum terhubung", tone: s.gcal?.connected ? (s.gcal.lastError ? "warn" : "ok") : "off", action: s.gcal?.connected ? "Kelola" : "Hubungkan", onAction: toCal },
      { icon: <CalendarDays size={18} />, name: "Langganan kalender (ICS)", kind: "Kalender · baca", desc: "Outlook, iCloud, kalender kampus/SIX, atau tautan .ics lain sebagai lapisan kalender.", status: s.ics ? `${s.ics} kalender aktif` : "Belum ada", tone: s.ics ? "ok" : "off", action: "Kelola", onAction: toCal },
      { icon: <Server size={18} />, name: "Server tim (PocketBase)", kind: "Kolaborasi", desc: "Sinkron proyek, tugas, rapat, dan keuangan proyek dengan anggota tim sesuai peran.", status: s.team ? `Masuk sebagai ${s.team.email}` : "Belum terhubung", tone: s.team ? "ok" : "off", action: s.team ? "Kelola" : "Hubungkan", onAction: () => go("team") },
      { icon: <Send size={18} />, name: "Telegram", kind: "Bot pesan", desc: "Tugas, rapat, kuliah, keuangan (mis. 'keluar 25rb makan'), dan rangkuman pagi lewat bot Telegram.", status: s.bot?.tg ? (s.bot.on ? "Aktif" : "Siap, bot mati") : "Belum diatur", tone: s.bot?.tg ? (s.bot.on ? "ok" : "warn") : "off", action: "Atur", onAction: () => go("team") },
      { icon: <MessageCircle size={18} />, name: "WhatsApp Cloud API", kind: "Bot pesan", desc: "Pengingat, undangan rapat, dan perintah bot lewat WhatsApp (Meta Cloud API).", status: s.bot?.wa ? (s.bot.on ? "Aktif" : "Siap, bot mati") : "Belum diatur", tone: s.bot?.wa ? (s.bot.on ? "ok" : "warn") : "off", action: "Atur", onAction: () => go("team") },
      { icon: <Mail size={18} />, name: "Gmail / email", kind: "SMTP & IMAP", desc: "Kirim undangan & notulen rapat, laporan, dan terima perintah lewat email.", status: s.bot?.mail ? "Terhubung" : "Belum diatur", tone: s.bot?.mail ? "ok" : "off", action: "Atur", onAction: () => go("team") },
      { icon: <Cloud size={18} />, name: "Folder cloud", kind: "Sinkronisasi antarkomputer", desc: "OneDrive, Google Drive for Desktop, atau Dropbox untuk menyalin data ke komputer lain.", status: sync.status?.folder ? (sync.status.lastError ? "Galat" : `Tersinkron ${sync.status.lastSync ? relativeAgo(sync.status.lastSync) : ""}`) : "Belum diatur", tone: sync.status?.folder ? (sync.status.lastError ? "warn" : "ok") : "off", action: "Atur", onAction: () => openTab("data") },
      { icon: <PackageCheck size={18} />, name: "GitHub Releases", kind: "Pembaruan aplikasi", desc: "Periksa versi baru Ruangku dari repositori rilis Anda.", status: s.repo ? s.repo : "Belum diatur", tone: s.repo ? "ok" : "off", action: "Atur", onAction: () => openTab("data") },
    ],
    [s, sync.status, go, openTab],
  );
  return (
    <>
      <McpPanel />
      <section className="setting">
        <div className="setting-icon">
          <Bot size={20} />
        </div>
        <div className="setting-body">
          <h2>Model AI untuk asisten</h2>
          <p className="muted">Asisten di Ruangku (dan bot) bisa memakai Claude, ChatGPT (OpenAI), atau model lokal Ollama.</p>
          <div className="cn-mcp-top">
            <span className={`cn-pill ${aiReady(ai.cfg) ? "ok" : ""}`}>
              <KeyRound size={12} /> {aiReady(ai.cfg) ? `${PROVIDER_LABEL[ai.cfg.provider]} · ${ai.cfg.model}` : "Belum ada kunci API"}
            </span>
            <button className="btn btn-sm" onClick={() => setAiOpen(!aiOpen)}>
              {aiOpen ? "Tutup" : "Atur model"}
            </button>
          </div>
          {aiOpen && (
            <div className="as-cfg cn-ai">
              <AiModelSettings compact />
            </div>
          )}
        </div>
      </section>
      <ContextExport />
      <section className="setting">
        <div className="setting-icon">
          <Users size={20} />
        </div>
        <div className="setting-body">
          <h2>Layanan lain</h2>
          <div className="cn-cards">
            {cards.map((c) => (
              <Card key={c.name} {...(c as Parameters<typeof Card>[0])} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

