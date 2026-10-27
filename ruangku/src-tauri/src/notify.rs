//! Penjadwal notifikasi terpadu (selain reminder biasa di `reminders.rs`):
//! blok aktivitas, ibadah (sholat wajib, sunnah, puasa), dan evaluasi.
//!
//! Setiap kejadian punya kunci unik per tanggal. Kunci yang sudah dikirim
//! disimpan di setting `notif_fired`, jadi notifikasi tidak terulang setelah
//! aplikasi dibuka ulang. Kejadian yang terlewat lebih dari 15 menit (mis.
//! komputer baru dinyalakan) tidak dikirim lagi.

use crate::db;
use crate::prayer::{self, Location, Offsets};
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Weekday};
use rusqlite::Connection;
use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;

pub const IBADAH_CONFIG_ID: &str = "ibadah-config";
pub const NOTIF_CONFIG_ID: &str = "notif-config";
const LATE_LIMIT_MS: i64 = 15 * 60_000;

#[derive(Debug, Clone, PartialEq)]
pub struct Event {
    pub key: String,
    pub at: NaiveDateTime,
    pub title: String,
    pub body: String,
    /// Ikut dibisukan pada jam tenang.
    pub quiet_applies: bool,
}

// ---------- Konfigurasi (dibaca dari record yang ditulis frontend) ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ItemCfg {
    pub on: bool,
}
impl Default for ItemCfg {
    fn default() -> Self {
        Self { on: true }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct IbadahReminders {
    pub enabled: bool,
    pub prayer_before: i64,
    pub prayer_at_time: bool,
    pub fasting: bool,
    pub sahur_before_imsak: i64,
    pub dhuha: bool,
    pub tahajud: bool,
    pub dzikir: bool,
    pub tilawah: bool,
    pub mute_during_udzur: bool,
}
impl Default for IbadahReminders {
    fn default() -> Self {
        Self {
            enabled: true,
            prayer_before: 10,
            prayer_at_time: true,
            fasting: true,
            sahur_before_imsak: 45,
            dhuha: true,
            tahajud: true,
            dzikir: true,
            tilawah: true,
            mute_during_udzur: true,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct IbadahConfig {
    pub setup: bool,
    pub city: String,
    pub lat: f64,
    pub lng: f64,
    pub tz: f64,
    pub elevation: f64,
    pub offsets: Offsets,
    pub hijri_offset: i32,
    pub prayer_target: String,
    pub items: BTreeMap<String, ItemCfg>,
    pub reminders: IbadahReminders,
    pub udzur_active: bool,
}

impl IbadahConfig {
    pub fn on(&self, id: &str) -> bool {
        self.items.get(id).map(|i| i.on).unwrap_or(true)
    }
    pub fn location(&self) -> Location {
        Location { lat: self.lat, lng: self.lng, tz: if self.tz == 0.0 { 7.0 } else { self.tz }, elevation: self.elevation }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct BlockNotif {
    pub enabled: bool,
    pub lead: i64,
    pub at_end: bool,
}
impl Default for BlockNotif {
    fn default() -> Self {
        Self { enabled: true, lead: 5, at_end: true }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Quiet {
    pub enabled: bool,
    pub start: String,
    pub end: String,
}
impl Default for Quiet {
    fn default() -> Self {
        Self { enabled: true, start: "22:00".into(), end: "05:00".into() }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReviewTime {
    pub on: bool,
    pub time: String,
    /// Untuk evaluasi mingguan: 0 = Minggu ... 6 = Sabtu
    pub day: u32,
}
impl Default for ReviewTime {
    fn default() -> Self {
        Self { on: true, time: "21:00".into(), day: 0 }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct ReviewNotif {
    pub daily: ReviewTime,
    pub weekly: ReviewTime,
    pub monthly: ReviewTime,
}
impl Default for ReviewNotif {
    fn default() -> Self {
        Self {
            daily: ReviewTime { on: true, time: "21:00".into(), day: 0 },
            weekly: ReviewTime { on: true, time: "20:00".into(), day: 0 },
            monthly: ReviewTime { on: true, time: "20:30".into(), day: 0 },
        }
    }
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct NotifConfig {
    pub blocks: BlockNotif,
    pub quiet: Quiet,
    pub review: ReviewNotif,
}

fn hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let (h, m): (u32, u32) = (h.parse().ok()?, m.parse().ok()?);
    (h < 24 && m < 60).then_some(h * 60 + m)
}

fn at(date: NaiveDate, minutes: i64) -> NaiveDateTime {
    date.and_time(NaiveTime::MIN) + Duration::minutes(minutes)
}

fn fmt(minutes: i64) -> String {
    let m = minutes.rem_euclid(1440);
    format!("{:02}:{:02}", m / 60, m % 60)
}

pub fn in_quiet(q: &Quiet, t: NaiveDateTime) -> bool {
    if !q.enabled {
        return false;
    }
    let (Some(s), Some(e)) = (hhmm(&q.start), hhmm(&q.end)) else { return false };
    let m = t.hour_minute();
    if s <= e {
        m >= s && m < e
    } else {
        m >= s || m < e
    }
}

trait HourMinute {
    fn hour_minute(&self) -> u32;
}
impl HourMinute for NaiveDateTime {
    fn hour_minute(&self) -> u32 {
        use chrono::Timelike;
        self.hour() * 60 + self.minute()
    }
}

// ---------- Puasa ----------

/// Jenis puasa yang berlaku pada tanggal masehi ini (sebelum dicek aktif/tidaknya).
pub fn fasting_kinds(date: NaiveDate, hijri_offset: i32) -> Vec<&'static str> {
    let (_, hm, hd) = prayer::hijri(date.year(), date.month(), date.day(), hijri_offset);
    let forbidden = (hm == 10 && hd == 1) || (hm == 12 && (10..=13).contains(&hd));
    if forbidden {
        return vec![];
    }
    if hm == 9 {
        return vec!["puasa_ramadan"];
    }
    let mut v = vec![];
    if matches!(date.weekday(), Weekday::Mon | Weekday::Thu) {
        v.push("puasa_senin_kamis");
    }
    if (13..=15).contains(&hd) {
        v.push("puasa_ayyamul_bidh");
    }
    if hm == 12 && hd == 9 {
        v.push("puasa_arafah");
    }
    if hm == 1 && (hd == 9 || hd == 10) {
        v.push("puasa_asyura");
    }
    v
}

const FAST_LABEL: &[(&str, &str)] = &[
    ("puasa_ramadan", "puasa Ramadan"),
    ("puasa_senin_kamis", "puasa Senin-Kamis"),
    ("puasa_ayyamul_bidh", "puasa Ayyamul Bidh"),
    ("puasa_arafah", "puasa Arafah"),
    ("puasa_asyura", "puasa Tasu'a/Asyura"),
];

fn active_fasts(cfg: &IbadahConfig, date: NaiveDate) -> Vec<&'static str> {
    fasting_kinds(date, cfg.hijri_offset).into_iter().filter(|k| cfg.on(k)).collect()
}

// ---------- Kejadian ----------

const PRAYERS: [(&str, &str); 5] = [("subuh", "Subuh"), ("dzuhur", "Dzuhur"), ("ashar", "Ashar"), ("maghrib", "Maghrib"), ("isya", "Isya")];

pub fn ibadah_events(cfg: &IbadahConfig, date: NaiveDate) -> Vec<Event> {
    let r = &cfg.reminders;
    if !cfg.setup || !r.enabled {
        return vec![];
    }
    let loc = cfg.location();
    let t = prayer::compute(date.year(), date.month(), date.day(), &loc, &cfg.offsets);
    let mute = cfg.udzur_active && r.mute_during_udzur;
    let d = date.format("%Y-%m-%d").to_string();
    let mut ev = vec![];
    let mut push = |key: &str, minutes: i64, title: String, body: String| {
        ev.push(Event { key: format!("{d}:{key}"), at: at(date, minutes), title, body, quiet_applies: false });
    };
    let times = [t.subuh, t.dzuhur, t.ashar, t.maghrib, t.isya];

    if !mute {
        for (i, (id, name)) in PRAYERS.iter().enumerate() {
            let m = times[i] as i64;
            if r.prayer_before > 0 {
                let hint = if cfg.prayer_target == "awal" { "Bersiap wudhu dan sholat di awal waktu." } else { "Bersiap wudhu dan berangkat ke masjid." };
                push(&format!("pre-{id}"), m - r.prayer_before, format!("{name} {} menit lagi", r.prayer_before), format!("Pukul {}. {hint}", fmt(m)));
            }
            if r.prayer_at_time {
                push(&format!("adzan-{id}"), m, format!("Waktu {name} telah masuk"), format!("Pukul {}. Jangan lupa catat sholatmu di Ruangku.", fmt(m)));
            }
        }
        if r.dhuha && cfg.on("dhuha") {
            push("dhuha", t.dhuha as i64 + 15, "Waktu sholat Dhuha".into(), format!("Dhuha sudah masuk sejak {} sampai menjelang Dzuhur.", fmt(t.dhuha as i64)));
        }
        if r.tahajud && cfg.on("tahajud") {
            let prev = date - Duration::days(1);
            let tp = prayer::compute(prev.year(), prev.month(), prev.day(), &loc, &cfg.offsets);
            let third = prayer::last_third_of_night(tp.maghrib, t.subuh) as i64;
            push("tahajud", third, "Sepertiga malam terakhir".into(), format!("Waktu terbaik untuk tahajud dan witir, sampai Subuh pukul {}.", fmt(t.subuh as i64)));
        }
    }
    if r.dzikir {
        if cfg.on("dzikir_pagi") {
            push("dzikir-pagi", t.subuh as i64 + 30, "Dzikir pagi".into(), "Luangkan beberapa menit untuk dzikir al-ma'tsurat pagi.".into());
        }
        if cfg.on("dzikir_petang") {
            push("dzikir-petang", t.ashar as i64 + 30, "Dzikir petang".into(), "Luangkan beberapa menit untuk dzikir al-ma'tsurat petang.".into());
        }
    }
    if r.tilawah && cfg.on("tilawah") {
        push("tilawah", t.isya as i64 + 45, "Tilawah Al-Qur'an".into(), "Sudah memenuhi target tilawah hari ini?".into());
    }

    if r.fasting && !mute {
        let today = active_fasts(cfg, date);
        if let Some(first) = today.first() {
            let label = FAST_LABEL.iter().find(|(k, _)| k == first).map(|(_, l)| *l).unwrap_or("puasa");
            if r.sahur_before_imsak > 0 {
                push("sahur", t.imsak as i64 - r.sahur_before_imsak, "Waktunya sahur".into(), format!("Hari ini {label}. Imsak pukul {}, Subuh {}.", fmt(t.imsak as i64), fmt(t.subuh as i64)));
            }
            push("imsak", t.imsak as i64, "Imsak".into(), format!("Subuh pukul {}. Semoga puasanya lancar.", fmt(t.subuh as i64)));
            push("berbuka", t.maghrib as i64, "Waktunya berbuka".into(), format!("Maghrib pukul {}. Selamat berbuka, jangan lupa doa berbuka.", fmt(t.maghrib as i64)));
        }
        let tomorrow = date + Duration::days(1);
        if let Some(first) = active_fasts(cfg, tomorrow).first() {
            let label = FAST_LABEL.iter().find(|(k, _)| k == first).map(|(_, l)| *l).unwrap_or("puasa");
            push("niat-puasa", 20 * 60 + 30, format!("Besok {label}"), "Niatkan dari malam ini dan siapkan sahur.".into());
        }
    }
    ev
}

pub fn block_events(cfg: &NotifConfig, date: NaiveDate, blocks: &[db::Record]) -> Vec<Event> {
    if !cfg.blocks.enabled {
        return vec![];
    }
    let d = date.format("%Y-%m-%d").to_string();
    let mut ev = vec![];
    for b in blocks {
        let x = &b.data;
        if x.get("date").and_then(Value::as_str) != Some(d.as_str()) || x.get("done").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }
        // Kelas yang dibatalkan tidak diingatkan.
        if x.get("attendance").and_then(Value::as_str) == Some("batal") {
            continue;
        }
        let kind = x.get("kind").and_then(Value::as_str).unwrap_or("");
        let (Some(start), Some(end)) = (x.get("start").and_then(Value::as_i64), x.get("end").and_then(Value::as_i64)) else { continue };
        // notify: "off" | angka menit sebelum mulai | tidak ada = default
        let lead = match x.get("notify") {
            Some(Value::String(s)) if s == "off" => continue,
            Some(v) if v.is_i64() => v.as_i64().unwrap().max(0),
            _ => cfg.blocks.lead,
        };
        let title = x.get("title").and_then(Value::as_str).unwrap_or("Aktivitas").to_string();
        let label = match kind {
            "rapat" => format!("Rapat {title}"),
            "kuliah" => format!("Kelas {title}"),
            _ => title.clone(),
        };
        let when = format!("{}–{}", fmt(start), fmt(end));
        let place = x.get("location").and_then(Value::as_str).filter(|s| !s.is_empty());
        let link = x.get("link").and_then(Value::as_str).filter(|s| !s.is_empty());
        let mut body = when.clone();
        if let Some(p) = place {
            body.push_str(&format!(" · {p}"));
        }
        if let Some(l) = link {
            body.push_str(&format!("\nGabung: {l}"));
        }
        let head = if lead == 0 { format!("Mulai sekarang: {label}") } else { format!("{lead} menit lagi: {label}") };
        ev.push(Event { key: format!("{d}:blk-start:{}:{start}", b.id), at: at(date, start - lead), title: head, body, quiet_applies: true });
        if cfg.blocks.at_end {
            let tail = match kind {
                "kuliah" => "Isi presensi dan catatan pertemuan di halaman Kuliah.",
                "rapat" => "Catat keputusan dan action item di halaman Rapat.",
                _ => "Sudah tuntas? Tandai selesai di widget.",
            };
            ev.push(Event {
                key: format!("{d}:blk-end:{}:{end}", b.id),
                at: at(date, end),
                title: format!("Selesai: {label}"),
                body: format!("{when}. {tail}"),
                quiet_applies: true,
            });
        }
    }
    ev
}

pub fn review_events(cfg: &NotifConfig, date: NaiveDate) -> Vec<Event> {
    let d = date.format("%Y-%m-%d").to_string();
    let mut ev = vec![];
    let r = &cfg.review;
    if r.daily.on {
        if let Some(m) = hhmm(&r.daily.time) {
            ev.push(Event { key: format!("{d}:review-day"), at: at(date, m as i64), title: "Evaluasi hari ini".into(), body: "Dua menit untuk muhasabah dan menyiapkan prioritas besok.".into(), quiet_applies: true });
        }
    }
    if r.weekly.on && date.weekday().num_days_from_sunday() == r.weekly.day {
        if let Some(m) = hhmm(&r.weekly.time) {
            ev.push(Event { key: format!("{d}:review-week"), at: at(date, m as i64), title: "Evaluasi mingguan".into(), body: "Lihat capaian minggu ini dan tetapkan 3 target minggu depan.".into(), quiet_applies: true });
        }
    }
    let last_day = (date + Duration::days(1)).month() != date.month();
    if r.monthly.on && last_day {
        if let Some(m) = hhmm(&r.monthly.time) {
            ev.push(Event { key: format!("{d}:review-month"), at: at(date, m as i64), title: "Evaluasi bulanan".into(), body: "Bulan ini hampir selesai. Saatnya melihat tren dan pelajaran utama.".into(), quiet_applies: true });
        }
    }
    ev
}

/// Kejadian yang harus dikirim sekarang: sudah waktunya, belum dikirim, dan tidak terlalu basi.
pub fn due<'a>(events: &'a [Event], now: NaiveDateTime, fired: &[String], quiet: &Quiet) -> Vec<&'a Event> {
    events
        .iter()
        .filter(|e| {
            let diff = (now - e.at).num_milliseconds();
            (0..LATE_LIMIT_MS).contains(&diff) && !fired.contains(&e.key) && !(e.quiet_applies && in_quiet(quiet, e.at))
        })
        .collect()
}

fn read_cfg<T: for<'de> Deserialize<'de> + Default>(conn: &Connection, id: &str) -> T {
    db::get(conn, id)
        .ok()
        .flatten()
        .filter(|r| !r.deleted)
        .and_then(|r| serde_json::from_value(r.data).ok())
        .unwrap_or_default()
}

/// Dipanggil berkala oleh tugas latar. Mengembalikan notifikasi untuk ditampilkan.
/// Apakah sekarang termasuk jam tenang (dipakai pengingat istirahat).
pub fn quiet_now<Tz: TimeZone>(conn: &Connection, tz: &Tz, now_ms: i64) -> bool {
    let Some(now) = tz.timestamp_millis_opt(now_ms).single().map(|t| t.naive_local()) else { return false };
    let nc: NotifConfig = read_cfg(conn, NOTIF_CONFIG_ID);
    in_quiet(&nc.quiet, now)
}

pub fn tick<Tz: TimeZone>(conn: &Connection, tz: &Tz, now_ms: i64) -> rusqlite::Result<Vec<Event>> {
    let Some(now) = tz.timestamp_millis_opt(now_ms).single().map(|t| t.naive_local()) else { return Ok(vec![]) };
    let ib: IbadahConfig = read_cfg(conn, IBADAH_CONFIG_ID);
    let nc: NotifConfig = read_cfg(conn, NOTIF_CONFIG_ID);
    let blocks = db::list(conn, "timeblock")?;
    let mut events = vec![];
    // Kemarin juga dihitung untuk kejadian yang melewati tengah malam.
    for date in [now.date() - Duration::days(1), now.date()] {
        events.extend(ibadah_events(&ib, date));
        events.extend(block_events(&nc, date, &blocks));
        events.extend(review_events(&nc, date));
    }
    let mut fired: Vec<String> = db::get_setting(conn, "notif_fired")?
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    let out: Vec<Event> = due(&events, now, &fired, &nc.quiet).into_iter().cloned().collect();
    // Tandai juga yang terlewat jauh/di jam tenang supaya tidak dicek ulang.
    let mut changed = false;
    for e in &events {
        if now >= e.at && !fired.contains(&e.key) {
            fired.push(e.key.clone());
            changed = true;
        }
    }
    if changed {
        // Simpan hanya kunci 3 hari terakhir.
        let keep = (now.date() - Duration::days(2)).format("%Y-%m-%d").to_string();
        fired.retain(|k| k.as_str() >= keep.as_str());
        db::set_setting(conn, "notif_fired", &serde_json::to_string(&fired).unwrap_or_default())?;
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn cfg() -> IbadahConfig {
        serde_json::from_value(json!({"setup": true, "city": "Jakarta", "lat": -6.2088, "lng": 106.8456, "tz": 7})).unwrap()
    }
    fn dt(y: i32, m: u32, d: u32, h: u32, mi: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, mi, 0).unwrap()
    }

    #[test]
    fn prayer_events_and_mute() {
        let d = NaiveDate::from_ymd_opt(2026, 10, 15).unwrap(); // Kamis
        let ev = ibadah_events(&cfg(), d);
        let dz = ev.iter().find(|e| e.key.ends_with("adzan-dzuhur")).unwrap();
        assert_eq!(dz.at, dt(2026, 10, 15, 11, 41));
        assert!(ev.iter().any(|e| e.key.ends_with("pre-subuh") && e.at == dt(2026, 10, 15, 4, 6)));
        // Kamis = puasa sunnah: ada sahur, imsak, berbuka
        assert!(ev.iter().any(|e| e.key.ends_with(":berbuka")));
        let mut c = cfg();
        c.udzur_active = true;
        let ev = ibadah_events(&c, d);
        assert!(!ev.iter().any(|e| e.key.contains("adzan") || e.key.contains("berbuka")));
        assert!(ev.iter().any(|e| e.key.ends_with("dzikir-pagi")));
        // belum diatur = tidak ada notifikasi
        assert!(ibadah_events(&IbadahConfig::default(), d).is_empty());
    }

    #[test]
    fn fasting_rules() {
        // 26 Okt 2026 Senin, sekitar 14 Jumadil Awal 1448 -> Senin-Kamis + Ayyamul Bidh
        let k = fasting_kinds(NaiveDate::from_ymd_opt(2026, 10, 26).unwrap(), 0);
        assert!(k.contains(&"puasa_senin_kamis") && k.contains(&"puasa_ayyamul_bidh"), "{k:?}");
        // cari 1 Syawal 1447 (sekitar 20 Maret 2026): tidak boleh ada puasa apa pun
        let mut d = NaiveDate::from_ymd_opt(2026, 3, 10).unwrap();
        while prayer::hijri(d.year(), d.month(), d.day(), 0).1 != 10 {
            d += Duration::days(1);
        }
        assert!(fasting_kinds(d, 0).is_empty());
        assert_eq!(fasting_kinds(d - Duration::days(1), 0), vec!["puasa_ramadan"]);
    }

    #[test]
    fn blocks_review_quiet_and_due() {
        let d = NaiveDate::from_ymd_opt(2026, 10, 26).unwrap();
        let rec = |id: &str, data: Value| db::Record { id: id.into(), kind: "timeblock".into(), data, updated_at: 0, deleted: false };
        let blocks = vec![
            rec("a", json!({"date": "2026-10-26", "start": 540, "end": 600, "title": "Fokus"})),
            rec("b", json!({"date": "2026-10-26", "start": 660, "end": 720, "title": "Rapat", "notify": 15})),
            rec("c", json!({"date": "2026-10-26", "start": 700, "end": 720, "title": "Diam", "notify": "off"})),
            rec("d", json!({"date": "2026-10-26", "start": 800, "end": 860, "title": "Beres", "done": true})),
        ];
        let nc = NotifConfig::default();
        let ev = block_events(&nc, d, &blocks);
        assert_eq!(ev.len(), 4);
        // Rapat & kuliah: tempat dan tautan masuk ke isi notifikasi; kelas batal tidak diingatkan.
        let special = vec![
            rec("m", json!({"date": "2026-10-26", "start": 600, "end": 660, "title": "Sprint review", "kind": "rapat", "location": "R. 2", "link": "https://meet.google.com/x"})),
            rec("k", json!({"date": "2026-10-26", "start": 780, "end": 880, "title": "AI5101", "kind": "kuliah", "attendance": "batal"})),
        ];
        let sev = block_events(&nc, d, &special);
        assert_eq!(sev.len(), 2);
        assert!(sev[1].body.contains("halaman Rapat"));
        assert_eq!(sev[0].title, "5 menit lagi: Rapat Sprint review");
        assert_eq!(sev[0].body, "10:00–11:00 · R. 2\nGabung: https://meet.google.com/x");
        assert_eq!(ev[0].at, dt(2026, 10, 26, 8, 55));
        assert_eq!(ev[2].at, dt(2026, 10, 26, 10, 45));
        // review: Senin bukan hari evaluasi mingguan; 31 Okt hari terakhir bulan
        assert_eq!(review_events(&nc, d).len(), 1);
        let last = NaiveDate::from_ymd_opt(2026, 10, 31).unwrap();
        assert!(review_events(&nc, last).iter().any(|e| e.key.ends_with("review-month")));
        assert!(review_events(&nc, NaiveDate::from_ymd_opt(2026, 11, 1).unwrap()).iter().any(|e| e.key.ends_with("review-week")));
        // jam tenang 22:00-05:00
        assert!(in_quiet(&nc.quiet, dt(2026, 10, 26, 23, 0)) && in_quiet(&nc.quiet, dt(2026, 10, 26, 4, 59)));
        assert!(!in_quiet(&nc.quiet, dt(2026, 10, 26, 5, 0)));
        // due: tepat waktu ya, terlambat >15 menit tidak, yang sudah dikirim tidak
        let now = dt(2026, 10, 26, 8, 56);
        assert_eq!(due(&ev, now, &[], &nc.quiet).len(), 1);
        assert_eq!(due(&ev, now, &[ev[0].key.clone()], &nc.quiet).len(), 0);
        assert_eq!(due(&ev, dt(2026, 10, 26, 9, 20), &[], &nc.quiet).len(), 0);
    }

    #[test]
    fn tick_fires_once() {
        let conn = db::open_in_memory().unwrap();
        db::upsert(&conn, "x", "timeblock", json!({"date": "2026-10-26", "start": 540, "end": 600, "title": "Fokus"})).unwrap();
        let tz = chrono::FixedOffset::east_opt(7 * 3600).unwrap();
        let ms = |h: u32, m: u32| tz.with_ymd_and_hms(2026, 10, 26, h, m, 0).unwrap().timestamp_millis();
        assert_eq!(tick(&conn, &tz, ms(8, 55)).unwrap().len(), 1);
        assert_eq!(tick(&conn, &tz, ms(8, 56)).unwrap().len(), 0);
        assert_eq!(tick(&conn, &tz, ms(10, 0)).unwrap().len(), 1); // selesai
    }
}
