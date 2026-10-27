//! Pengingat istirahat: setelah bekerja terus-menerus (default 50 menit), minta
//! istirahat (default 10 menit), plus istirahat mata 20-20-20. Waktu "bekerja"
//! direset otomatis bila komputer tidak dipakai cukup lama (deteksi idle di
//! Windows) atau setelah komputer tidur.

use crate::{db, AppState};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

pub const LABEL: &str = "break";
const KEY: &str = "break_config";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BreakConfig {
    pub enabled: bool,
    pub work_min: u32,
    pub break_min: u32,
    pub eye_enabled: bool,
    pub eye_every: u32,
    pub eye_sec: u32,
    /// Tidak memakai komputer selama ini dihitung sudah istirahat.
    pub idle_reset_min: u32,
    /// Tampilkan layar istirahat (bukan hanya notifikasi).
    pub overlay: bool,
    pub respect_quiet: bool,
    pub snooze_min: u32,
    /// Selaraskan istirahat dengan waktu sholat: bila istirahat jatuh dekat
    /// waktu sholat, istirahat diambil saat adzan sekalian sholat.
    pub align_prayer: bool,
    /// Rentang penyelarasan (menit sebelum/sesudah jadwal istirahat).
    pub align_window_min: u32,
    /// Lama istirahat sholat (menit).
    pub prayer_break_min: u32,
}

impl Default for BreakConfig {
    fn default() -> Self {
        Self { enabled: true, work_min: 50, break_min: 10, eye_enabled: true, eye_every: 20, eye_sec: 20, idle_reset_min: 5, overlay: true, respect_quiet: true, snooze_min: 5, align_prayer: true, align_window_min: 20, prayer_break_min: 15 }
    }
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct State {
    pub active_since: i64,
    pub last_eye: i64,
    pub last_tick: i64,
    pub snooze_until: i64,
    pub on_break_until: Option<i64>,
    /// Kunci sholat terakhir yang sudah dipakai sebagai istirahat (mis. "2026-10-27:dzuhur").
    pub prayer_key: Option<String>,
}

/// Sholat terdekat: `delta_min` = menit menuju waktunya (negatif = sudah lewat).
#[derive(Debug, Clone, PartialEq)]
pub struct PrayerCtx {
    pub key: String,
    pub name: String,
    pub delta_min: i64,
}

#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// Waktunya istirahat panjang (menit).
    Break(u32),
    /// Istirahat sekalian sholat (nama sholat, menit).
    PrayerBreak(String, u32),
    /// Istirahat mata (detik).
    Eye(u32),
    /// Istirahat selesai.
    End,
}

const MIN: i64 = 60_000;

/// Tanpa penyelarasan sholat (dipakai uji).
#[cfg(test)]
pub fn step(cfg: &BreakConfig, st: &mut State, now: i64, idle_sec: u64, quiet: bool) -> Option<Event> {
    step_with_prayer(cfg, st, now, idle_sec, quiet, None)
}

