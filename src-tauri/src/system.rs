//! Keamanan & keandalan: rahasia di Windows Credential Manager, login OAuth
//! lewat loopback, tulis file teks, backup otomatis berputar, log, dan diagnostik.

use crate::db;
use rusqlite::Connection;
use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

// ---------------------------------------------------------------- Rahasia

const SECRET_PREFIX: &str = "secret:";

#[cfg(windows)]
mod cred {
    use windows_sys::Win32::Foundation::FILETIME;
    use windows_sys::Win32::Security::Credentials::{
        CredDeleteW, CredFree, CredReadW, CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
    };

    const ERROR_NOT_FOUND: i32 = 1168;
    /// Batas ukuran blob Credential Manager (CRED_MAX_CREDENTIAL_BLOB_SIZE).
    const MAX_BLOB: usize = 5 * 512;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    fn target(key: &str) -> Vec<u16> {
        wide(&format!("Ruangku:{key}"))
    }

    pub fn set(key: &str, value: &str) -> Result<(), String> {
        let blob = value.as_bytes();
        if blob.len() > MAX_BLOB {
            return Err("terlalu panjang untuk Credential Manager".into());
        }
        let mut t = target(key);
        let mut user = wide("Ruangku");
        let c = CREDENTIALW {
            Flags: 0,
            Type: CRED_TYPE_GENERIC,
            TargetName: t.as_mut_ptr(),
            Comment: std::ptr::null_mut(),
            LastWritten: FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 },
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_ptr() as *mut u8,
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            AttributeCount: 0,
            Attributes: std::ptr::null_mut(),
            TargetAlias: std::ptr::null_mut(),
            UserName: user.as_mut_ptr(),
        };
        // SAFETY: semua pointer menunjuk ke buffer yang hidup selama pemanggilan.
        let ok = unsafe { CredWriteW(&c, 0) };
        if ok == 0 {
            return Err(format!("CredWriteW gagal: {}", std::io::Error::last_os_error()));
        }
        Ok(())
    }

    pub fn get(key: &str) -> Result<Option<String>, String> {
        let t = target(key);
        let mut p: *mut CREDENTIALW = std::ptr::null_mut();
        // SAFETY: `p` diisi oleh Windows dan dibebaskan dengan CredFree.
        let ok = unsafe { CredReadW(t.as_ptr(), CRED_TYPE_GENERIC, 0, &mut p) };
        if ok == 0 {
            let e = std::io::Error::last_os_error();
            if e.raw_os_error() == Some(ERROR_NOT_FOUND) {
                return Ok(None);
            }
            return Err(format!("CredReadW gagal: {e}"));
        }
        let bytes = unsafe {
            let c = &*p;
            if c.CredentialBlobSize == 0 || c.CredentialBlob.is_null() {
                Vec::new()
            } else {
                std::slice::from_raw_parts(c.CredentialBlob, c.CredentialBlobSize as usize).to_vec()
            }
        };
        unsafe { CredFree(p as *const core::ffi::c_void) };
        Ok(Some(String::from_utf8_lossy(&bytes).into_owned()))
    }

    pub fn delete(key: &str) {
        let t = target(key);
        unsafe { CredDeleteW(t.as_ptr(), CRED_TYPE_GENERIC, 0) };
    }
}

/// Tempat rahasia disimpan di perangkat ini.
pub fn secret_store_name() -> &'static str {
    if cfg!(windows) {
        "Windows Credential Manager"
    } else {
        "database lokal"
    }
}

/// Simpan rahasia. Di Windows ke Credential Manager; bila gagal (atau di OS lain)
/// ke tabel settings lokal (tidak ikut sinkronisasi). Nilai kosong = hapus.
pub fn secret_set(c: &Connection, key: &str, value: &str) -> rusqlite::Result<&'static str> {
    let db_key = format!("{SECRET_PREFIX}{key}");
    if value.is_empty() {
        secret_delete(c, key)?;
        return Ok("dihapus");
    }
    #[cfg(windows)]
    {
        if cred::set(key, value).is_ok() {
            db::set_setting(c, &db_key, "")?;
            return Ok("credman");
        }
    }
    db::set_setting(c, &db_key, value)?;
    Ok("db")
}

