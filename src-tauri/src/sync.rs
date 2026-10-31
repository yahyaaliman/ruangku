//! Sinkronisasi lewat folder cloud (OneDrive, Google Drive for Desktop,
//! Dropbox, dsb.).
//!
//! Database SQLite tidak pernah ditaruh langsung di folder cloud karena bisa
//! rusak saat diunggah setengah jalan. Sebagai gantinya tiap perangkat menulis
//! snapshot JSON miliknya sendiri: `<folder>/Ruangku-Sync/device-<id>.json`.
//! Saat sinkronisasi, aplikasi membaca snapshot perangkat lain lalu
//! menggabungkannya per record (yang `updated_at`-nya lebih baru menang).
//! Karena tiap perangkat hanya menulis file miliknya, tidak ada dua perangkat
//! yang menimpa file yang sama.

use crate::db::{self, Record};
use crate::snapshot_crypto;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

pub const SYNC_DIR: &str = "Ruangku-Sync";

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub format: u32,
    pub device_id: String,
    pub device_name: String,
    pub written_at: i64,
    pub records: Vec<Record>,
}

#[derive(Debug, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub devices_read: usize,
    pub records_pulled: usize,
    pub records_pushed: usize,
    pub finished_at: i64,
    pub warnings: Vec<String>,
}

pub fn sync_dir(folder: &Path) -> PathBuf {
    folder.join(SYNC_DIR)
}

fn device_file(dir: &Path, device_id: &str) -> PathBuf {
    dir.join(format!("device-{device_id}.json"))
}

/// Tulis file secara atomik: tulis ke file sementara lalu ganti nama.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

pub fn read_snapshot(path: &Path) -> Result<Snapshot, String> {
    let text = fs::read_to_string(path).map_err(|e| e.to_string())?;
    parse_snapshot(&text)
}

pub fn run(
    conn: &mut Connection,
    folder: &Path,
    device_id: &str,
    device_name: &str,
) -> Result<SyncReport, String> {
    run_protected(conn, folder, device_id, device_name, None)
}

