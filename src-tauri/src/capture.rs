//! Jendela "catat cepat": kotak input kecil di tengah layar yang muncul dengan
//! pintasan global (Ctrl+Shift+Space), dari aplikasi mana pun.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

pub const LABEL: &str = "capture";
pub const SHORTCUT_LABEL: &str = "Ctrl+Shift+Space";

fn ensure(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(w) = app.get_webview_window(LABEL) {
        return Ok(w);
    }
    WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
        .disable_drag_drop_handler()
        .title("Catat cepat")
        .initialization_script("window.__RUANGKU_CAPTURE__ = true;")
        .inner_size(620.0, 150.0)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .center()
        .visible(false)
        .build()
}

pub fn show(app: &AppHandle) {
    if let Ok(w) = ensure(app) {
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = tauri::Emitter::emit_to(app, LABEL, "capture-open", ());
    }
}

pub fn toggle(app: &AppHandle) {
    match app.get_webview_window(LABEL) {
        Some(w) if w.is_visible().unwrap_or(false) => {
            let _ = w.hide();
        }
        _ => show(app),
    }
}

pub fn hide(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}