/// Logika murni: dipanggil tiap tick dengan waktu sekarang, lama idle (detik), dan (bila ada)
/// waktu sholat terdekat untuk menyelaraskan istirahat dengan adzan.
pub fn step_with_prayer(cfg: &BreakConfig, st: &mut State, now: i64, idle_sec: u64, quiet: bool, prayer: Option<&PrayerCtx>) -> Option<Event> {
    if !cfg.enabled {
        *st = State { active_since: now, last_eye: now, last_tick: now, ..Default::default() };
        return None;
    }
    // Pertama kali, atau komputer baru bangun dari tidur (> 5 menit tanpa tick).
    if st.last_tick == 0 || now - st.last_tick > 5 * MIN {
        st.active_since = now;
        st.last_eye = now;
        st.on_break_until = None;
    }
    st.last_tick = now;
    if let Some(until) = st.on_break_until {
        if now >= until {
            st.on_break_until = None;
            st.active_since = now;
            st.last_eye = now;
            return Some(Event::End);
        }
        return None;
    }
    if idle_sec >= cfg.idle_reset_min as u64 * 60 {
        st.active_since = now;
        st.last_eye = now;
        return None;
    }
    if (cfg.respect_quiet && quiet) || now < st.snooze_until {
        return None;
    }
    let worked = now - st.active_since;
    let work = cfg.work_min.max(1) as i64 * MIN;
    if let (true, Some(p)) = (cfg.align_prayer, prayer) {
        let window = cfg.align_window_min as i64 * MIN;
        // Adzan baru saja (≤ 2 menit) dan istirahat sudah dekat: istirahat sekarang sekalian sholat.
        if (-2..=0).contains(&p.delta_min) && worked >= work - window && st.prayer_key.as_deref() != Some(p.key.as_str()) {
            st.prayer_key = Some(p.key.clone());
            st.last_eye = now;
            let m = cfg.prayer_break_min.max(cfg.break_min).max(1);
            if cfg.overlay {
                st.on_break_until = Some(now + m as i64 * MIN);
            } else {
                st.active_since = now;
            }
            return Some(Event::PrayerBreak(p.name.clone(), m));
        }
        // Istirahat jatuh tempo, tetapi sholat sebentar lagi: tunda sampai adzan.
        if worked >= work && p.delta_min > 0 && p.delta_min * MIN <= window && worked < work + window {
            return None;
        }
    }
    if worked >= work {
        st.last_eye = now;
        if cfg.overlay {
            st.on_break_until = Some(now + cfg.break_min.max(1) as i64 * MIN);
        } else {
            st.active_since = now;
        }
        return Some(Event::Break(cfg.break_min));
    }
    if cfg.eye_enabled && now - st.last_eye >= cfg.eye_every.max(1) as i64 * MIN {
        st.last_eye = now;
        return Some(Event::Eye(cfg.eye_sec));
    }
    None
}

pub static STATE: Mutex<Option<State>> = Mutex::new(None);

pub fn load_cfg(app: &AppHandle) -> BreakConfig {
    let state = app.state::<AppState>();
    state.with(|c| db::get_setting(c, KEY)).ok().flatten().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
}

/// Lama komputer tidak disentuh (detik). Hanya tersedia di Windows.
#[cfg(windows)]
pub fn idle_seconds() -> u64 {
    use windows_sys::Win32::System::SystemInformation::GetTickCount;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    // SAFETY: struktur sudah diinisialisasi dengan cbSize yang benar.
    unsafe {
        if GetLastInputInfo(&mut info) == 0 {
            return 0;
        }
        (GetTickCount().wrapping_sub(info.dwTime) / 1000) as u64
    }
}

#[cfg(not(windows))]
pub fn idle_seconds() -> u64 {
    0
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub enabled: bool,
    pub working_min: i64,
    pub next_break_min: i64,
    pub on_break_until: Option<i64>,
    pub break_min: u32,
}

pub fn status(app: &AppHandle, now: i64) -> Status {
    let cfg = load_cfg(app);
    let st = STATE.lock().ok().and_then(|g| g.clone()).unwrap_or_default();
    let active = if st.active_since == 0 { 0 } else { (now - st.active_since) / MIN };
    Status {
        enabled: cfg.enabled,
        working_min: active,
        next_break_min: (cfg.work_min as i64 - active).max(0),
        on_break_until: st.on_break_until,
        break_min: cfg.break_min,
    }
}

fn log(app: &AppHandle, field: &str) {
    let state = app.state::<AppState>();
    let date = chrono::Local::now().format("%Y-%m-%d").to_string();
    let id = format!("break:{date}");
    let _ = state.with(|c| {
        let mut data = db::get(c, &id)?.filter(|r| !r.deleted).map(|r| r.data).unwrap_or_else(|| serde_json::json!({ "date": date }));
        let n = data.get(field).and_then(|v| v.as_i64()).unwrap_or(0) + 1;
        data[field] = serde_json::json!(n);
        db::upsert(c, &id, "breaklog", data).map(|_| ())
    });
    let _ = app.emit("records-changed", "breaklog");
}

