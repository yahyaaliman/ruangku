use crate::{db, reminders, AppState};
use tauri::{AppHandle, Emitter, Manager};

/// Actions are bound to the occurrence shown by the toast, never a later recurrence.
pub fn apply(conn: &rusqlite::Connection, id: &str, occurrence: i64, action: &str, now: i64) -> rusqlite::Result<bool> {
    if !matches!(action, "done" | "snooze") { return Ok(false); }
    let Some(rec) = db::get(conn, id)? else { return Ok(false) };
    let mut data = rec.data;
    if rec.deleted || rec.kind != "reminder" || data["done"] == true || data["firedFor"].as_i64() != Some(occurrence) || data["toastHandledFor"].as_i64() == Some(occurrence) || data["dueAt"] != data["toastDueAt"] { return Ok(false); }
    let recurring = data["repeat"].as_str().unwrap_or("none") != "none";
    if action == "snooze" && recurring {
        // Keep the recurring schedule; a separate one-off reminder represents this snooze.
        let mut snooze = data.clone();
        for key in ["_ft", "firedFor", "toastDueAt", "toastHandledFor", "completedCount"] { snooze.as_object_mut().unwrap().remove(key); }
        snooze["repeat"] = "none".into(); snooze["dueAt"] = (now + 10 * 60_000).into(); snooze["leadMinutes"] = 0.into();
        db::upsert(conn, &format!("snooze:{id}:{occurrence}"), "reminder", snooze)?;
    } else if action == "snooze" {
        data["dueAt"] = (now + 10 * 60_000).into(); data["leadMinutes"] = 0.into();
    } else if !recurring {
        data["done"] = true.into(); data["doneAt"] = now.into();
    }
    // A pre-alert can be completed/snoozed before tick has advanced the series.
    if recurring && data["dueAt"].as_i64() == Some(occurrence) {
        if data["anchorDay"].is_null() {
            use chrono::{TimeZone, Datelike};
            if let Some(at) = chrono::Local.timestamp_millis_opt(occurrence).single() { data["anchorDay"] = at.day().into(); }
        }
        if let Some(next) = reminders::next_occurrence(&chrono::Local, occurrence, data["repeat"].as_str().unwrap_or("none"), data["anchorDay"].as_u64().map(|n| n as u32), now.max(occurrence)) {
            data["dueAt"] = next.into();
            data["completedCount"] = (data["completedCount"].as_i64().unwrap_or(0) + 1).into();
        }
    }
    data["toastHandledFor"] = occurrence.into();
    db::upsert(conn, id, "reminder", data)?;
    Ok(true)
}

#[cfg(windows)]
pub fn show(app: &AppHandle, fired: &reminders::Fired) -> Result<(), String> {
    use winrt_toast_reborn::{Action, Toast, ToastManager};
    let a = app.clone(); let id = fired.id.clone(); let occurrence = fired.occurrence;
    let manager = ToastManager::new("com.ruangku.app").on_activated(None, move |action| {
        if let Some(action) = action {
            let state = a.state::<AppState>();
            if let Ok(true) = state.with(|c| apply(c, &id, occurrence, &action.arg, db::now_ms())) { let _ = a.emit("records-changed", "reminder"); }
        } else { crate::show_main(&a); }
    });
    let mut toast = Toast::new();
    toast.text1(&fired.title).text2(&fired.body)
        .action(Action::new("Selesai", "done", ""))
        .action(Action::new("Tunda 10 menit", "snooze", ""));
    manager.show(&toast).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn show(app: &AppHandle, fired: &reminders::Fired) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification().builder().title(&fired.title).body(&fired.body).show().map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn actions_are_idempotent_and_ignore_changed_reminders() {
        let c = db::open_in_memory().unwrap();
        let data = json!({"title":"Test", "dueAt":100, "firedFor":100, "toastDueAt":100, "repeat":"none", "done":false});
        db::upsert(&c, "r", "reminder", data.clone()).unwrap();
        assert!(!apply(&c,"r",99,"done",101).unwrap());
        assert!(apply(&c,"r",100,"snooze",101).unwrap());
        assert!(!apply(&c,"r",100,"done",102).unwrap());
        assert_eq!(db::get(&c,"r").unwrap().unwrap().data["dueAt"],600101);
        let mut moved = data; moved["dueAt"] = 200.into();
        db::upsert(&c,"other","reminder",moved).unwrap();
        assert!(!apply(&c,"other",100,"done",101).unwrap());
    }
    #[test]
    fn recurring_snooze_preserves_next_occurrence() {
        let c = db::open_in_memory().unwrap();
        db::upsert(&c,"r","reminder",json!({"title":"Daily", "dueAt":86400100, "toastDueAt":86400100, "firedFor":100, "repeat":"daily", "done":false})).unwrap();
        assert!(apply(&c,"r",100,"snooze",101).unwrap());
        assert_eq!(db::get(&c,"r").unwrap().unwrap().data["dueAt"],86400100);
        assert_eq!(db::get(&c,"snooze:r:100").unwrap().unwrap().data["repeat"],"none");
        assert!(!apply(&c,"r",100,"snooze",102).unwrap());
    }
}
