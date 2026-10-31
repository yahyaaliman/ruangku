mod breaks;
pub mod mcp;
mod capture;
mod net;
mod db;
mod files;
mod preview;
mod updater;
mod snapshot_crypto;
mod personal_sync;
mod toast_actions;
mod reminders;
mod sticky;
mod notify;
mod prayer;
mod realtime;
mod sync;
mod system;
mod widget;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as AutostartExt;
use tauri_plugin_notification::NotificationExt;

const HIDDEN_ARG: &str = "--hidden";

struct AppState {
    conn: Mutex<Connection>,
    device_id: String,
    device_name: String,
}

type CmdResult<T> = Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

impl AppState {
    fn with<T>(&self, f: impl FnOnce(&mut Connection) -> rusqlite::Result<T>) -> CmdResult<T> {
        let mut c = self.conn.lock().map_err(|_| "Database sedang terkunci.".to_string())?;
        f(&mut c).map_err(err)
    }
}

// ---------- Records ----------

#[tauri::command]
fn records_list(state: State<AppState>, kind: String) -> CmdResult<Vec<db::Record>> {
    state.with(|c| db::list(c, &kind))
}

#[tauri::command]
fn record_save(app: AppHandle, state: State<AppState>, id: String, kind: String, data: Value) -> CmdResult<db::Record> {
    let rec = state.with(|c| db::upsert(c, &id, &kind, data))?;
    let _ = app.emit("records-changed", &kind);
    Ok(rec)
}

#[tauri::command]
fn record_delete(app: AppHandle, state: State<AppState>, id: String, kind: String) -> CmdResult<()> {
    state.with(|c| db::remove(c, &id))?;
    let _ = app.emit("records-changed", &kind);
    Ok(())
}

#[tauri::command]
fn records_import(app: AppHandle, state: State<AppState>, records: Vec<db::Record>) -> CmdResult<usize> {
    let keys: Vec<String> = records.iter().filter(|r| r.kind == "account_preference").filter_map(|r| r.data.get("key").and_then(Value::as_str)).filter(|k| db::portable_setting(k)).map(str::to_owned).collect();
    let n = state.with(|c| db::merge(c, &records))?;
    if n > 0 { for key in keys { let _ = app.emit("setting-changed", key); } }
    let _ = app.emit("records-changed", "*");
    Ok(n)
}

#[tauri::command]
fn records_changed_since(state: State<AppState>, since: i64) -> CmdResult<Vec<db::Record>> {
    state.with(|c| db::changed_since(c, since))
}

#[tauri::command]
fn records_force(app: AppHandle, state: State<AppState>, records: Vec<db::Record>) -> CmdResult<usize> {
    let n = state.with(|c| db::force_put(c, &records))?;
    let _ = app.emit("records-changed", "*");
    Ok(n)
}

#[tauri::command]
fn records_count(state: State<AppState>) -> CmdResult<i64> {
    state.with(|c| db::count_active(c))
}

#[tauri::command]
fn records_remove_demo(app: AppHandle, state: State<AppState>) -> CmdResult<usize> {
    let n = state.with(db::remove_demo)?;
    let _ = app.emit("records-changed", "*");
    Ok(n)
}

#[tauri::command]
fn setting_get(state: State<AppState>, key: String) -> CmdResult<Option<String>> {
    state.with(|c| db::get_setting(c, &key))
}

#[tauri::command]
fn setting_set(app: AppHandle, state: State<AppState>, key: String, value: String) -> CmdResult<()> {
    state.with(|c| db::set_setting(c, &key, &value))?;
    // Jendela lain (mis. widget) ikut memperbarui pengaturannya.
    let _ = app.emit("setting-changed", &key);
    Ok(())
}

#[tauri::command]
fn account_export(state: State<AppState>) -> CmdResult<Vec<db::Record>> {
    state.with(|c| personal_sync::filter(c, &db::account_export(c)?))
}

