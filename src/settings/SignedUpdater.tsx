import { useEffect, useState } from "react";
import { api, errorText, isDesktop, onEvent } from "../lib/api";
import { Confirm, useToast } from "../components/ui";

export interface SignedUpdate { configured: boolean; version: string | null; notes: string | null }
export function SignedUpdater() {
  const [info, setInfo] = useState<SignedUpdate>();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState("");
  const toast = useToast();
  useEffect(() => onEvent<{ received: number; total?: number; stage: string }>("updater-progress", p => setStatus(p.stage === "install" ? "Tanda tangan valid. Memasang pembaruan…" : `Mengunduh ${p.total ? Math.min(100, Math.round(p.received / p.total * 100)) + "%" : Math.round(p.received / 1024) + " KB"}…`)), []);
  async function check() {
    setBusy(true); setInfo(undefined); setStatus("Memeriksa pembaruan resmi…");
    try { const i = await api.updaterCheck(); setInfo(i); setStatus(i.configured ? i.version ? `Versi ${i.version} tersedia.` : "Versi ini sudah yang terbaru." : "Pembaruan dalam aplikasi belum diaktifkan untuk build ini. Pengelola perlu memasang kunci verifikasi saat build."); }
    catch (e) { setStatus(errorText(e)); } finally { setBusy(false); }
  }
  async function install() {
    setConfirm(false); setBusy(true); setStatus("Menyiapkan unduhan…");
    try { await api.updaterInstall(info!.version!); setStatus("Pembaruan terpasang. Mulai ulang Ruangku."); }
    catch (e) { setStatus("Pembaruan gagal; versi terpasang tetap dapat digunakan."); toast(errorText(e), "error"); }
    finally { setBusy(false); }
  }
  return <div className="update-box"><h3>Pasang pembaruan langsung</h3><p className="muted">Ruangku memverifikasi tanda tangan rilis sebelum pemasangan. Aplikasi akan ditutup dan dibuka kembali oleh installer.</p><div className="btn-row"><button className="btn" onClick={check} disabled={busy || !isDesktop}>Periksa rilis resmi</button>{info?.version && <button className="btn btn-primary" disabled={busy} onClick={() => setConfirm(true)}>Unduh & pasang {info.version}</button>}</div><p role="status">{isDesktop ? status : "Tersedia di aplikasi desktop."}</p>{info?.notes && <pre className="update-notes">{info.notes}</pre>}{confirm && <Confirm title="Pasang pembaruan?" text={`Simpan pekerjaan yang sedang Anda ketik. Ruangku akan ditutup untuk memasang versi ${info?.version}.`} confirmLabel="Unduh & pasang" onConfirm={install} onClose={() => setConfirm(false)} />}</div>;
}
