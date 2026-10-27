//! Penjadwal reminder yang berjalan di proses Rust, sehingga notifikasi tetap
//! muncul walau jendela aplikasi disembunyikan ke system tray.
//!
//! Bentuk data reminder (`kind = "reminder"`):
//! `{ title, notes?, dueAt (ms), repeat: none|daily|weekdays|weekly|monthly,
//!    leadMinutes?, done, firedFor? }`
//! `firedFor` menyimpan `dueAt` yang sudah dinotifikasikan supaya notifikasi
//! tidak muncul dua kali.

use crate::db;
use chrono::{DateTime, Datelike, Duration, TimeZone, Weekday};
use rusqlite::Connection;
use serde_json::Value;

#[derive(Debug, Clone, PartialEq)]
pub struct Fired {
    pub id: String,
    pub title: String,
    pub body: String,
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (ny, nm) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
    chrono::NaiveDate::from_ymd_opt(ny, nm, 1)
        .unwrap()
        .pred_opt()
        .unwrap()
        .day()
}

fn step<Tz: TimeZone>(t: &DateTime<Tz>, repeat: &str, anchor_day: u32) -> Option<DateTime<Tz>> {
    match repeat {
        "daily" => Some(t.clone() + Duration::days(1)),
        "weekly" => Some(t.clone() + Duration::weeks(1)),
        "weekdays" => {
            let mut n = t.clone() + Duration::days(1);
            while matches!(n.weekday(), Weekday::Sat | Weekday::Sun) {
                n += Duration::days(1);
            }
            Some(n)
        }
        "monthly" => {
            let (y, m) = if t.month() == 12 { (t.year() + 1, 1) } else { (t.year(), t.month() + 1) };
            let d = anchor_day.min(days_in_month(y, m));
            let naive = t.date_naive().with_day(1)?.with_year(y)?.with_month(m)?.with_day(d)?;
            let dt = naive.and_time(t.time());
            t.timezone().from_local_datetime(&dt).earliest()
        }
        _ => None,
    }
}

/// Jadwal berikutnya yang lebih besar dari `now_ms`. `None` jika tidak berulang.
/// `anchor_day` = tanggal asli untuk pengulangan bulanan (mis. 31 tetap 31
/// pada bulan yang punya 31 hari).
pub fn next_occurrence<Tz: TimeZone>(
    tz: &Tz,
    due_ms: i64,
    repeat: &str,
    anchor_day: Option<u32>,
    now_ms: i64,
) -> Option<i64> {
    let mut t = tz.timestamp_millis_opt(due_ms).single()?;
    let anchor = anchor_day.unwrap_or(t.day());
    let mut guard = 0;
    loop {
        t = step(&t, repeat, anchor)?;
        if t.timestamp_millis() > now_ms {
            return Some(t.timestamp_millis());
        }
        guard += 1;
        if guard > 20_000 {
            return None;
        }
    }
}

fn fmt_time<Tz: TimeZone>(tz: &Tz, ms: i64) -> String
where
    Tz::Offset: std::fmt::Display,
{
    tz.timestamp_millis_opt(ms)
        .single()
        .map(|t| t.format("%H:%M").to_string())
        .unwrap_or_default()
}