pub fn secret_get(c: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    #[cfg(windows)]
    {
        if let Ok(Some(v)) = cred::get(key) {
            return Ok(Some(v));
        }
    }
    Ok(db::get_setting(c, &format!("{SECRET_PREFIX}{key}"))?.filter(|v| !v.is_empty()))
}

pub fn secret_delete(c: &Connection, key: &str) -> rusqlite::Result<()> {
    #[cfg(windows)]
    cred::delete(key);
    db::set_setting(c, &format!("{SECRET_PREFIX}{key}"), "")
}

// ---------------------------------------------------------------- OAuth loopback

#[derive(Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OAuthResult {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
    pub redirect_uri: String,
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = if b[i] == b'%' && i + 2 < b.len() {
            std::str::from_utf8(&b[i + 1..i + 3]).ok().and_then(|h| u8::from_str_radix(h, 16).ok())
        } else {
            None
        };
        match (b[i], hex) {
            (_, Some(v)) => {
                out.push(v);
                i += 2;
            }
            (b'+', _) => out.push(b' '),
            (x, _) => out.push(x),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn pct_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

fn query_param(path: &str, name: &str) -> Option<String> {
    let q = path.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=').unwrap_or((kv, ""));
        (k == name).then(|| pct_decode(v))
    })
}

const OK_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Ruangku</title><body style=\"font:16px system-ui;padding:48px;text-align:center;color:#1c2433\"><h2>Berhasil masuk</h2><p>Silakan kembali ke aplikasi Ruangku. Jendela ini boleh ditutup.</p></body>";
const FAIL_PAGE: &str = "<!doctype html><meta charset=utf-8><title>Ruangku</title><body style=\"font:16px system-ui;padding:48px;text-align:center;color:#1c2433\"><h2>Login dibatalkan</h2><p>Kembali ke Ruangku untuk mencoba lagi.</p></body>";

/// Buka `url` (+ `redirect_uri` loopback) di browser lalu tunggu browser kembali
/// membawa `code`. `open` dipanggil dengan URL lengkap.
pub fn oauth_loopback(url: &str, timeout: Duration, open: impl FnOnce(&str) -> Result<(), String>) -> Result<OAuthResult, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let redirect_uri = format!("http://127.0.0.1:{port}");
    let sep = if url.contains('?') { '&' } else { '?' };
    open(&format!("{url}{sep}redirect_uri={}", pct_encode(&redirect_uri)))?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let deadline = Instant::now() + timeout;
    loop {
        match listener.accept() {
            Ok((stream, _)) => {
                let _ = stream.set_nonblocking(false);
                let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
                let mut reader = BufReader::new(&stream);
                let mut first = String::new();
                if reader.read_line(&mut first).is_err() {
                    continue;
                }
                // Habiskan header permintaan.
                let mut line = String::new();
                while reader.read_line(&mut line).map(|n| n > 2).unwrap_or(false) {
                    line.clear();
                }
                let path = first.split_whitespace().nth(1).unwrap_or("/").to_string();
                let code = query_param(&path, "code");
                let error = query_param(&path, "error");
                let mut w = &stream;
                if code.is_none() && error.is_none() {
                    let _ = w.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                    continue;
                }
                let page = if code.is_some() { OK_PAGE } else { FAIL_PAGE };
                let _ = write!(w, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", page.len(), page);
                let _ = w.flush();
                return Ok(OAuthResult { code, state: query_param(&path, "state"), error, redirect_uri });
            }
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() > deadline {
                    return Err("Waktu menunggu login habis. Coba lagi.".into());
                }
                std::thread::sleep(Duration::from_millis(80));
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

// ---------------------------------------------------------------- Backup otomatis

pub const AUTO_PREFIX: &str = "otomatis-";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub size: u64,
    pub modified: i64,
    pub auto: bool,
}

pub fn backup_dir(app_data: &Path) -> PathBuf {
    app_data.join("backups")
}

/// Tulis snapshot ke folder backup. `label` mis. "otomatis" atau "manual".
pub fn write_backup(dir: &Path, bytes: &[u8], prefix: &str) -> std::io::Result<String> {
    fs::create_dir_all(dir)?;
    let name = format!("{prefix}{}.json", chrono::Local::now().format("%Y%m%d-%H%M%S"));
    let path = dir.join(&name);
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, &path)?;
    Ok(name)
}

pub fn list_backups(dir: &Path) -> Vec<BackupInfo> {
    let mut out: Vec<BackupInfo> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.ends_with(".json") {
                return None;
            }
            let meta = e.metadata().ok()?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
                .unwrap_or(0);
            Some(BackupInfo { auto: name.starts_with(AUTO_PREFIX), name, size: meta.len(), modified })
        })
        .collect();
    out.sort_by(|a, b| b.name.cmp(&a.name));
    out
}