fn show_overlay(app: &AppHandle) {
    let w = match app.get_webview_window(LABEL) {
        Some(w) => w,
        None => match WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("index.html".into()))
            .disable_drag_drop_handler()
            .title("Waktunya istirahat")
            .initialization_script("window.__RUANGKU_BREAK__ = true;")
            .transparent(true)
            .decorations(false)
            .shadow(false)
            .skip_taskbar(true)
            .always_on_top(true)
            .resizable(false)
            .visible(false)
            .build()
        {
            Ok(w) => w,
            Err(_) => return,
        },
    };
    if let Some(m) = app.primary_monitor().ok().flatten() {
        let _ = w.set_position(PhysicalPosition::new(m.position().x, m.position().y));
        let _ = w.set_size(PhysicalSize::new(m.size().width, m.size().height));
    }
    let _ = w.show();
    let _ = w.set_always_on_top(true);
    let _ = w.set_focus();
}

fn hide_overlay(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.hide();
    }
}

/// Sholat wajib terdekat (yang baru lewat ≤ 2 menit atau yang akan datang) hari ini.
pub fn next_prayer(conn: &rusqlite::Connection, now: i64) -> Option<PrayerCtx> {
    use chrono::{Datelike, TimeZone, Timelike};
    let ib: crate::notify::IbadahConfig = db::get(conn, crate::notify::IBADAH_CONFIG_ID)
        .ok()
        .flatten()
        .filter(|r| !r.deleted)
        .and_then(|r| serde_json::from_value(r.data).ok())?;
    if !ib.setup || ib.udzur_active {
        return None;
    }
    let t = chrono::Local.timestamp_millis_opt(now).single()?;
    let times = crate::prayer::compute(t.year(), t.month(), t.day(), &ib.location(), &ib.offsets);
    let min_now = (t.hour() * 60 + t.minute()) as i64;
    let list = [("subuh", "Subuh", times.subuh), ("dzuhur", "Dzuhur", times.dzuhur), ("ashar", "Ashar", times.ashar), ("maghrib", "Maghrib", times.maghrib), ("isya", "Isya", times.isya)];
    list.iter()
        .map(|(id, name, at)| (id, name, *at as i64 - min_now))
        .filter(|(_, _, d)| *d >= -2)
        .min_by_key(|(_, _, d)| *d)
        .map(|(id, name, d)| PrayerCtx { key: format!("{}:{id}", t.format("%Y-%m-%d")), name: name.to_string(), delta_min: d })
}

/// Dipanggil dari tugas latar tiap 15 detik.
pub fn tick(app: &AppHandle, now: i64) {
    let cfg = load_cfg(app);
    let quiet = {
        let state = app.state::<AppState>();
        state.with(|c| Ok(crate::notify::quiet_now(c, &chrono::Local, now))).unwrap_or(false)
    };
    let prayer = {
        let state = app.state::<AppState>();
        state.with(|c| Ok(next_prayer(c, now))).ok().flatten()
    };
    let ev = {
        let Ok(mut g) = STATE.lock() else { return };
        let st = g.get_or_insert_with(State::default);
        step_with_prayer(&cfg, st, now, idle_seconds(), quiet, prayer.as_ref())
    };
    match ev {
        Some(Event::Break(m)) => {
            crate::notify_user(app, "Waktunya istirahat", &format!("Anda sudah bekerja {} menit. Istirahat {m} menit: berdiri, minum air, regangkan badan.", cfg.work_min));
            if cfg.overlay {
                show_overlay(app);
            } else {
                log(app, "taken");
            }
            let _ = app.emit("break-state", "start");
        }
        Some(Event::PrayerBreak(name, m)) => {
            crate::notify_user(app, &format!("Waktunya {name}"), &format!("Istirahat {m} menit sekalian sholat {name}. Kerja Anda bisa ditinggal dulu."));
            if cfg.overlay {
                show_overlay(app);
            } else {
                log(app, "taken");
            }
            let _ = app.emit("break-state", format!("prayer:{name}"));
        }
        Some(Event::Eye(s)) => {
            crate::notify_user(app, "Istirahatkan mata", &format!("Lihat benda sejauh ±6 meter selama {s} detik."));
            log(app, "eye");
        }
        Some(Event::End) => {
            hide_overlay(app);
            log(app, "taken");
            crate::notify_user(app, "Istirahat selesai", "Selamat lanjut bekerja. Bismillah.");
            let _ = app.emit("break-state", "end");
        }
        None => {}
    }
}