pub fn run_protected(conn: &mut Connection, folder: &Path, device_id: &str, device_name: &str, password: Option<&str>) -> Result<SyncReport, String> {
    if !folder.is_dir() {
        return Err(format!("Folder sinkronisasi tidak ditemukan: {}", folder.display()));
    }
    let dir = sync_dir(folder);
    fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat {}: {e}", dir.display()))?;

    let mut report = SyncReport::default();

    // 1. Tarik perubahan dari perangkat lain.
    let own = device_file(&dir, device_id);
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    let mut snapshots = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("device-") || !name.ends_with(".json") { continue; }
        let text = bounded_text(&path)?;
        let encrypted = snapshot_crypto::is_encrypted(&text);
        if encrypted || password.is_some() {
            let password = password.ok_or("Folder berisi snapshot terenkripsi. Aktifkan enkripsi dengan kata sandi yang sama.")?;
            if !encrypted { return Err("Snapshot lama belum terenkripsi. Jalankan konversi snapshot di pengaturan.".into()); }
            let plain = snapshot_crypto::decrypt(&text, password)?;
            let snap = parse_snapshot(&plain)?;
            if path != own { snapshots.push(snap); }
        } else if path != own {
            match parse_snapshot(&text) {
                Ok(snap) => snapshots.push(snap),
                Err(e) => report.warnings.push(format!("{name}: {e}")),
            }
        }
    }
    // Authenticate all files before any merge or write (wrong passwords never overwrite data).
    for snap in snapshots {
        report.devices_read += 1;
        let records = crate::personal_sync::filter(conn, &snap.records).map_err(|e| e.to_string())?;
        report.records_pulled += db::merge(conn, &records).map_err(|e| e.to_string())?;
    }

    // 2. Dorong keadaan lokal (sudah termasuk hasil merge) ke file milik perangkat ini.
    let records = crate::personal_sync::filter(conn, &db::all(conn).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    report.records_pushed = records.len();
    let snap = Snapshot {
        format: 1,
        device_id: device_id.to_string(),
        device_name: device_name.to_string(),
        written_at: db::now_ms(),
        records,
    };
    let plain = serde_json::to_string(&snap).map_err(|e| e.to_string())?;
    let text = match password { Some(p) => snapshot_crypto::encrypt(&plain, p)?, None => plain };
    let bytes = text.into_bytes();
    write_atomic(&own, &bytes).map_err(|e| format!("Gagal menulis snapshot: {e}"))?;

    report.finished_at = db::now_ms();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn two_devices_converge() {
        let cloud = tempfile::tempdir().unwrap();
        let mut a = db::open_in_memory().unwrap();
        let mut b = db::open_in_memory().unwrap();

        db::upsert(&a, "n1", "note", json!({"title": "dari A"})).unwrap();
        db::upsert(&b, "n2", "note", json!({"title": "dari B"})).unwrap();

        run(&mut a, cloud.path(), "A", "Laptop").unwrap();
        let rb = run(&mut b, cloud.path(), "B", "PC").unwrap();
        assert_eq!(rb.records_pulled, 1);
        let ra = run(&mut a, cloud.path(), "A", "Laptop").unwrap();
        assert_eq!(ra.records_pulled, 1);

        assert_eq!(db::list(&a, "note").unwrap().len(), 2);
        assert_eq!(db::list(&b, "note").unwrap().len(), 2);

        // Penghapusan di B ikut terhapus di A.
        std::thread::sleep(std::time::Duration::from_millis(5));
        db::remove(&b, "n1").unwrap();
        run(&mut b, cloud.path(), "B", "PC").unwrap();
        run(&mut a, cloud.path(), "A", "Laptop").unwrap();
        assert_eq!(db::list(&a, "note").unwrap().len(), 1);
    }

    #[test]
    fn corrupt_file_is_a_warning_not_a_failure() {
        let cloud = tempfile::tempdir().unwrap();
        let dir = sync_dir(cloud.path());
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("device-X.json"), b"{ setengah").unwrap();
        let mut a = db::open_in_memory().unwrap();
        let r = run(&mut a, cloud.path(), "A", "Laptop").unwrap();
        assert_eq!(r.warnings.len(), 1);
        assert!(dir.join("device-A.json").exists());
    }

    #[test]
    fn missing_folder_errors() {
        let mut a = db::open_in_memory().unwrap();
        assert!(run(&mut a, Path::new("/tidak/ada/folder"), "A", "x").is_err());
    }
    #[test]
    fn wrong_password_never_merges_or_overwrites_and_migration_is_retryable() {
        let cloud = tempfile::tempdir().unwrap();
        let mut a = db::open_in_memory().unwrap();
        db::upsert(&a, "secret", "note", json!({"title":"Private"})).unwrap();
        run(&mut a, cloud.path(), "A", "A").unwrap();
        let key = "correct horse battery staple";
        assert!(run_protected(&mut a, cloud.path(), "A", "A", Some(key)).is_err());
        assert_eq!(migrate(cloud.path(), key).unwrap(), 1);
        assert_eq!(migrate(cloud.path(), key).unwrap(), 0);
        let file = sync_dir(cloud.path()).join("device-A.json");
        let before = fs::read(&file).unwrap();
        let mut b = db::open_in_memory().unwrap();
        assert!(run_protected(&mut b, cloud.path(), "A", "A", Some("wrong password value")).is_err());
        assert!(db::all(&b).unwrap().is_empty());
        assert_eq!(fs::read(&file).unwrap(), before);
        run_protected(&mut b, cloud.path(), "B", "B", Some(key)).unwrap();
        assert!(db::get(&b, "secret").unwrap().is_some());
    }
}

fn parse_snapshot(text: &str) -> Result<Snapshot, String> {
    let snapshot: Snapshot = serde_json::from_str(text).map_err(|e| e.to_string())?;
    if snapshot.format != 1 || snapshot.device_id.is_empty() { return Err("Format snapshot tidak didukung.".into()); }
    Ok(snapshot)
}
fn bounded_text(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let mut text = String::new();
    fs::File::open(path).map_err(|e| e.to_string())?.take(32 * 1024 * 1024 + 1).read_to_string(&mut text).map_err(|e| e.to_string())?;
    if text.len() > 32 * 1024 * 1024 { return Err("Snapshot terlalu besar.".into()); }
    Ok(text)
}
/// Explicit migration only, while other devices are paused. Already encrypted files
/// are authenticated and left unchanged, so retrying after interruption is safe.
pub fn migrate(folder: &Path, password: &str) -> Result<usize, String> {
    let dir = sync_dir(folder);
    if !dir.exists() { return Ok(0); }
    let mut pending = Vec::new();
    for entry in fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with("device-") || !name.ends_with(".json") { continue; }
        let text = bounded_text(&entry.path())?;
        if snapshot_crypto::is_encrypted(&text) { parse_snapshot(&snapshot_crypto::decrypt(&text, password)?)?; }
        else { parse_snapshot(&text)?; pending.push((entry.path(), snapshot_crypto::encrypt(&text, password)?)); }
    }
    let count = pending.len();
    for (path, text) in pending { write_atomic(&path, text.as_bytes()).map_err(|e| e.to_string())?; }
    Ok(count)
}
