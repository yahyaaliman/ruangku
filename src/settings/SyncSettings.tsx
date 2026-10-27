// Sinkronisasi lewat folder cloud (OneDrive, Google Drive, Dropbox).
import { Cloud, FolderOpen, RefreshCw } from "lucide-react";
import { api, errorText, pickFolder } from "../lib/api";
import type { SyncStatus } from "../lib/types";
import { dateShort, relativeAgo, time } from "../lib/date";
import { useToast } from "../components/ui";

export type Sync = { status: SyncStatus | null; busy: boolean; syncNow: () => Promise<void>; refresh: () => void };

export function SyncSettings({ sync }: { sync: Sync }) {
  const toast = useToast();
  const s = sync.status;
  const chooseFolder = async () => {
    const f = await pickFolder("Pilih folder cloud (OneDrive, Google Drive, Dropbox)");
    if (!f) return;
    await api.setSetting("sync_folder", f);
    sync.refresh();
    try {
      await sync.syncNow();
      toast("Folder sinkronisasi diatur dan sinkronisasi pertama selesai");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const disconnect = async () => {
    await api.setSetting("sync_folder", "");
    sync.refresh();
    toast("Sinkronisasi dimatikan. Data lokal tetap ada.");
  };
  const doSync = async () => {
    try {
      await sync.syncNow();
      toast("Sinkronisasi selesai");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  return (
  <section className="setting">
    <div className="setting-icon"><Cloud size={20} /></div>
    <div className="setting-body">
      <h2>Sinkronisasi cloud</h2>
      <p className="muted">
        Pilih folder yang sudah disinkronkan oleh OneDrive, Google Drive for Desktop, atau Dropbox. Ruangku membuat subfolder <code>Ruangku-Sync</code> di sana. Pilih folder yang sama di
        komputer lain, dan data akan saling melengkapi setiap 3 menit serta setelah Anda mengubah sesuatu.
      </p>
      {s?.folder ? (
        <div className="sync-box">
          <div>
            <span className="muted small">Folder</span>
            <p className="break">{s.folder}</p>
          </div>
          <div>
            <span className="muted small">Status</span>
            <p className={s.lastError ? "text-danger" : ""}>
              {s.lastError ? s.lastError : s.lastSync ? `Tersinkron ${relativeAgo(s.lastSync)} (${dateShort(s.lastSync)} ${time(s.lastSync)})` : "Belum pernah sinkron"}
            </p>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" onClick={doSync} disabled={sync.busy}>
              <RefreshCw size={15} className={sync.busy ? "spin" : ""} /> Sinkronkan sekarang
            </button>
            <button className="btn" onClick={chooseFolder}><FolderOpen size={15} /> Ganti folder</button>
            <button className="btn" onClick={disconnect}>Matikan sinkronisasi</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-primary" onClick={chooseFolder}><FolderOpen size={15} /> Pilih folder cloud</button>
      )}
      {s && <p className="muted small">Perangkat ini: {s.deviceName} (ID {s.deviceId})</p>}
      <p className="muted small">
        Perubahan digabung per kolom: bila judul diubah di satu komputer dan tenggat di komputer lain, keduanya tersimpan. Hanya bila kolom yang sama diubah di dua komputer sebelum sempat tersinkron, perubahan paling akhir yang dipakai. Pastikan jam di kedua komputer sudah benar.
      </p>
    </div>
  </section>
  );
}
