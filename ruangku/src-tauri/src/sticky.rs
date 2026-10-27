//! Sticky note di desktop: setiap catatan bisa "ditempel" sebagai jendela kecil
//! transparan tanpa bingkai. Daftar sticky yang terbuka beserta posisi, ukuran,
//! dan lapisannya disimpan di setting `sticky_windows` (per perangkat) dan
//! dipulihkan saat aplikasi dibuka lagi.

use crate::{db, AppState};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const PREFIX: &str = "sticky-";
const KEY: &str = "sticky_windows";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct StickyGeom {
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
    /// "desktop" | "normal" | "top"
    pub layer: String,
}

impl Default for StickyGeom {
    fn default() -> Self {
        Self { x: None, y: None, width: 280, height: 280, layer: "normal".into() }
    }
}

/// Perubahan geometri yang belum disimpan, per id catatan.
static PENDING: Mutex<BTreeMap<String, (i32, i32, u32, u32)>> = Mutex::new(BTreeMap::new());

/// Id catatan aman untuk label jendela Tauri (huruf, angka, - dan _).
pub fn safe_id(id: &str) -> Option<String> {
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return None;
    }
    Some(id.to_string())
}

pub fn label_for(id: &str) -> String {
    format!("{PREFIX}{id}")
}

fn load_all(app: &AppHandle) -> BTreeMap<String, StickyGeom> {
    let state = app.state::<AppState>();
    state
        .with(|c| db::get_setting(c, KEY))
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn store_all(app: &AppHandle, all: &BTreeMap<String, StickyGeom>) {
    let state = app.state::<AppState>();
    if let Ok(s) = serde_json::to_string(all) {
        let _ = state.with(|c| db::set_setting(c, KEY, &s));
    }
}

fn apply_layer(w: &WebviewWindow, layer: &str) {
    let _ = w.set_always_on_top(layer == "top");
    let _ = w.set_always_on_bottom(layer == "desktop");
}

fn build(app: &AppHandle, id: &str, g: &StickyGeom, offset: i32) -> tauri::Result<WebviewWindow> {
    let label = label_for(id);
    if let Some(w) = app.get_webview_window(&label) {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .disable_drag_drop_handler()
        .title("Sticky note")
        .initialization_script(format!("window.__RUANGKU_STICKY__ = {};", serde_json::to_string(id).unwrap_or_default()))
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(true)
        .min_inner_size(180.0, 120.0)
        .visible(false)
        .build()?;
    let _ = w.set_size(PhysicalSize::new(g.width.max(180), g.height.max(120)));
    match (g.x, g.y) {
        (Some(x), Some(y)) => {
            let _ = w.set_position(PhysicalPosition::new(x, y));
        }
        _ => {
            if let Some(m) = app.primary_monitor().ok().flatten() {
                let x = m.position().x + (m.size().width as i32 - g.width as i32) / 2 + offset;
                let y = m.position().y + (m.size().height as i32 - g.height as i32) / 3 + offset;
                let _ = w.set_position(PhysicalPosition::new(x, y));
            }
        }
    }
    apply_layer(&w, &g.layer);
    Ok(w)
}

pub fn open(app: &AppHandle, id: &str) -> Result<(), String> {
    let id = safe_id(id).ok_or("Id catatan tidak valid untuk sticky note.")?;
    let mut all = load_all(app);
    let g = all.entry(id.clone()).or_default().clone();
    let offset = (all.len() as i32 % 6) * 24;
    store_all(app, &all);
    let w = build(app, &id, &g, offset).map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    apply_layer(&w, &g.layer);
    let _ = w.set_focus();
    Ok(())
}

pub fn close(app: &AppHandle, id: &str) {
    let mut all = load_all(app);
    all.remove(id);
    store_all(app, &all);
    if let Some(w) = app.get_webview_window(&label_for(id)) {
        let _ = w.destroy();
    }
}

pub fn set_layer(app: &AppHandle, id: &str, layer: &str) {
    let mut all = load_all(app);
    if let Some(g) = all.get_mut(id) {
        g.layer = layer.to_string();
    }
    store_all(app, &all);
    if let Some(w) = app.get_webview_window(&label_for(id)) {
        apply_layer(&w, layer);
    }
}

pub fn layer_of(app: &AppHandle, id: &str) -> String {
    load_all(app).get(id).map(|g| g.layer.clone()).unwrap_or_else(|| "normal".into())
}

/// Daftar id sticky yang sedang ditempel.
pub fn open_ids(app: &AppHandle) -> Vec<String> {
    load_all(app).keys().cloned().collect()
}

/// Pulihkan semua sticky saat aplikasi dimulai.
pub fn restore(app: &AppHandle) {
    for (i, (id, g)) in load_all(app).iter().enumerate() {
        if let Ok(w) = build(app, id, g, i as i32 * 24) {
            let _ = w.show();
            apply_layer(&w, &g.layer);
        }
    }
}

pub fn record_geometry(w: &tauri::Window) {
    let Some(id) = w.label().strip_prefix(PREFIX) else { return };
    if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
        if s.width > 0 && s.height > 0 {
            if let Ok(mut g) = PENDING.lock() {
                g.insert(id.to_string(), (p.x, p.y, s.width, s.height));
            }
        }
    }
}

pub fn flush_geometry(app: &AppHandle) {
    let pending: Vec<_> = match PENDING.lock() {
        Ok(mut g) if !g.is_empty() => std::mem::take(&mut *g).into_iter().collect(),
        _ => return,
    };
    let mut all = load_all(app);
    for (id, (x, y, w, h)) in pending {
        if let Some(g) = all.get_mut(&id) {
            g.x = Some(x);
            g.y = Some(y);
            g.width = w;
            g.height = h;
        }
    }
    store_all(app, &all);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_are_sanitized() {
        assert_eq!(safe_id("n-th-kerangka").as_deref(), Some("n-th-kerangka"));
        assert_eq!(safe_id("a1b2c3d4e5f6g7h8i9j0").as_deref(), Some("a1b2c3d4e5f6g7h8i9j0"));
        assert!(safe_id("../x").is_none());
        assert!(safe_id("a\"b").is_none());
        assert!(safe_id("").is_none());
        let g: StickyGeom = serde_json::from_str(r#"{"layer":"top"}"#).unwrap();
        assert_eq!((g.width, g.layer.as_str()), (280, "top"));
    }
}