#[tauri::command]
fn account_import(app: AppHandle, state: State<AppState>, records: Vec<db::Record>) -> CmdResult<usize> {
    let filtered = state.with(|c| personal_sync::filter(c, &records))?;
    records_import(app, state, filtered)
}

// ---------- Sync & backup ----------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SyncStatus {
    folder: Option<String>,
    device_id: String,
    device_name: String,
    last_sync: Option<i64>,
    last_error: Option<String>,
}

#[tauri::command]
fn sync_status(state: State<AppState>) -> CmdResult<SyncStatus> {
    let (folder, last, last_error) = state.with(|c| {
        Ok((
            db::get_setting(c, "sync_folder")?.filter(|s| !s.is_empty()),
            db::get_setting(c, "last_sync")?.and_then(|s| s.parse().ok()),
            db::get_setting(c, "last_sync_error")?.filter(|s| !s.is_empty()),
        ))
    })?;
    Ok(SyncStatus {
        folder,
        device_id: state.device_id.clone(),
        device_name: state.device_name.clone(),
        last_sync: last,
        last_error,
    })
}

fn do_sync(app: &AppHandle) -> CmdResult<sync::SyncReport> {
    let state = app.state::<AppState>();
    let folder = state
        .with(|c| db::get_setting(c, "sync_folder"))?
        .filter(|s| !s.is_empty())
        .ok_or("Folder sinkronisasi belum dipilih. Atur di Pengaturan.")?;
    let result = {
        let mut c = state.conn.lock().map_err(|_| "Database sedang terkunci.".to_string())?;
        let r = snapshot_crypto::password(&c).and_then(|password| sync::run_protected(&mut c, Path::new(&folder), &state.device_id, &state.device_name, password.as_deref()));
        match &r {
            Ok(rep) => {
                let _ = db::set_setting(&c, "last_sync", &rep.finished_at.to_string());
                let _ = db::set_setting(&c, "last_sync_error", "");
            }
            Err(e) => {
                let _ = db::set_setting(&c, "last_sync_error", e);
            }
        }
        r
    };
    if let Ok(rep) = &result {
        let _ = app.emit("sync-done", rep);
        if rep.records_pulled > 0 {
            let _ = app.emit("records-changed", "*");
        }
    }
    result
}

#[tauri::command]
async fn sync_now(app: AppHandle) -> CmdResult<sync::SyncReport> {
    tauri::async_runtime::spawn_blocking(move || do_sync(&app)).await.map_err(err)?
}

fn snapshot_bytes(state: &AppState) -> CmdResult<(Vec<u8>, usize)> {
    let records = state.with(|c| db::all(c))?;
    let n = records.len();
    let snap = sync::Snapshot {
        format: 1,
        device_id: state.device_id.clone(),
        device_name: state.device_name.clone(),
        written_at: db::now_ms(),
        records,
    };
    Ok((serde_json::to_vec_pretty(&snap).map_err(err)?, n))
}

#[tauri::command]
fn backup_export(state: State<AppState>, path: String) -> CmdResult<usize> {
    let (bytes, n) = snapshot_bytes(&state)?;
    std::fs::write(&path, bytes).map_err(err)?;
    Ok(n)
}

#[tauri::command]
fn mcp_start(app: AppHandle, port: u16, token: String) -> CmdResult<mcp::McpStatus> {
    mcp::start(&app, data_dir(&app)?, port, token)
}

#[tauri::command]
fn mcp_stop(app: AppHandle) -> CmdResult<mcp::McpStatus> {
    mcp::stop(&data_dir(&app)?);
    Ok(mcp::status())
}

#[tauri::command]
fn mcp_status() -> mcp::McpStatus {
    mcp::status()
}

#[tauri::command]
fn mcp_respond(id: u64, status: u16, body: String) {
    mcp::respond(id, status, body);
}

/// Ukuran tampilan jendela pemanggil (zoom webview, 0,5–2).
#[tauri::command]
fn set_zoom(webview: tauri::Webview, scale: f64) -> CmdResult<()> {
    webview.set_zoom(scale.clamp(0.5, 2.0)).map_err(err)
}