/// Hapus backup otomatis terlama, sisakan `keep` terbaru. Backup manual tidak disentuh.
pub fn rotate(dir: &Path, keep: usize) -> usize {
    let autos: Vec<BackupInfo> = list_backups(dir).into_iter().filter(|b| b.auto).collect();
    let mut removed = 0;
    for b in autos.iter().skip(keep) {
        if fs::remove_file(dir.join(&b.name)).is_ok() {
            removed += 1;
        }
    }
    removed
}

/// Nama file backup aman (tanpa pemisah folder).
pub fn safe_backup_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if name.contains(['/', '\\']) || name.contains("..") || !name.ends_with(".json") {
        return Err("Nama backup tidak valid.".into());
    }
    Ok(dir.join(name))
}

// ---------------------------------------------------------------- Log

const LOG_MAX: u64 = 512 * 1024;

pub fn log_path(app_data: &Path) -> PathBuf {
    app_data.join("logs").join("ruangku.log")
}

/// Tambah satu baris log; file diputar (ruangku.log.1) bila melebihi 512 KB.
pub fn log_write(app_data: &Path, level: &str, msg: &str) {
    let path = log_path(app_data);
    if let Some(p) = path.parent() {
        let _ = fs::create_dir_all(p);
    }
    if fs::metadata(&path).map(|m| m.len() > LOG_MAX).unwrap_or(false) {
        let _ = fs::rename(&path, path.with_extension("log.1"));
    }
    if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(&path) {
        let one_line = msg.replace(['\r', '\n'], " ");
        let _ = writeln!(f, "{} [{}] {}", chrono::Local::now().format("%Y-%m-%d %H:%M:%S"), level, one_line.chars().take(2000).collect::<String>());
    }
}

pub fn log_tail(app_data: &Path, lines: usize) -> Vec<String> {
    let text = fs::read_to_string(log_path(app_data)).unwrap_or_default();
    let all: Vec<&str> = text.lines().collect();
    all[all.len().saturating_sub(lines)..].iter().map(|s| s.to_string()).collect()
}

// ---------------------------------------------------------------- Diagnostik

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostics {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub data_dir: String,
    pub db_bytes: u64,
    pub records: Vec<(String, i64)>,
    pub tombstones: i64,
    pub settings: i64,
    pub backups: usize,
    pub last_backup: Option<String>,
    pub secret_store: String,
    pub integrity: String,
}

