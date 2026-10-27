//! Widget desktop: jendela kedua yang transparan, tanpa bingkai, tidak tampil
//! di taskbar, dan bisa diletakkan di lapisan desktop (di bawah jendela lain),
//! biasa, atau selalu di atas.
//!
//! Konfigurasi jendela (posisi, ukuran, lapisan, klik tembus, efek) disimpan di
//! setting `widget_window` per perangkat. Tampilan di dalam widget (opasitas,
//! tema, skala, bagian yang tampil) disimpan frontend di `widget_prefs`.

use crate::{db, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::window::{Effect, EffectsBuilder};
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "widget";
const KEY: &str = "widget_window";
const DEFAULT_W: u32 = 340;
const DEFAULT_H: u32 = 600;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct WidgetConfig {
    pub visible: bool,
    /// "desktop" (di bawah semua jendela), "normal", atau "top" (selalu di atas)
    pub layer: String,
    pub click_through: bool,
    /// "none" (transparan murni), "acrylic", "mica", atau "blur" (efek Windows)
    pub effect: String,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub width: u32,
    pub height: u32,
}

impl Default for WidgetConfig {
    fn default() -> Self {
        Self {
            visible: false,
            layer: "desktop".into(),
            click_through: false,
            effect: "none".into(),
            x: None,
            y: None,
            width: DEFAULT_W,
            height: DEFAULT_H,
        }
    }
}

/// Geometri terakhir yang belum disimpan (diisi saat jendela digeser/diubah ukurannya).
pub static PENDING_GEOMETRY: Mutex<Option<(i32, i32, u32, u32)>> = Mutex::new(None);

pub fn load(app: &AppHandle) -> WidgetConfig {
    let state = app.state::<AppState>();
    state
        .with(|c| db::get_setting(c, KEY))
        .ok()
        .flatten()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn store(app: &AppHandle, cfg: &WidgetConfig) {
    let state = app.state::<AppState>();
    if let Ok(s) = serde_json::to_string(cfg) {
        let _ = state.with(|c| db::set_setting(c, KEY, &s));
    }
    let _ = app.emit("widget-config", cfg);
}

fn apply_layer(w: &WebviewWindow, layer: &str) {
    let _ = w.set_always_on_top(layer == "top");
    let _ = w.set_always_on_bottom(layer == "desktop");
}

fn apply_effect(w: &WebviewWindow, effect: &str) {
    let e = match effect {
        "acrylic" => Some(Effect::Acrylic),
        "mica" => Some(Effect::Mica),
        "blur" => Some(Effect::Blur),
        _ => None,
    };
    let _ = match e {
        Some(e) => w.set_effects(EffectsBuilder::new().effect(e).build()),
        None => w.set_effects(None),
    };
}

/// Pastikan posisi tersimpan masih berada di salah satu monitor (misalnya
/// setelah monitor kedua dicabut). Jika tidak, taruh di kanan atas monitor utama.
fn placement(app: &AppHandle, cfg: &WidgetConfig) -> (i32, i32) {
    let monitors = app.available_monitors().unwrap_or_default();
    if let (Some(x), Some(y)) = (cfg.x, cfg.y) {
        let visible = monitors.iter().any(|m| {
            let p = m.position();
            let s = m.size();
            // minimal 60 px bagian atas widget terlihat
            x + 60 > p.x && x < p.x + s.width as i32 - 60 && y >= p.y - 10 && y < p.y + s.height as i32 - 60
        });
        if visible {
            return (x, y);
        }
    }
    match app.primary_monitor().ok().flatten().or_else(|| monitors.into_iter().next()) {
        Some(m) => {
            let margin = (24.0 * m.scale_factor()) as i32;
            (m.position().x + m.size().width as i32 - cfg.width as i32 - margin, m.position().y + margin * 2)
        }
        None => (80, 80),
    }
}

pub fn ensure(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    let cfg = load(app);
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .disable_drag_drop_handler()
        .title("Ruangku Widget")
        .initialization_script("window.__RUANGKU_WIDGET__ = true;")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(true)
        .min_inner_size(240.0, 160.0)
        .visible(false)
        .build()?;
    let _ = w.set_size(PhysicalSize::new(cfg.width.max(240), cfg.height.max(160)));
    let (x, y) = placement(app, &cfg);
    let _ = w.set_position(PhysicalPosition::new(x, y));
    apply_layer(&w, &cfg.layer);
    apply_effect(&w, &cfg.effect);
    let _ = w.set_ignore_cursor_events(cfg.click_through);
    Ok(w)
}

pub fn set_visible(app: &AppHandle, visible: bool) -> Result<WidgetConfig, String> {
    let mut cfg = load(app);
    cfg.visible = visible;
    if visible {
        let w = ensure(app).map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
        // Lapisan perlu dipasang ulang setelah show di beberapa versi Windows.
        apply_layer(&w, &cfg.layer);
    } else if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
    store(app, &cfg);
    Ok(cfg)
}

pub fn update(app: &AppHandle, f: impl FnOnce(&mut WidgetConfig)) -> WidgetConfig {
    let mut cfg = load(app);
    f(&mut cfg);
    if let Some(w) = app.get_webview_window(LABEL) {
        apply_layer(&w, &cfg.layer);
        apply_effect(&w, &cfg.effect);
        let _ = w.set_ignore_cursor_events(cfg.click_through);
    }
    store(app, &cfg);
    cfg
}

pub fn reset_position(app: &AppHandle) -> WidgetConfig {
    let cfg = update(app, |c| {
        c.x = None;
        c.y = None;
        c.width = DEFAULT_W;
        c.height = DEFAULT_H;
    });
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.set_size(PhysicalSize::new(cfg.width, cfg.height));
        let (x, y) = placement(app, &cfg);
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    cfg
}

/// Ukuran widget dari pilihan cepat (kecil, sedang, besar, lebar, panorama).
pub fn set_size(app: &AppHandle, width: u32, height: u32) -> WidgetConfig {
    let cfg = update(app, |c| {
        c.width = width.clamp(240, 2400);
        c.height = height.clamp(160, 1600);
    });
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.set_size(PhysicalSize::new(cfg.width, cfg.height));
        let (x, y) = placement(app, &cfg);
        let _ = w.set_position(PhysicalPosition::new(x, y));
    }
    cfg
}

/// Posisi (dan ukuran untuk varian "penuh") widget pada area kerja monitor.
/// `area` = (x, y, lebar, tinggi) area kerja tanpa taskbar.
pub fn snap_rect(area: (i32, i32, u32, u32), size: (u32, u32), place: &str, margin: i32) -> (i32, i32, u32, u32) {
    let (ax, ay, aw, ah) = area;
    let (mut w, mut h) = size;
    if place.ends_with("-penuh") {
        if place.starts_with("atas") || place.starts_with("bawah") {
            w = (aw as i32 - 2 * margin).max(240) as u32;
        } else {
            h = (ah as i32 - 2 * margin).max(160) as u32;
        }
    }
    let (wi, hi) = (w as i32, h as i32);
    let left = ax + margin;
    let right = ax + aw as i32 - wi - margin;
    let top = ay + margin;
    let bottom = ay + ah as i32 - hi - margin;
    let cy = ay + (ah as i32 - hi) / 2;
    let (x, y) = match place {
        "kiri-atas" => (left, top),
        "kiri-bawah" => (left, bottom),
        "kanan-bawah" => (right, bottom),
        "kanan-tengah" => (right, cy),
        "kiri-tengah" => (left, cy),
        "atas-penuh" => (left, top),
        "bawah-penuh" => (left, bottom),
        "kanan-penuh" => (right, top),
        "kiri-penuh" => (left, top),
        _ => (right, top),
    };
    (x, y, w, h)
}

/// Pindahkan widget ke pojok/sisi layar tempat ia berada sekarang.
pub fn snap(app: &AppHandle, place: &str) -> WidgetConfig {
    let Some(w) = app.get_webview_window(LABEL) else { return load(app) };
    let monitor = w.current_monitor().ok().flatten().or_else(|| app.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return load(app) };
    let wa = m.work_area();
    let size = w.outer_size().map(|s| (s.width, s.height)).unwrap_or((DEFAULT_W, DEFAULT_H));
    let margin = (16.0 * m.scale_factor()) as i32;
    let (x, y, width, height) = snap_rect((wa.position.x, wa.position.y, wa.size.width, wa.size.height), size, place, margin);
    let _ = w.set_size(PhysicalSize::new(width, height));
    let _ = w.set_position(PhysicalPosition::new(x, y));
    update(app, |c| {
        c.x = Some(x);
        c.y = Some(y);
        c.width = width;
        c.height = height;
    })
}

/// Dipanggil tiap 2 detik oleh tugas latar: simpan geometri bila berubah.
pub fn flush_geometry(app: &AppHandle) {
    let pending = PENDING_GEOMETRY.lock().ok().and_then(|mut g| g.take());
    if let Some((x, y, w, h)) = pending {
        let mut cfg = load(app);
        cfg.x = Some(x);
        cfg.y = Some(y);
        cfg.width = w;
        cfg.height = h;
        let state = app.state::<AppState>();
        if let Ok(s) = serde_json::to_string(&cfg) {
            let _ = state.with(|c| db::set_setting(c, KEY, &s));
        }
    }
}

pub fn record_geometry(w: &tauri::Window) {
    if let (Ok(p), Ok(s)) = (w.outer_position(), w.inner_size()) {
        if s.width > 0 && s.height > 0 {
            if let Ok(mut g) = PENDING_GEOMETRY.lock() {
                *g = Some((p.x, p.y, s.width, s.height));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snap_corners_and_full_width() {
        let area = (0, 0, 1920, 1040); // taskbar 40 px di bawah
        assert_eq!(snap_rect(area, (340, 600), "kanan-atas", 16), (1564, 16, 340, 600));
        assert_eq!(snap_rect(area, (340, 600), "kiri-bawah", 16), (16, 424, 340, 600));
        assert_eq!(snap_rect(area, (340, 600), "kanan-tengah", 16), (1564, 220, 340, 600));
        assert_eq!(snap_rect(area, (960, 320), "bawah-penuh", 16), (16, 704, 1888, 320));
        // Monitor kedua di kanan dengan posisi negatif/lainnya tetap relatif area kerjanya.
        assert_eq!(snap_rect((1920, -200, 1280, 1024), (300, 300), "kiri-atas", 20), (1940, -180, 300, 300));
    }

    #[test]
    fn config_defaults_and_partial_json() {
        let c: WidgetConfig = serde_json::from_str(r#"{"layer":"top","x":10}"#).unwrap();
        assert_eq!(c.layer, "top");
        assert_eq!(c.x, Some(10));
        assert_eq!(c.width, DEFAULT_W);
        assert!(!c.click_through);
        assert_eq!(serde_json::from_str::<WidgetConfig>("{}").unwrap(), WidgetConfig::default());
    }
}