/// Lokasi ruangku.exe (untuk cuplikan konfigurasi Claude Desktop / tunnel ChatGPT).
#[tauri::command]
fn app_exe_path() -> CmdResult<String> {
    std::env::current_exe().map(|p| p.to_string_lossy().to_string()).map_err(err)
}

fn data_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    app.path().app_data_dir().map_err(err)
}

/// Buat backup otomatis bila yang terakhir lebih dari 20 jam lalu.
fn auto_backup_tick(app: &AppHandle) {
    let state = app.state::<AppState>();
    let Ok((enabled, last, keep)) = state.with(|c| {
        Ok((
            db::get_setting(c, "auto_backup")?.as_deref() != Some("off"),
            db::get_setting(c, "last_auto_backup")?.and_then(|v| v.parse::<i64>().ok()).unwrap_or(0),
            db::get_setting(c, "backup_keep")?.and_then(|v| v.parse::<usize>().ok()).unwrap_or(14),
        ))
    }) else {
        return;
    };
    if !enabled || db::now_ms() - last < 20 * 3600 * 1000 {
        return;
    }
    let Ok(dir) = data_dir(app) else { return };
    match snapshot_bytes(&state).and_then(|(b, _)| system::write_backup(&system::backup_dir(&dir), &b, system::AUTO_PREFIX).map_err(err)) {
        Ok(name) => {
            system::rotate(&system::backup_dir(&dir), keep.max(1));
            let _ = state.with(|c| db::set_setting(c, "last_auto_backup", &db::now_ms().to_string()));
            system::log_write(&dir, "INFO", &format!("Backup otomatis dibuat: {name}"));
        }
        Err(e) => system::log_write(&dir, "ERROR", &format!("Backup otomatis gagal: {e}")),
    }
}

#[tauri::command]
fn backups_list(app: AppHandle) -> CmdResult<Vec<system::BackupInfo>> {
    Ok(system::list_backups(&system::backup_dir(&data_dir(&app)?)))
}

#[tauri::command]
fn backups_dir(app: AppHandle) -> CmdResult<String> {
    let d = system::backup_dir(&data_dir(&app)?);
    std::fs::create_dir_all(&d).map_err(err)?;
    Ok(d.to_string_lossy().into())
}

#[tauri::command]
fn backup_now(app: AppHandle, state: State<AppState>) -> CmdResult<String> {
    let dir = data_dir(&app)?;
    let (bytes, _) = snapshot_bytes(&state)?;
    let name = system::write_backup(&system::backup_dir(&dir), &bytes, "manual-").map_err(err)?;
    system::log_write(&dir, "INFO", &format!("Backup manual dibuat: {name}"));
    Ok(name)
}

/// Pulihkan database dari file backup di folder backup. Sebelumnya dibuat
/// backup pengaman "sebelum-pulihkan-…" supaya langkah ini bisa dibatalkan.
#[tauri::command]
fn backup_restore(app: AppHandle, state: State<AppState>, name: String) -> CmdResult<usize> {
    let dir = data_dir(&app)?;
    let bdir = system::backup_dir(&dir);
    let path = system::safe_backup_path(&bdir, &name)?;
    let snap = sync::read_snapshot(&path).map_err(|e| format!("File backup tidak valid: {e}"))?;
    let (bytes, _) = snapshot_bytes(&state)?;
    system::write_backup(&bdir, &bytes, "sebelum-pulihkan-").map_err(err)?;
    let n = state.with(|c| db::restore(c, &snap.records))?;
    system::log_write(&dir, "WARN", &format!("Database dipulihkan dari {name} ({n} perubahan)"));
    let _ = app.emit("records-changed", "*");
    Ok(n)
}

#[tauri::command]
fn secret_set(state: State<AppState>, key: String, value: String) -> CmdResult<String> {
    state.with(|c| system::secret_set(c, &key, &value)).map(|s| s.to_string())
}

