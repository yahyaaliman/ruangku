import { useEffect, useState } from "react";
import { LockKeyhole } from "lucide-react";
import { api, errorText, isDesktop, onEvent } from "../lib/api";
import { migrateAccountSnapshots } from "../account/useAccount";
import { useToast } from "../components/ui";

export function SnapshotEncryption() {
  const [enabled, setEnabled] = useState(false), [password, setPassword] = useState(""), [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false), [paused, setPaused] = useState(false);
  const toast = useToast();
  useEffect(() => {
    const load = () => api.getSetting("snapshot_encryption").then(v => setEnabled(v === "true"));
    void load(); return onEvent<string>("setting-changed", k => { if (k === "snapshot_encryption") void load(); });
  }, []);
  async function enable() {
    setBusy(true);
    try { await api.snapshotUnlock(password); setPassword(""); setAgain(""); toast("Enkripsi aktif pada perangkat ini. Konversikan snapshot lama sebelum sinkronisasi."); }
    catch (e) { toast(errorText(e), "error"); } finally { setBusy(false); }
  }
  async function migrate() {
    setBusy(true);
    try { const folder = await api.snapshotMigrateFolder(); const drive = await migrateAccountSnapshots(); toast(`${folder + drive} snapshot lama dienkripsi. Perangkat lain kini memerlukan kata sandi yang sama.`); }
    catch (e) { toast(errorText(e), "error"); } finally { setBusy(false); }
  }
  return <section className="setting"><div className="setting-icon"><LockKeyhole size={20} /></div><div className="setting-body"><h2>Enkripsi snapshot sinkronisasi</h2><p className="muted">{enabled ? "Aktif pada perangkat ini." : "Belum aktif."} Melindungi isi snapshot folder cloud dan akun Google dengan kata sandi. Gunakan kata sandi yang sama pada setiap perangkat.</p><p className="muted small">Kata sandi disimpan di Windows Credential Manager. Database dan backup lokal tetap mengikuti perlindungan perangkat. Simpan kata sandi sendiri: tidak ada pemulihan kata sandi. Riwayat versi lama di penyedia cloud tidak dapat dihapus oleh konversi ini.</p><div className="form-row"><label className="field">Kata sandi (minimal 12 karakter)<input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label><label className="field">Ulangi kata sandi<input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} disabled={busy} /></label></div><button className="btn" disabled={busy || !isDesktop || password.length < 12 || password !== again} onClick={enable}>{enabled ? "Buka dengan kata sandi yang sama" : "Aktifkan enkripsi"}</button>{enabled && <div className="sync-box"><p>Untuk snapshot lama, tutup Ruangku di perangkat lain dan tunggu folder cloud selesai tersinkron sebelum konversi. Setelahnya, perbarui semua perangkat dan aktifkan enkripsi sebelum melanjutkan.</p><label><input type="checkbox" checked={paused} onChange={e => setPaused(e.target.checked)} /> Perangkat lain sudah dijeda</label><button className="btn btn-primary" disabled={!paused || busy} onClick={migrate}>{busy ? "Memproses…" : "Enkripsi snapshot lama"}</button></div>}</div></section>;
}