/// Aksi dari layar istirahat atau pengaturan: "skip", "snooze", "done", "start".
pub fn action(app: &AppHandle, what: &str, now: i64) {
    let cfg = load_cfg(app);
    {
        let Ok(mut g) = STATE.lock() else { return };
        let st = g.get_or_insert_with(State::default);
        match what {
            "skip" | "done" => {
                st.on_break_until = None;
                st.active_since = now;
                st.last_eye = now;
            }
            "snooze" => {
                st.on_break_until = None;
                st.snooze_until = now + cfg.snooze_min.max(1) as i64 * MIN;
            }
            "start" => {
                st.on_break_until = Some(now + cfg.break_min.max(1) as i64 * MIN);
                st.last_tick = now;
            }
            _ => return,
        }
    }
    match what {
        "skip" => log(app, "skipped"),
        "done" => log(app, "taken"),
        _ => {}
    }
    if what == "start" {
        show_overlay(app);
    } else {
        hide_overlay(app);
    }
    let _ = app.emit("break-state", what);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cfg() -> BreakConfig {
        BreakConfig::default()
    }

    fn pr(delta: i64) -> PrayerCtx {
        PrayerCtx { key: "2026-10-27:dzuhur".into(), name: "Dzuhur".into(), delta_min: delta }
    }

    #[test]
    fn break_waits_for_nearby_prayer_then_fires_at_adzan() {
        let c = cfg(); // kerja 50, jendela 20, istirahat sholat 15
        let mut st = State::default();
        let t0 = 1_000 * MIN;
        step_with_prayer(&c, &mut st, t0, 0, false, None);
        // Menit ke-50: istirahat jatuh tempo, tetapi Dzuhur 10 menit lagi → ditunda.
        let mut t = t0;
        for i in 1..=50 {
            t = t0 + i * MIN;
            let e = step_with_prayer(&c, &mut st, t, 0, false, Some(&pr(60 - i)));
            assert!(!matches!(e, Some(Event::Break(_)) | Some(Event::PrayerBreak(..))), "menit {i}: {e:?}");
        }
        // Menunggu sampai adzan (menit ke-60): istirahat sholat.
        let mut e = None;
        for i in 51..=60 {
            t = t0 + i * MIN;
            e = step_with_prayer(&c, &mut st, t, 0, false, Some(&pr(60 - i)));
            if i < 60 {
                assert!(!matches!(e, Some(Event::Break(_)) | Some(Event::PrayerBreak(..))), "menit {i}: {e:?}");
            }
        }
        assert_eq!(e, Some(Event::PrayerBreak("Dzuhur".into(), 15)));
        assert_eq!(st.on_break_until, Some(t + 15 * MIN));
        // Tidak berulang untuk sholat yang sama.
        st.on_break_until = None;
        st.active_since = 0;
        assert!(!matches!(step_with_prayer(&c, &mut st, t + MIN, 0, false, Some(&pr(-1))), Some(Event::PrayerBreak(..))));
    }

    #[test]
    fn adzan_early_in_work_session_does_not_force_break() {
        let c = cfg();
        let mut st = State::default();
        let t0 = 5_000 * MIN;
        step_with_prayer(&c, &mut st, t0, 0, false, None);
        // Baru kerja 10 menit saat adzan: bukan waktu istirahat.
        let e = step_with_prayer(&c, &mut st, t0 + 10 * MIN, 0, false, Some(&pr(0)));
        assert!(!matches!(e, Some(Event::PrayerBreak(..))));
        // Sholat masih jauh (40 menit) saat jatuh tempo: istirahat biasa.
        let mut st = State::default();
        step_with_prayer(&c, &mut st, t0, 0, false, None);
        let mut got = None;
        for i in 1..=50 {
            if let Some(e) = step_with_prayer(&c, &mut st, t0 + i * MIN, 0, false, Some(&pr(90 - i))) {
                if matches!(e, Event::Break(_)) {
                    got = Some(e);
                }
            }
        }
        assert_eq!(got, Some(Event::Break(10)));
    }

    #[test]
    fn work_then_break_then_end() {
        let c = cfg();
        let mut st = State::default();
        let t0 = 1_000_000_000_000;
        assert_eq!(step(&c, &mut st, t0, 0, false), None);
        // istirahat mata setiap 20 menit
        let mut eye = 0;
        let mut t = t0;
        let mut got_break = None;
        while t < t0 + 60 * MIN {
            t += MIN / 4;
            match step(&c, &mut st, t, 0, false) {
                Some(Event::Eye(_)) => eye += 1,
                Some(Event::Break(m)) => {
                    got_break = Some((t, m));
                    break;
                }
                _ => {}
            }
        }
        assert_eq!(eye, 2);
        let (tb, m) = got_break.unwrap();
        assert_eq!((tb - t0) / MIN, 50);
        assert_eq!(m, 10);
        assert_eq!(step(&c, &mut st, tb + 5 * MIN - 1, 0, false), None);
        // jeda tick < 5 menit supaya tidak dianggap tidur
        let mut t = tb;
        let mut end = None;
        while t < tb + 11 * MIN {
            t += MIN;
            if let Some(e) = step(&c, &mut st, t, 0, false) {
                end = Some(e);
                break;
            }
        }
        assert_eq!(end, Some(Event::End));
        assert_eq!(st.active_since, tb + 10 * MIN);
    }

    #[test]
    fn idle_and_sleep_reset_the_clock() {
        let c = cfg();
        let mut st = State::default();
        let t0 = 1_000_000_000_000;
        step(&c, &mut st, t0, 0, false);
        for i in 1..=160 {
            let idle = if i == 120 { 6 * 60 } else { 0 };
            assert!(!matches!(step(&c, &mut st, t0 + i * MIN / 4, idle, false), Some(Event::Break(_))));
        }
        assert_eq!(st.active_since, t0 + 120 * MIN / 4);
        // tidur 2 jam: dihitung mulai lagi
        let wake = t0 + 4 * 60 * MIN;
        assert_eq!(step(&c, &mut st, wake, 0, false), None);
        assert_eq!(st.active_since, wake);
    }

    #[test]
    fn quiet_hours_and_disabled() {
        let mut c = cfg();
        let mut st = State::default();
        let t0 = 1_000_000_000_000;
        step(&c, &mut st, t0, 0, true);
        let mut t = t0;
        for _ in 0..240 {
            t += MIN / 4;
            assert_eq!(step(&c, &mut st, t, 0, true), None);
        }
        c.enabled = false;
        assert_eq!(step(&c, &mut st, t + MIN, 0, false), None);
        assert_eq!(st.active_since, t + MIN);
        let partial: BreakConfig = serde_json::from_str(r#"{"workMin":25,"breakMin":5}"#).unwrap();
        assert_eq!((partial.work_min, partial.break_min, partial.eye_every), (25, 5, 20));
    }
}