#[tauri::command]
fn secret_get(state: State<AppState>, key: String) -> CmdResult<Option<String>> {
    state.with(|c| system::secret_get(c, &key))
}

#[tauri::command]
fn secret_store() -> &'static str {
    system::secret_store_name()
}

#[tauri::command]
async fn oauth_loopback(url: String, timeout_secs: Option<u64>) -> CmdResult<system::OAuthResult> {
    tauri::async_runtime::spawn_blocking(move || {
        system::oauth_loopback(&url, Duration::from_secs(timeout_secs.unwrap_or(300)), |full| tauri_plugin_opener::open_url(full, None::<&str>).map_err(err))
    })
    .await
    .map_err(err)?
}

#[tauri::command]
fn team_realtime_start(app: AppHandle, url: String, token: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Alamat server tidak valid.".into());
    }
    realtime::start(url, token, move |name, payload| {
        let _ = app.emit(name, payload);
    });
    Ok(())
}

#[tauri::command]
fn team_realtime_stop() {
    realtime::stop();
}

#[tauri::command]
fn open_url(url: String) -> CmdResult<()> {
    if !(url.starts_with("https://") || url.starts_with("http://") || url.starts_with("mailto:")) {
        return Err("Hanya tautan web yang bisa dibuka.".into());
    }
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
fn write_text_file(path: String, contents: String) -> CmdResult<()> {
    std::fs::write(&path, contents).map_err(err)
}

#[tauri::command]
fn fm_preview(path: String) -> CmdResult<preview::Preview> { preview::read(std::path::Path::new(&path)) }

#[tauri::command]
fn write_binary_file(path: String, contents: Vec<u8>) -> CmdResult<()> { std::fs::write(path, contents).map_err(err) }



#[tauri::command]
fn read_text_file(path: String) -> CmdResult<String> {
    let meta = std::fs::metadata(&path).map_err(err)?;
    if meta.len() > 20 * 1024 * 1024 {
        return Err("File terlalu besar (maksimal 20 MB).".into());
    }
    let bytes = std::fs::read(&path).map_err(err)?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[tauri::command]
fn log_write(app: AppHandle, level: String, message: String) -> CmdResult<()> {
    system::log_write(&data_dir(&app)?, &level, &message);
    Ok(())
}

#[tauri::command]
fn log_tail(app: AppHandle, lines: Option<usize>) -> CmdResult<Vec<String>> {
    Ok(system::log_tail(&data_dir(&app)?, lines.unwrap_or(200)))
}

#[tauri::command]
fn diagnostics(app: AppHandle, state: State<AppState>) -> CmdResult<system::Diagnostics> {
    let dir = data_dir(&app)?;
    let version = app.package_info().version.to_string();
    state.with(|c| system::diagnostics(c, &dir, &version))
}

#[tauri::command]
fn backup_import(app: AppHandle, state: State<AppState>, path: String) -> CmdResult<usize> {
    let snap = sync::read_snapshot(Path::new(&path)).map_err(|e| format!("File backup tidak valid: {e}"))?;
    let n = state.with(|c| db::merge(c, &snap.records))?;
    let _ = app.emit("records-changed", "*");
    Ok(n)
}

// ---------- File manager ----------

#[tauri::command]
fn fm_places(app: AppHandle) -> Vec<files::Place> {
    let p = app.path();
    let mut out = Vec::new();
    let mut add = |label: &str, path: tauri::Result<PathBuf>| {
        if let Ok(path) = path {
            if path.is_dir() {
                out.push(files::Place { label: label.into(), path: path.to_string_lossy().to_string(), kind: "folder".into() });
            }
        }
    };
    add("Beranda", p.home_dir());
    add("Desktop", p.desktop_dir());
    add("Dokumen", p.document_dir());
    add("Unduhan", p.download_dir());
    add("Gambar", p.picture_dir());
    add("Video", p.video_dir());
    add("Musik", p.audio_dir());
    out.extend(files::drives());
    out
}

#[tauri::command]
async fn fm_list(path: String) -> CmdResult<Vec<files::Entry>> {
    tauri::async_runtime::spawn_blocking(move || files::list_dir(Path::new(&path))).await.map_err(err)?
}

#[tauri::command]
fn fm_mkdir(parent: String, name: String) -> CmdResult<files::Entry> {
    files::mkdir(Path::new(&parent), &name)
}

#[tauri::command]
fn fm_create_file(parent: String, name: String) -> CmdResult<files::Entry> {
    files::create_file(Path::new(&parent), &name)
}

#[tauri::command]
fn fm_rename(path: String, new_name: String) -> CmdResult<files::Entry> {
    files::rename(Path::new(&path), &new_name)
}

fn to_paths(v: Vec<String>) -> Vec<PathBuf> {
    v.into_iter().map(PathBuf::from).collect()
}

#[tauri::command]
async fn fm_copy(sources: Vec<String>, dest: String) -> CmdResult<usize> {
    tauri::async_runtime::spawn_blocking(move || files::copy(&to_paths(sources), Path::new(&dest)))
        .await
        .map_err(err)?
}

#[tauri::command]
async fn fm_move(sources: Vec<String>, dest: String) -> CmdResult<usize> {
    tauri::async_runtime::spawn_blocking(move || files::move_items(&to_paths(sources), Path::new(&dest)))
        .await
        .map_err(err)?
}

#[tauri::command]
async fn fm_trash(paths: Vec<String>) -> CmdResult<usize> {
    tauri::async_runtime::spawn_blocking(move || files::to_recycle_bin(&to_paths(paths))).await.map_err(err)?
}

#[tauri::command]
async fn fm_search(root: String, query: String) -> CmdResult<Vec<files::Entry>> {
    tauri::async_runtime::spawn_blocking(move || files::search(Path::new(&root), &query, 300)).await.map_err(err)
}

#[tauri::command]
async fn fm_dir_size(path: String) -> CmdResult<(u64, u64)> {
    tauri::async_runtime::spawn_blocking(move || files::dir_size(Path::new(&path))).await.map_err(err)
}

#[tauri::command]
fn fm_stat(path: String) -> Option<files::Entry> {
    files::entry_for(Path::new(&path))
}

#[tauri::command]
fn fm_open(path: String) -> CmdResult<()> {
    tauri_plugin_opener::open_path(&path, None::<&str>).map_err(err)
}

#[tauri::command]
fn fm_reveal(path: String) -> CmdResult<()> {
    tauri_plugin_opener::reveal_item_in_dir(&path).map_err(err)
}

// ---------- Sistem ----------

#[tauri::command]
fn autostart_get(app: AppHandle) -> CmdResult<bool> {
    app.autolaunch().is_enabled().map_err(err)
}

#[tauri::command]
fn autostart_set(app: AppHandle, enabled: bool) -> CmdResult<()> {
    let m = app.autolaunch();
    if enabled { m.enable() } else { m.disable() }.map_err(err)
}

#[tauri::command]
fn notify_test(app: AppHandle) -> CmdResult<()> {
    app.notification()
        .builder()
        .title("Ruangku")
        .body("Notifikasi aktif. Reminder akan muncul seperti ini.")
        .show()
        .map_err(err)
}

// ---------- Widget desktop ----------

#[tauri::command]
fn widget_config(app: AppHandle) -> widget::WidgetConfig {
    widget::load(&app)
}

#[tauri::command]
fn widget_set_visible(app: AppHandle, visible: bool) -> CmdResult<widget::WidgetConfig> {
    widget::set_visible(&app, visible)
}

#[tauri::command]
fn widget_set_layer(app: AppHandle, layer: String) -> widget::WidgetConfig {
    widget::update(&app, |c| c.layer = layer)
}

#[tauri::command]
fn widget_set_click_through(app: AppHandle, enabled: bool) -> widget::WidgetConfig {
    widget::update(&app, |c| c.click_through = enabled)
}

#[tauri::command]
fn widget_set_effect(app: AppHandle, effect: String) -> widget::WidgetConfig {
    widget::update(&app, |c| c.effect = effect)
}

#[tauri::command]
fn widget_reset_position(app: AppHandle) -> widget::WidgetConfig {
    widget::reset_position(&app)
}

/// Buka jendela utama, opsional langsung ke halaman tertentu (dari widget).
#[tauri::command]
fn open_main(app: AppHandle, page: Option<String>) {
    show_main(&app);
    if let Some(p) = page {
        let _ = app.emit_to("main", "navigate", p);
    }
}

#[tauri::command]
fn widget_set_size(app: AppHandle, width: u32, height: u32) -> widget::WidgetConfig {
    widget::set_size(&app, width, height)
}

#[tauri::command]
fn widget_snap(app: AppHandle, place: String) -> widget::WidgetConfig {
    widget::snap(&app, &place)
}

#[tauri::command]
fn sticky_open(app: AppHandle, id: String) -> CmdResult<()> {
    sticky::open(&app, &id)
}

#[tauri::command]
fn sticky_close(app: AppHandle, id: String) {
    sticky::close(&app, &id);
}

#[tauri::command]
fn sticky_set_layer(app: AppHandle, id: String, layer: String) {
    sticky::set_layer(&app, &id, &layer);
}

#[tauri::command]
fn sticky_layer(app: AppHandle, id: String) -> String {
    sticky::layer_of(&app, &id)
}

#[tauri::command]
fn sticky_list(app: AppHandle) -> Vec<String> {
    sticky::open_ids(&app)
}

#[tauri::command]
fn capture_hide(app: AppHandle) {
    capture::hide(&app);
}

#[tauri::command]
fn capture_shortcut() -> &'static str {
    capture::SHORTCUT_LABEL
}

#[tauri::command]
fn notify_send(app: AppHandle, title: String, body: String) -> CmdResult<()> {
    app.notification().builder().title(&title).body(&body).show().map_err(err)
}

/// Notifikasi sistem sederhana (dipakai modul lain).
pub(crate) fn notify_user(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

#[tauri::command]
async fn http_request(req: net::HttpReq) -> CmdResult<net::HttpRes> {
    net::http(req).await
}

#[tauri::command]
async fn sleep_ms(ms: u64) {
    tokio::time::sleep(Duration::from_millis(ms.min(120_000))).await;
}

#[tauri::command]
async fn mail_send(cfg: net::MailCfg, to: String, subject: String, body: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || net::send_mail(&cfg, &to, &subject, &body)).await.map_err(err)?
}

#[tauri::command]
async fn mail_fetch(cfg: net::MailCfg, marker: String) -> CmdResult<Vec<net::Incoming>> {
    tauri::async_runtime::spawn_blocking(move || net::fetch_mail(&cfg, &marker, 20)).await.map_err(err)?
}

#[tauri::command]
fn break_status(app: AppHandle) -> breaks::Status {
    breaks::status(&app, db::now_ms())
}

#[tauri::command]
fn break_action(app: AppHandle, action: String) {
    breaks::action(&app, &action, db::now_ms());
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn start_background_jobs(app: AppHandle) {
    // Penjadwal reminder: cek tiap 15 detik.
    let a = app.clone();
    std::thread::spawn(move || loop {
        let fired = {
            let state = a.state::<AppState>();
            
            state.with(|c| reminders::tick(c, &chrono::Local, db::now_ms()))
        };
        if let Ok(list) = fired {
            if !list.is_empty() {
                for f in &list {
                    if toast_actions::show(&a, f).is_err() { let _ = a.notification().builder().title(&f.title).body(&f.body).show(); }
                }
                let _ = a.emit("records-changed", "reminder");
            }
        }
        // Notifikasi blok aktivitas, ibadah, dan evaluasi.
        let events = {
            let state = a.state::<AppState>();
            state.with(|c| notify::tick(c, &chrono::Local, db::now_ms()))
        };
        if let Ok(list) = events {
            for e in &list {
                let _ = a.notification().builder().title(&e.title).body(&e.body).show();
            }
        }
        // Pengingat istirahat.
        breaks::tick(&a, db::now_ms());
        std::thread::sleep(Duration::from_secs(15));
    });

    // Sinkronisasi otomatis: 5 detik setelah start, lalu tiap 3 menit.
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(5));
        let a = app.clone();
        // Simpan posisi/ukuran widget yang berubah, tiap 2 detik.
        std::thread::spawn(move || loop {
            widget::flush_geometry(&a);
            sticky::flush_geometry(&a);
            std::thread::sleep(Duration::from_secs(2));
        });
        let mut ticks: u32 = 0;
        loop {
            let _ = do_sync(&app);
            // Backup otomatis: cek tiap ±1 jam (20 × 3 menit).
            if ticks.is_multiple_of(20) {
                auto_backup_tick(&app);
            }
            ticks = ticks.wrapping_add(1);
            std::thread::sleep(Duration::from_secs(180));
        }
    });
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Buka Ruangku", true, None::<&str>)?;
    let sync = MenuItem::with_id(app, "sync", "Sinkronkan sekarang", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let capture_item = MenuItem::with_id(app, "capture", format!("Catat cepat ({})", capture::SHORTCUT_LABEL), true, None::<&str>)?;
    let brk = MenuItem::with_id(app, "break-now", "Istirahat sekarang", true, None::<&str>)?;
    let w_toggle = MenuItem::with_id(app, "widget-toggle", "Tampilkan / sembunyikan widget", true, None::<&str>)?;
    let w_unlock = MenuItem::with_id(app, "widget-unlock", "Buka kunci widget (matikan klik tembus)", true, None::<&str>)?;
    let w_reset = MenuItem::with_id(app, "widget-reset", "Kembalikan posisi widget", true, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &capture_item, &sync, &brk, &sep, &w_toggle, &w_unlock, &w_reset, &sep2, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Ruangku")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => show_main(app),
            "sync" => {
                let a = app.clone();
                std::thread::spawn(move || {
                    let _ = do_sync(&a);
                });
            }
            "capture" => capture::show(app),
            "break-now" => breaks::action(app, "start", db::now_ms()),
            "widget-toggle" => {
                let visible = widget::load(app).visible;
                let _ = widget::set_visible(app, !visible);
            }
            "widget-unlock" => {
                widget::update(app, |c| c.click_through = false);
                let _ = widget::set_visible(app, true);
            }
            "widget-reset" => {
                widget::reset_position(app);
                let _ = widget::set_visible(app, true);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

fn device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "Perangkat ini".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        capture::toggle(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::PendingUpdate::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![HIDDEN_ARG]),
        ))
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir.join("ruangku.db")).map_err(|e| format!("Gagal membuka database: {e}"))?;
            let device_id = match db::get_setting(&conn, "device_id")? {
                Some(id) => id,
                None => {
                    let id = uuid::Uuid::new_v4().simple().to_string()[..12].to_string();
                    db::set_setting(&conn, "device_id", &id)?;
                    id
                }
            };
            app.manage(AppState { conn: Mutex::new(conn), device_id, device_name: device_name() });
            {
                let log_dir = dir.clone();
                let prev = std::panic::take_hook();
                std::panic::set_hook(Box::new(move |info| {
                    system::log_write(&log_dir, "PANIC", &info.to_string());
                    prev(info);
                }));
                system::log_write(&dir, "INFO", &format!("Ruangku {} dimulai", app.package_info().version));
            }

            #[cfg(windows)]
            if let Err(e) = winrt_toast_reborn::register("com.ruangku.app", "Ruangku", None) { eprintln!("Registrasi toast: {e}"); }
            build_tray(app.handle())?;
            {
                use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};
                let sc = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);
                // Pintasan bisa sudah dipakai aplikasi lain; aplikasi tetap berjalan.
                if let Err(e) = app.global_shortcut().register(sc) {
                    eprintln!("Pintasan catat cepat tidak bisa didaftarkan: {e}");
                }
            }

            let start_hidden = std::env::args().any(|a| a == HIDDEN_ARG);
            if !start_hidden {
                show_main(app.handle());
            }
            if widget::load(app.handle()).visible {
                let _ = widget::set_visible(app.handle(), true);
            }
            sticky::restore(app.handle());
            start_background_jobs(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // Tutup jendela = sembunyikan ke tray, supaya reminder tetap berjalan.
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                if window.label() == capture::LABEL || window.label() == breaks::LABEL {
                    let _ = window.hide();
                } else if let Some(id) = window.label().strip_prefix(sticky::PREFIX) {
                    sticky::close(window.app_handle(), id);
                } else if window.label() == widget::LABEL {
                    let _ = widget::set_visible(window.app_handle(), false);
                } else {
                    let _ = window.hide();
                }
            }
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) if window.label() == widget::LABEL => {
                widget::record_geometry(window);
            }
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) if window.label().starts_with(sticky::PREFIX) => {
                sticky::record_geometry(window);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            records_list,
            record_save,
            record_delete,
            records_import,
            account_export,
            account_import,
            records_count,
            records_changed_since,
            records_force,
            records_forget,
            records_remove_demo,
            setting_get,
            setting_set,
            sync_status,
            sync_now,
            backup_export,
            backup_import,
            fm_places,
            fm_list,
            fm_mkdir,
            fm_create_file,
            fm_rename,
            fm_copy,
            fm_move,
            fm_trash,
            fm_search,
            fm_dir_size,
            snapshot_crypto::snapshot_unlock,
            snapshot_crypto::snapshot_encode,
            snapshot_crypto::snapshot_decode,
            snapshot_migrate_folder,
            updater::updater_check,
            updater::updater_install,
            fm_stat,
            fm_preview,
            write_binary_file,
            fm_open,
            fm_reveal,
            autostart_get,
            autostart_set,
            notify_test,
            notify_send,
            capture_hide,
            capture_shortcut,
            widget_config,
            widget_set_visible,
            widget_set_layer,
            widget_set_click_through,
            widget_set_effect,
            widget_reset_position,
            widget_set_size,
            widget_snap,
            sticky_open,
            sticky_close,
            sticky_set_layer,
            sticky_layer,
            sticky_list,
            break_status,
            break_action,
            http_request,
            sleep_ms,
            mail_send,
            mail_fetch,
            open_main,
            backups_list,
            backups_dir,
            backup_now,
            backup_restore,
            secret_set,
            secret_get,
            secret_store,
            oauth_loopback,
            open_url,
            team_realtime_start,
            team_realtime_stop,
            write_text_file,
            read_text_file,
            log_write,
            log_tail,
            diagnostics,
            mcp_start,
            mcp_stop,
            mcp_status,
            mcp_respond,
            app_exe_path,
            set_zoom,
        ])
        .run(tauri::generate_context!())
        .expect("gagal menjalankan Ruangku");
}

#[tauri::command]
fn snapshot_migrate_folder(state: State<AppState>) -> CmdResult<usize> {
    let c = state.conn.lock().map_err(|e| e.to_string())?;
    let password = snapshot_crypto::password(&c)?.ok_or("Aktifkan enkripsi terlebih dahulu.")?;
    let folder = db::get_setting(&c, "sync_folder").map_err(err)?.unwrap_or_default();
    if folder.is_empty() { return Ok(0); }
    sync::migrate(Path::new(&folder), &password)
}

#[tauri::command]
fn records_forget(app: AppHandle, state: State<AppState>, ids: Vec<String>) -> CmdResult<()> {
    state.with(|c| { let tx = c.transaction()?; personal_sync::remember(&tx, &ids)?; for id in ids { tx.execute("DELETE FROM records WHERE id = ?1", [&id])?; } tx.commit() })?;
    let _ = app.emit("records-changed", "*"); Ok(())
}
