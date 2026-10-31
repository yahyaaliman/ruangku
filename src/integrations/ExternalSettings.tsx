import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { errorText, isDesktop, onEvent } from "../lib/api";
import { useRecords } from "../lib/useRecords";
import type { Project } from "../lib/tasks";
import { Field, useToast } from "../components/ui";
import { relativeAgo } from "../lib/date";
import { ProviderClient, type Provider } from "./provider";
import { exclusive, loadConnection, loadSyncState, resolveConflict, runExternal, saveConnection, stateKey, useConnection } from "./useExternal";
import type { Conflict } from "./reconcile";

function Connector({ provider }: { provider: Provider }) {
  const cfg = useConnection(provider), projects = useRecords<Project>("project");
  const [clientId, setClientId] = useState(""), [secret, setSecret] = useState("");
  const [containers, setContainers] = useState<{ id: string; name: string }[]>([]);
  const [container, setContainer] = useState(""), [project, setProject] = useState("");
  const [busy, setBusy] = useState(false), [conflicts, setConflicts] = useState<Conflict[]>([]);
  const toast = useToast(), google = provider === "google-tasks", label = google ? "Google Tasks" : "Outlook Calendar";
  useEffect(() => {
    if (!cfg.subject) return;
    const load = () => loadSyncState(cfg).then(s => setConflicts(s.conflicts)).catch(() => {});
    void load(); return onEvent<string>("setting-changed", k => { if (k === stateKey(cfg)) void load(); });
  }, [cfg.subject, cfg.container, cfg.projectId]);
  async function run(action: () => Promise<unknown>, message?: string) {
    setBusy(true); try { await action(); if (message) toast(message); } catch (e) { toast(errorText(e), "error"); } finally { setBusy(false); }
  }
  async function destinations() { setContainers(await new ProviderClient(await loadConnection(provider)).containers()); }
  return <section className="setting"><div className="setting-icon"><CalendarDays size={20} /></div><div className="setting-body"><h2>{label}</h2><p className="muted">{google ? "Sinkron dua arah tugas pada satu proyek dengan satu daftar Google Tasks: judul, catatan, tanggal, status selesai, dan penghapusan. Jam tenggat Ruangku tetap lokal karena Google Tasks API hanya mendukung tanggal." : "Sinkron dua arah blok jadwal dengan satu kalender Outlook melalui Microsoft Graph. Impor awal mencakup 90 hari lalu hingga 180 hari mendatang. Acara sepanjang hari dan lintas hari tetap dikelola di Outlook."}</p><p>{cfg.connected ? `Terhubung · ${cfg.email}` : "Belum terhubung"}{cfg.lastSync ? ` · Sinkron ${relativeAgo(cfg.lastSync)}` : ""}</p>{cfg.lastError && <p className="text-danger" role="alert">{cfg.lastError}</p>}
    <details open={!cfg.connected}><summary>Konfigurasi akun</summary><Field label={google ? "OAuth Client ID desktop" : "Application (client) ID Microsoft"}><input value={clientId || cfg.clientId} onChange={e => setClientId(e.target.value)} disabled={busy || cfg.connected} /></Field>{google && <Field label="Client secret desktop"><input type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} disabled={busy} /></Field>}<p className="field-hint">{google ? "Aktifkan Google Tasks API dan daftarkan OAuth Desktop app di Google Cloud." : "Daftarkan aplikasi publik/desktop di Microsoft Entra, izinkan akun yang Anda gunakan, dan tambahkan redirect http://localhost pada platform Mobile and desktop applications. Izin: User.Read, Calendars.ReadWrite, offline_access."}</p></details>
    <div className="btn-row">{!cfg.connected ? <button className="btn" disabled={busy || !isDesktop || !(clientId || cfg.clientId)} onClick={() => run(() => exclusive(provider, async () => { const client = new ProviderClient({ ...cfg, clientId: (clientId || cfg.clientId).trim() }); await saveConnection(await client.login(secret)); setSecret(""); await destinations(); }), "Akun terhubung. Pilih tujuan sinkronisasi.")}>Masuk ke {label}</button> : <><button className="btn" disabled={busy} onClick={() => run(destinations)}>Muat daftar {google ? "tugas" : "kalender"}</button><button className="btn" disabled={busy} onClick={() => run(() => exclusive(provider, async () => { await saveConnection({ ...cfg, connected: false }); await new ProviderClient(cfg).disconnect(); }))}>Lepas koneksi</button></>}</div>
    {cfg.connected && <><div className="form-row"><Field label={google ? "Daftar Google Tasks" : "Kalender Outlook"}><select value={container || cfg.container || ""} disabled={busy || !!cfg.container} onChange={e => setContainer(e.target.value)}><option value="">Pilih tujuan</option>{cfg.container && !containers.some(c => c.id === cfg.container) && <option value={cfg.container}>Tujuan tersimpan</option>}{containers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field><Field label="Proyek Ruangku"><select value={project || cfg.projectId || ""} disabled={busy || !!cfg.projectId} onChange={e => setProject(e.target.value)}><option value="">Pilih proyek</option>{projects.items.filter(p => !p.archived).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field></div><p className="field-hint">Perubahan dan penghapusan ikut diterapkan pada kedua sisi. Jika keduanya berubah, pilih versi di bawah sebelum sinkron dilanjutkan. Gunakan proyek dan daftar khusus untuk menghindari bercampurnya data.</p><button className="btn btn-primary" disabled={busy || !(container || cfg.container) || !(project || cfg.projectId)} onClick={() => run(async () => { await exclusive(provider, () => saveConnection({ ...cfg, container: cfg.container || container, projectId: cfg.projectId || project })); await runExternal(provider); }, "Sinkron selesai. Periksa konflik jika ada.")}>{busy ? "Memproses…" : "Sinkronkan sekarang"}</button><p className="field-hint">Sinkron otomatis setiap 10 menit saat Ruangku terbuka.</p></>}
    {conflicts.length > 0 && <div className="sync-box"><h3>{conflicts.length} perubahan perlu dipilih</h3>{conflicts.map(c => <div key={c.localId}><b>{c.title}</b><pre className="update-notes">{JSON.stringify({ Ruangku: c.local, [label]: c.remote }, null, 2)}</pre><div className="btn-row">{(["local", "remote"] as const).map(choice => <button key={choice} className="btn btn-sm" disabled={busy} onClick={() => run(async () => { await resolveConflict(cfg, c.localId, choice); await runExternal(provider); })}>Gunakan {choice === "local" ? "Ruangku" : label}</button>)}</div></div>)}</div>}
  </div></section>;
}
export function ExternalSettings() { return <><Connector provider="google-tasks" /><Connector provider="outlook" /></>; }