pub fn diagnostics(c: &Connection, app_data: &Path, version: &str) -> rusqlite::Result<Diagnostics> {
    let mut stmt = c.prepare("SELECT kind, COUNT(*) FROM records WHERE deleted = 0 GROUP BY kind ORDER BY COUNT(*) DESC")?;
    let records = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?;
    let tombstones = c.query_row("SELECT COUNT(*) FROM records WHERE deleted = 1", [], |r| r.get(0))?;
    let settings = c.query_row("SELECT COUNT(*) FROM settings", [], |r| r.get(0))?;
    let integrity: String = c.query_row("PRAGMA quick_check", [], |r| r.get(0)).unwrap_or_else(|e| e.to_string());
    let backups = list_backups(&backup_dir(app_data));
    Ok(Diagnostics {
        version: version.into(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        data_dir: app_data.to_string_lossy().into(),
        db_bytes: fs::metadata(app_data.join("ruangku.db")).map(|m| m.len()).unwrap_or(0),
        records,
        tombstones,
        settings,
        last_backup: backups.first().map(|b| b.name.clone()),
        backups: backups.len(),
        secret_store: secret_store_name().into(),
        integrity,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::net::TcpStream;

    #[test]
    fn secrets_fallback_to_db() {
        let c = db::open_in_memory().unwrap();
        assert_eq!(secret_get(&c, "ai").unwrap(), None);
        secret_set(&c, "ai", "sk-123").unwrap();
        assert_eq!(secret_get(&c, "ai").unwrap().as_deref(), Some("sk-123"));
        secret_set(&c, "ai", "").unwrap();
        assert_eq!(secret_get(&c, "ai").unwrap(), None);
    }

    #[test]
    fn pct_roundtrip() {
        assert_eq!(pct_decode(&pct_encode("a b/ç?&=")), "a b/ç?&=");
        assert_eq!(pct_decode("4%2F0Ab-x"), "4/0Ab-x");
        assert_eq!(pct_decode("50%"), "50%");
        assert_eq!(query_param("/?state=s1&code=4%2Fabc", "code").as_deref(), Some("4/abc"));
    }

    #[test]
    fn loopback_receives_code() {
        let r = oauth_loopback("https://contoh.test/auth?client_id=x", Duration::from_secs(5), |full| {
            let redirect = pct_decode(full.split("redirect_uri=").nth(1).unwrap());
            assert!(full.starts_with("https://contoh.test/auth?client_id=x&redirect_uri="));
            let addr = redirect.trim_start_matches("http://").to_string();
            std::thread::spawn(move || {
                // Permintaan pertama tanpa kode (mis. favicon) diabaikan.
                let mut s = TcpStream::connect(&addr).unwrap();
                s.write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
                let mut sink = String::new();
                let _ = s.read_to_string(&mut sink);
                let mut s = TcpStream::connect(&addr).unwrap();
                s.write_all(b"GET /?state=abc&code=4%2F0AQ HTTP/1.1\r\nHost: x\r\n\r\n").unwrap();
                let mut body = String::new();
                let _ = s.read_to_string(&mut body);
                assert!(body.contains("Berhasil masuk"));
            });
            Ok(())
        })
        .unwrap();
        assert_eq!(r.code.as_deref(), Some("4/0AQ"));
        assert_eq!(r.state.as_deref(), Some("abc"));
        assert!(r.redirect_uri.starts_with("http://127.0.0.1:"));
    }

    #[test]
    fn loopback_times_out() {
        let e = oauth_loopback("https://x.test/a", Duration::from_millis(200), |_| Ok(())).unwrap_err();
        assert!(e.contains("habis"));
    }

    #[test]
    fn backups_rotate_only_auto() {
        let dir = tempfile::tempdir().unwrap();
        for i in 0..5 {
            fs::write(dir.path().join(format!("{AUTO_PREFIX}2026010{i}-000000.json")), b"{}").unwrap();
        }
        fs::write(dir.path().join("manual-20250101-000000.json"), b"{}").unwrap();
        assert_eq!(rotate(dir.path(), 3), 2);
        let names: Vec<String> = list_backups(dir.path()).into_iter().map(|b| b.name).collect();
        assert_eq!(names, vec!["otomatis-20260104-000000.json", "otomatis-20260103-000000.json", "otomatis-20260102-000000.json", "manual-20250101-000000.json"]);
        assert!(safe_backup_path(dir.path(), "../x.json").is_err());
        assert!(safe_backup_path(dir.path(), "a.json").is_ok());
    }

    #[test]
    fn log_appends_and_tails() {
        let dir = tempfile::tempdir().unwrap();
        log_write(dir.path(), "INFO", "satu");
        log_write(dir.path(), "ERROR", "dua\nbaris");
        let t = log_tail(dir.path(), 1);
        assert_eq!(t.len(), 1);
        assert!(t[0].ends_with("[ERROR] dua baris"));
    }
}