/// Periksa semua reminder, perbarui yang sudah jatuh tempo, dan kembalikan
/// daftar notifikasi yang harus ditampilkan.
pub fn tick<Tz: TimeZone>(conn: &Connection, tz: &Tz, now_ms: i64) -> rusqlite::Result<Vec<Fired>>
where
    Tz::Offset: std::fmt::Display,
{
    let mut fired = Vec::new();
    for rec in db::list(conn, "reminder")? {
        let mut data = rec.data.clone();
        let Some(obj) = data.as_object_mut() else { continue };
        if obj.get("done").and_then(Value::as_bool).unwrap_or(false) {
            continue;
        }
        let Some(due) = obj.get("dueAt").and_then(Value::as_i64) else { continue };
        let repeat = obj.get("repeat").and_then(Value::as_str).unwrap_or("none").to_string();
        let lead = obj.get("leadMinutes").and_then(Value::as_i64).unwrap_or(0).max(0);
        let fired_for = obj.get("firedFor").and_then(Value::as_i64);
        let mut changed = false;

        if now_ms >= due - lead * 60_000 && fired_for != Some(due) {
            let title = obj.get("title").and_then(Value::as_str).unwrap_or("Reminder").to_string();
            let notes = obj.get("notes").and_then(Value::as_str).unwrap_or("").trim().to_string();
            let when = if now_ms > due + 5 * 60_000 {
                format!("Terlewat sejak {}", fmt_time(tz, due))
            } else if now_ms < due {
                format!("Pukul {} ({} menit lagi)", fmt_time(tz, due), (due - now_ms + 59_999) / 60_000)
            } else {
                format!("Sekarang, pukul {}", fmt_time(tz, due))
            };
            let body = if notes.is_empty() { when } else { format!("{when}\n{notes}") };
            fired.push(Fired { id: rec.id.clone(), title, body });
            obj.insert("firedFor".into(), Value::from(due));
            changed = true;
        }

        // Reminder berulang yang sudah lewat waktunya pindah ke jadwal berikutnya.
        if repeat != "none" && now_ms >= due {
            let anchor = obj.get("anchorDay").and_then(Value::as_u64).map(|d| d as u32);
            if let Some(next) = next_occurrence(tz, due, &repeat, anchor, now_ms) {
                if anchor.is_none() {
                    if let Some(t) = tz.timestamp_millis_opt(due).single() {
                        obj.insert("anchorDay".into(), Value::from(t.day()));
                    }
                }
                obj.insert("dueAt".into(), Value::from(next));
                let count = obj.get("completedCount").and_then(Value::as_i64).unwrap_or(0);
                obj.insert("completedCount".into(), Value::from(count + 1));
                changed = true;
            }
        }

        if changed {
            db::upsert(conn, &rec.id, &rec.kind, data)?;
        }
    }
    Ok(fired)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;
    use serde_json::json;

    fn wib() -> FixedOffset {
        FixedOffset::east_opt(7 * 3600).unwrap()
    }
    fn at(y: i32, m: u32, d: u32, h: u32, mi: u32) -> i64 {
        wib().with_ymd_and_hms(y, m, d, h, mi, 0).unwrap().timestamp_millis()
    }

    #[test]
    fn daily_and_weekly() {
        let due = at(2026, 10, 26, 9, 0);
        assert_eq!(next_occurrence(&wib(), due, "daily", None, due), Some(at(2026, 10, 27, 9, 0)));
        // terlewat 3 hari -> lompat ke hari berikutnya setelah sekarang
        let now = at(2026, 10, 29, 10, 0);
        assert_eq!(next_occurrence(&wib(), due, "daily", None, now), Some(at(2026, 10, 30, 9, 0)));
        assert_eq!(next_occurrence(&wib(), due, "weekly", None, due), Some(at(2026, 11, 2, 9, 0)));
        assert_eq!(next_occurrence(&wib(), due, "none", None, due), None);
    }

    #[test]
    fn weekdays_skip_weekend() {
        // Jumat 30 Okt 2026 -> Senin 2 Nov
        let fri = at(2026, 10, 30, 8, 0);
        assert_eq!(next_occurrence(&wib(), fri, "weekdays", None, fri), Some(at(2026, 11, 2, 8, 0)));
    }

    #[test]
    fn monthly_clamps_and_keeps_anchor() {
        let jan31 = at(2027, 1, 31, 7, 30);
        let feb = next_occurrence(&wib(), jan31, "monthly", None, jan31).unwrap();
        assert_eq!(feb, at(2027, 2, 28, 7, 30));
        let mar = next_occurrence(&wib(), feb, "monthly", Some(31), feb).unwrap();
        assert_eq!(mar, at(2027, 3, 31, 7, 30));
        let dec = at(2026, 12, 15, 7, 0);
        assert_eq!(next_occurrence(&wib(), dec, "monthly", None, dec), Some(at(2027, 1, 15, 7, 0)));
    }

    #[test]
    fn tick_fires_once_and_advances_recurring() {
        let conn = db::open_in_memory().unwrap();
        let due = at(2026, 10, 26, 9, 0);
        db::upsert(&conn, "r1", "reminder", json!({"title": "Stand-up", "dueAt": due, "repeat": "daily", "done": false})).unwrap();
        db::upsert(&conn, "r2", "reminder", json!({"title": "Bayar listrik", "dueAt": due, "repeat": "none", "done": false, "leadMinutes": 15})).unwrap();
        db::upsert(&conn, "r3", "reminder", json!({"title": "Selesai", "dueAt": due, "repeat": "none", "done": true})).unwrap();

        // 10 menit sebelum: hanya r2 (lead 15 menit) yang berbunyi
        let f = tick(&conn, &wib(), at(2026, 10, 26, 8, 50)).unwrap();
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].id, "r2");
        assert!(f[0].body.contains("10 menit lagi"));

        // tepat waktu: r1 berbunyi, r2 tidak dua kali
        let f = tick(&conn, &wib(), due).unwrap();
        assert_eq!(f.iter().map(|x| x.id.as_str()).collect::<Vec<_>>(), vec!["r1"]);
        let r1 = db::get(&conn, "r1").unwrap().unwrap();
        assert_eq!(r1.data["dueAt"], at(2026, 10, 27, 9, 0));

        // tidak ada yang berbunyi lagi
        assert!(tick(&conn, &wib(), due + 60_000).unwrap().is_empty());
    }
}
