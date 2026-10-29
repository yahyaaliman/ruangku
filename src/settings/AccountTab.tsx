import { useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { api, errorText, isDesktop } from "../lib/api";
import { relativeAgo } from "../lib/date";
import { useToast } from "../components/ui";
import { connectAccount, disconnectAccount, runAccountSync, useAccount } from "../account/useAccount";

export function AccountTab() {
  const cfg = useAccount();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await fn(); toast(message); } catch (e) { toast(errorText(e), "error"); } finally { setBusy(false); }
  };
  const id = clientId || cfg.clientId || import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
  return <section className="setting">
    <div className="setting-icon"><Cloud size={20} /></div>
    <div className="setting-body">
      <h2>Akun Google & sinkronisasi</h2>
      <p className="muted">Masuk dengan akun Google yang sama di setiap komputer. Ruang, catatan, tugas, jadwal, dan pengaturan tampilan disimpan di data aplikasi Google Drive Anda dan digabung otomatis saat Ruangku terbuka.</p>
      <div className="sync-box" aria-live="polite">
        <strong>{cfg.email || "Belum masuk"}</strong>
        <p>{cfg.connected ? (cfg.lastSync ? `Sinkron terakhir ${relativeAgo(cfg.lastSync)}` : "Terhubung. Menunggu sinkronisasi pertama.") : "Sinkronisasi nonaktif. Data lokal tetap tersedia."}</p>
        {cfg.lastError && <p className="text-danger" role="alert">{cfg.lastError}</p>}
      </div>
      {!isDesktop && <p className="muted">Pratinjau browser: buka aplikasi desktop untuk masuk dengan Google.</p>}
      <div className="btn-row">
        <button className="btn btn-primary" disabled={busy || !isDesktop || !id.trim()} onClick={() => run(async () => {
          await connectAccount(id, secret || import.meta.env.VITE_GOOGLE_CLIENT_SECRET || "");
          setSecret("");
          await runAccountSync();
        }, "Akun terhubung dan data tersinkron.")}>{busy ? "Memproses…" : cfg.connected ? "Masuk ulang dengan Google" : "Masuk dengan Google"}</button>
        {cfg.connected && <>
          <button className="btn" disabled={busy} onClick={() => run(runAccountSync, "Data dan pengaturan tersinkron.")}><RefreshCw size={15} /> Sinkronkan sekarang</button>
          <button className="btn" disabled={busy} onClick={() => run(disconnectAccount, "Keluar dari Google. Data lokal tetap tersimpan.")}>Keluar</button>
        </>}
      </div>
      <p className="muted small">Sinkron setiap 3 menit dan setelah perubahan. Tema, ikon ruang, tata letak dasbor, dan ukuran kalender ikut tersimpan. File di komputer, koneksi layanan, serta kunci API tidak ikut diunggah. Ini tidak menyinkronkan acara dengan Google Calendar.</p>
      {cfg.subject && <p className="muted small">Data pada perangkat ini terhubung ke {cfg.email}. Gunakan akun yang sama saat masuk kembali.</p>}
      <details open={!id}>
        <summary>Konfigurasi Google (sekali untuk aplikasi)</summary>
        <p className="muted small">Aktifkan Google Drive API dan buat OAuth client bertipe Desktop app di Google Cloud. Gunakan konfigurasi aplikasi yang sama di semua perangkat. Jika aplikasi masih berstatus Testing, tambahkan akun Anda sebagai test user.</p>
        <label className="field">Client ID<input value={clientId || cfg.clientId} onChange={e => setClientId(e.target.value)} placeholder="…apps.googleusercontent.com" disabled={busy} /></label>
        <label className="field">Client secret desktop<input type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} placeholder="Isi dari konfigurasi OAuth desktop" disabled={busy} /></label>
        <button className="link" onClick={() => api.openUrl("https://console.cloud.google.com/apis/credentials")}>Buka konfigurasi Google Cloud</button>
      </details>
    </div>
  </section>;
}
