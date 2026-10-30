import { SignedUpdater } from "./SignedUpdater";
// Pengaturan keandalan: backup otomatis & pemulihan, penyimpanan rahasia, pembaruan, log & diagnostik.
import { useCallback, useEffect, useState } from "react";
import { ArchiveRestore, Copy, Download, ExternalLink, FolderOpen, HardDriveDownload, RefreshCw, ShieldCheck, Stethoscope, Upload } from "lucide-react";
import { api, BackupInfo, Diagnostics, errorText, isDesktop, onEvent, pickOpenPath, pickSavePath } from "../lib/api";
import { dateKey, relativeAgo } from "../lib/date";
import { Confirm, useToast } from "../components/ui";
import { compareVersions, latestRelease, Release, UPDATE_REPO_KEY, validRepo } from "../lib/update";

const fmtBytes = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** "otomatis-20261027-020000.json" → tanggal yang terbaca. */
function backupLabel(b: BackupInfo): { kind: string; when: string } {
  const m = /^(otomatis|manual|sebelum-pulihkan)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/.exec(b.name);
  const kind = m?.[1] === "otomatis" ? "Otomatis" : m?.[1] === "manual" ? "Manual" : m?.[1] === "sebelum-pulihkan" ? "Sebelum pemulihan" : "Berkas";
  const when = m ? new Date(+m[2], +m[3] - 1, +m[4], +m[5], +m[6]).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }) : new Date(b.modified).toLocaleString("id-ID");
  return { kind, when };
}

