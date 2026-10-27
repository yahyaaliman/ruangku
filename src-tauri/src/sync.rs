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
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

pub fn run(
    conn: &mut Connection,
    folder: &Path,
    device_id: &str,
    device_name: &str,
) -> Result<SyncReport, String> {
    if !folder.is_dir() {
        return Err(format!("Folder sinkronisasi tidak ditemukan: {}", folder.display()));
    }
    let dir = sync_dir(folder);
    fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat {}: {e}", dir.display()))?;

    let mut report = SyncReport::default();

    // 1. Tarik perubahan dari perangkat lain.
    let own = device_file(&dir, device_id);
    let entries = fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if path == own || !name.starts_with("device-") || !name.ends_with(".json") {
            continue;
        }
        match read_snapshot(&path) {
            Ok(snap) => {
                report.devices_read += 1;
                report.records_pulled += db::merge(conn, &snap.records).map_err(|e| e.to_string())?;
            }
            // File yang sedang diunggah cloud bisa terbaca setengah; coba lagi nanti.
            Err(e) => report.warnings.push(format!("{name}: {e}")),
        }
    }

    // 2. Dorong keadaan lokal (sudah termasuk hasil merge) ke file milik perangkat ini.
    let records = db::all(conn).map_err(|e| e.to_string())?;
    report.records_pushed = records.len();
    let snap = Snapshot {
        format: 1,
        device_id: device_id.to_string(),
        device_name: device_name.to_string(),
        written_at: db::now_ms(),
        records,
    };
    let bytes = serde_json::to_vec_pretty(&snap).map_err(|e| e.to_string())?;
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
}
