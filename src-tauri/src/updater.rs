use serde::Serialize;
use std::sync::{atomic::{AtomicBool, Ordering}, Mutex};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct PendingUpdate { update: Mutex<Option<Update>>, busy: AtomicBool }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo { pub configured: bool, pub version: Option<String>, pub notes: Option<String> }

const PUBLIC_KEY: &str = match option_env!("RUANGKU_UPDATER_PUBLIC_KEY") { Some(k) => k, None => "" };
const ENDPOINT: &str = "https://github.com/yahyaaliman/ruangku/releases/latest/download/latest.json";

struct Busy<'a>(&'a AtomicBool);
impl Drop for Busy<'_> { fn drop(&mut self) { self.0.store(false, Ordering::Release); } }

#[tauri::command]
pub async fn updater_check(app: AppHandle, pending: State<'_, PendingUpdate>) -> Result<UpdateInfo, String> {
    if PUBLIC_KEY.trim().is_empty() { return Ok(UpdateInfo { configured: false, version: None, notes: None }); }
    if pending.busy.swap(true, Ordering::AcqRel) { return Err("Pembaruan sedang diproses.".into()); }
    let _guard = Busy(&pending.busy);
    *pending.update.lock().map_err(|e| e.to_string())? = None;
    let update = app.updater_builder().pubkey(PUBLIC_KEY.trim())
        .endpoints(vec![ENDPOINT.parse().map_err(|e| format!("Alamat pembaruan: {e}"))?]).map_err(|e| e.to_string())?
        .timeout(std::time::Duration::from_secs(120)).build().map_err(|e| e.to_string())?
        .check().await.map_err(|e| e.to_string())?;
    if let Some(u) = &update {
        if u.download_url.scheme() != "https" { return Err("Unduhan pembaruan harus melalui HTTPS.".into()); }
    }
    let info = UpdateInfo { configured: true, version: update.as_ref().map(|u| u.version.clone()), notes: update.as_ref().and_then(|u| u.body.clone()) };
    *pending.update.lock().map_err(|e| e.to_string())? = update;
    Ok(info)
}

#[tauri::command]
pub async fn updater_install(app: AppHandle, pending: State<'_, PendingUpdate>, version: String) -> Result<(), String> {
    if PUBLIC_KEY.trim().is_empty() { return Err("Build ini belum memiliki kunci verifikasi pembaruan.".into()); }
    if pending.busy.swap(true, Ordering::AcqRel) { return Err("Pembaruan sedang diproses.".into()); }
    let _guard = Busy(&pending.busy);
    let update = pending.update.lock().map_err(|e| e.to_string())?.clone().ok_or("Periksa pembaruan terlebih dahulu.")?;
    if update.version != version { return Err("Versi berubah. Periksa kembali sebelum memasang.".into()); }
    let mut received = 0u64;
    // The plugin verifies the signature against the embedded key before installation.
    let bytes = update.download(|len, total| {
        received += len as u64;
        let _ = app.emit("updater-progress", serde_json::json!({"received": received, "total": total, "stage": "download"}));
    }, || {}).await.map_err(|e| e.to_string())?;
    let _ = app.emit("updater-progress", serde_json::json!({"stage": "install", "received": received}));
    update.install(bytes).map_err(|e| e.to_string())?;
    Ok(())
}