export function BackupSettings() {
  const toast = useToast();
  const [list, setList] = useState<BackupInfo[]>([]);
  const [auto, setAuto] = useState(true);
  const [keep, setKeep] = useState(14);
  const [restore, setRestore] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setList(await api.backupsList().catch(() => []));
    setAuto((await api.getSetting("auto_backup")) !== "off");
    setKeep(Number((await api.getSetting("backup_keep")) ?? 14) || 14);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const exportBackup = async () => {
    const p = await pickSavePath("Simpan backup", `ruangku-backup-${dateKey()}.json`);
    if (!p) return;
    try {
      toast(`Backup tersimpan, ${await api.backupExport(p)} data`);
    } catch (e) {
      toast(errorText(e), "error");
    }
  };
  const importBackup = async () => {
    const p = await pickOpenPath("Pilih file backup Ruangku");
    if (!p) return;
    try {
      const n = await api.backupImport(p);
      toast(n ? `${n} data digabungkan dari backup` : "Tidak ada data yang lebih baru di backup ini");
    } catch (e) {
      toast(errorText(e), "error");
    }
  };

  return (
    <section className="setting">
      <div className="setting-icon">
        <HardDriveDownload size={20} />
      </div>
      <div className="setting-body">
        <h2>Backup & pemulihan</h2>
        <p className="muted">Ruangku membuat salinan seluruh data sekali sehari di folder aplikasi. Bila terjadi kesalahan (misalnya data terhapus), pulihkan ke salah satu titik di bawah. Sebelum memulihkan, keadaan sekarang disimpan dulu sehingga bisa dibatalkan.</p>
        <div className="set-row">
          <label className="check-row">
            <input
              type="checkbox"
              checked={auto}
              onChange={async (e) => {
                setAuto(e.target.checked);
                await api.setSetting("auto_backup", e.target.checked ? "on" : "off");
              }}
            />
            Backup otomatis harian
          </label>
          <label className="inline-field">
            Simpan
            <select
              value={keep}
              disabled={!auto}
              onChange={async (e) => {
                setKeep(Number(e.target.value));
                await api.setSetting("backup_keep", e.target.value);
              }}
            >
              {[7, 14, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} terakhir
                </option>
              ))}
            </select>
          </label>
        </div>
        {list.length > 0 ? (
          <ul className="backup-list">
            {list.slice(0, 8).map((b) => {
              const l = backupLabel(b);
              return (
                <li key={b.name}>
                  <span className={`backup-kind ${b.auto ? "auto" : ""}`}>{l.kind}</span>
                  <span className="backup-when">{l.when}</span>
                  <span className="muted small">{fmtBytes(b.size)}</span>
                  <button className="btn btn-sm" onClick={() => setRestore(b)}>
                    <ArchiveRestore size={14} /> Pulihkan
                  </button>
                </li>
              );
            })}
            {list.length > 8 && <li className="muted small">+{list.length - 8} backup lebih lama di folder</li>}
          </ul>
        ) : (
          <p className="muted small">{isDesktop ? "Belum ada backup. Backup otomatis pertama dibuat beberapa menit setelah aplikasi dibuka." : "Backup otomatis berjalan di aplikasi desktop."}</p>
        )}
        <div className="btn-row">
          <button
            className="btn"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const n = await api.backupNow();
                toast(`Backup dibuat: ${n}`);
                load();
              } catch (e) {
                toast(errorText(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            <HardDriveDownload size={15} /> Backup sekarang
          </button>
          <button className="btn" onClick={async () => api.reveal(await api.backupsDir())}>
            <FolderOpen size={15} /> Buka folder backup
          </button>
          <button className="btn" onClick={exportBackup}>
            <Download size={15} /> Simpan ke file…
          </button>
          <button className="btn" onClick={importBackup}>
            <Upload size={15} /> Gabungkan dari file…
          </button>
        </div>
      </div>
      {restore && (
        <Confirm
          title="Pulihkan backup?"
          text={`Seluruh data akan dikembalikan seperti pada ${backupLabel(restore).when}. Perubahan setelah itu hilang (keadaan sekarang disimpan dulu sebagai backup "Sebelum pemulihan"). Perangkat lain yang tersinkron ikut mengikuti.`}
          confirmLabel="Pulihkan"
          onClose={() => setRestore(null)}
          onConfirm={async () => {
            const b = restore;
            setRestore(null);
            try {
              const n = await api.backupRestore(b.name);
              toast(`Data dipulihkan (${n} perubahan)`);
              load();
            } catch (e) {
              toast(errorText(e), "error");
            }
          }}
        />
      )}
    </section>
  );
}

export function SecurityUpdateSettings() {
  const toast = useToast();
  const [store, setStore] = useState("");
  const [version, setVersion] = useState("");
  const [repo, setRepo] = useState("");
  const [rel, setRel] = useState<Release | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    api.secretStore().then(setStore).catch(() => {});
    api.diagnostics().then((d) => setVersion(d.version)).catch(() => {});
    api.getSetting(UPDATE_REPO_KEY).then((r) => setRepo(r ?? ""));
  }, []);

  const check = async () => {
    if (!validRepo(repo)) return toast('Isi repo GitHub dengan format "pemilik/nama-repo"', "error");
    setChecking(true);
    try {
      await api.setSetting(UPDATE_REPO_KEY, repo.trim());
      const r = await latestRelease(repo);
      setRel(r);
      if (compareVersions(r.version, version) <= 0) toast(`Ruangku ${version} sudah versi terbaru`);
    } catch (e) {
      toast(`Gagal memeriksa: ${errorText(e)}`, "error");
    } finally {
      setChecking(false);
    }
  };
  const newer = rel && compareVersions(rel.version, version) > 0;

  return (
    <>
      <section className="setting">
        <div className="setting-icon">
          <ShieldCheck size={20} />
        </div>
        <div className="setting-body">
          <h2>Keamanan</h2>
          <p className="muted">
            Kunci API asisten AI, token bot Telegram/WhatsApp, sandi aplikasi Gmail, token server tim, dan login Google Calendar disimpan di <b>{store || "penyimpanan aman"}</b>, bukan di file pengaturan biasa, dan tidak pernah ikut sinkronisasi folder cloud. Pengaturan lama dipindahkan otomatis.
          </p>
        </div>
      </section>

      <section className="setting">
        <div className="setting-icon">
          <RefreshCw size={20} />
        </div>
        <div className="setting-body">
          <h2>Pembaruan aplikasi</h2>
          <SignedUpdater />
          <p className="muted">Versi terpasang: <b>{version || "–"}</b>. Isi repo GitHub tempat installer Ruangku dirilis (lihat panduan build di README); Ruangku memeriksanya sekali sehari dan memberi tahu bila ada versi baru.</p>
          <div className="set-row">
            <input className="grow" value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="pemilik/ruangku" aria-label="Repo GitHub" />
            <button className="btn" onClick={check} disabled={checking}>
              <RefreshCw size={15} className={checking ? "spin" : ""} /> Periksa sekarang
            </button>
          </div>
          {rel && (
            <div className={`update-box ${newer ? "new" : ""}`}>
              <p>
                <b>{newer ? `Versi ${rel.version} tersedia` : `Terbaru di GitHub: ${rel.version}`}</b>
                {rel.publishedAt && <span className="muted small"> · dirilis {relativeAgo(Date.parse(rel.publishedAt))}</span>}
              </p>
              {newer && rel.notes && <pre className="update-notes">{rel.notes}</pre>}
              {newer && (
                <div className="btn-row">
                  {rel.installer && (
                    <button className="btn btn-primary" onClick={() => api.openUrl(rel.installer!)}>
                      <Download size={15} /> Unduh installer
                    </button>
                  )}
                  <button className="btn" onClick={() => api.openUrl(rel.url)}>
                    <ExternalLink size={15} /> Lihat rilis
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export function DiagnosticsSettings() {
  const toast = useToast();
  const [d, setD] = useState<Diagnostics | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    api.diagnostics().then(setD).catch(() => {});
    api.logTail(120).then(setLog).catch(() => {});
  }, []);
  useEffect(() => {
    if (!open) return;
    load();
    return onEvent("sync-done", load);
  }, [open, load]);

  const text = () =>
    d
      ? [
          `Ruangku ${d.version} (${d.os}/${d.arch})`,
          `Folder data: ${d.dataDir}`,
          `Database: ${fmtBytes(d.dbBytes)}, integritas: ${d.integrity}`,
          `Data: ${d.records.map(([k, n]) => `${k} ${n}`).join(", ")}; terhapus ${d.tombstones}`,
          `Backup: ${d.backups}${d.lastBackup ? ` (terakhir ${d.lastBackup})` : ""}`,
          `Rahasia: ${d.secretStore}`,
          "",
          ...log.slice(-60),
        ].join("\n")
      : "";

  return (
    <section className="setting">
      <div className="setting-icon">
        <Stethoscope size={20} />
      </div>
      <div className="setting-body">
        <h2>Log & diagnostik</h2>
        <p className="muted">Catatan kejadian penting (backup, sinkronisasi, galat bot/Google) untuk membantu mencari masalah. Tidak berisi isi catatan atau kunci rahasia.</p>
        {!open ? (
          <button className="btn" onClick={() => setOpen(true)}>
            <Stethoscope size={15} /> Tampilkan diagnostik
          </button>
        ) : (
          <>
            {d && (
              <dl className="diag">
                <dt>Versi</dt>
                <dd>
                  {d.version} · {d.os}/{d.arch}
                </dd>
                <dt>Database</dt>
                <dd>
                  {fmtBytes(d.dbBytes)} · pemeriksaan: <b className={d.integrity === "ok" ? "ok" : "bad"}>{d.integrity === "ok" ? "baik" : d.integrity}</b>
                </dd>
                <dt>Isi</dt>
                <dd>{d.records.map(([k, n]) => `${k} ${n}`).join(" · ") || "kosong"}</dd>
                <dt>Backup</dt>
                <dd>
                  {d.backups} berkas{d.lastBackup ? ` · terakhir ${d.lastBackup}` : ""}
                </dd>
                <dt>Folder data</dt>
                <dd className="mono">{d.dataDir}</dd>
              </dl>
            )}
            <pre className="log-box" aria-label="Log terakhir">{log.length ? log.join("\n") : "Log masih kosong."}</pre>
            <div className="btn-row">
              <button className="btn" onClick={load}>
                <RefreshCw size={15} /> Muat ulang
              </button>
              <button
                className="btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(text());
                    toast("Info diagnostik disalin");
                  } catch {
                    toast("Gagal menyalin", "error");
                  }
                }}
              >
                <Copy size={15} /> Salin info
              </button>
              {d && (
                <button className="btn" onClick={() => api.reveal(d.dataDir)}>
                  <FolderOpen size={15} /> Buka folder data
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
