//! Penyimpanan lokal berbasis SQLite.
//!
//! Semua data aplikasi (reminder, OKR, KPI, catatan, tag file) disimpan di satu
//! tabel `records` yang generik: setiap baris punya `id`, `kind`, isi `data`
//! (JSON), `updated_at` (milidetik epoch) dan penanda `deleted` (tombstone).
//! Bentuk ini membuat sinkronisasi antar-perangkat cukup dengan membandingkan
//! `updated_at` per baris (last-write-wins).

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub id: String,
    pub kind: String,
    pub data: Value,
    pub updated_at: i64,
    #[serde(default)]
    pub deleted: bool,
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    init(&conn)?;
    Ok(conn)
}

#[cfg(test)]
pub fn open_in_memory() -> rusqlite::Result<Connection> {
    let conn = Connection::open_in_memory()?;
    init(&conn)?;
    Ok(conn)
}

fn init(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA synchronous = NORMAL;
         CREATE TABLE IF NOT EXISTS records (
            id         TEXT PRIMARY KEY,
            kind       TEXT NOT NULL,
            data       TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            deleted    INTEGER NOT NULL DEFAULT 0
         );
         CREATE INDEX IF NOT EXISTS idx_records_kind ON records(kind, deleted);
         CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
         );",
    )
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<Record> {
    let data: String = row.get(2)?;
    Ok(Record {
        id: row.get(0)?,
        kind: row.get(1)?,
        data: serde_json::from_str(&data).unwrap_or(Value::Null),
        updated_at: row.get(3)?,
        deleted: row.get::<_, i64>(4)? != 0,
    })
}

/// Semua record aktif (bukan tombstone) dengan jenis tertentu.
pub fn list(conn: &Connection, kind: &str) -> rusqlite::Result<Vec<Record>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, data, updated_at, deleted FROM records
         WHERE kind = ?1 AND deleted = 0 ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map(params![kind], row_to_record)?;
    rows.collect()
}

/// Semua record termasuk tombstone (dipakai untuk sinkronisasi dan backup).
pub fn all(conn: &Connection) -> rusqlite::Result<Vec<Record>> {
    let mut stmt =
        conn.prepare("SELECT id, kind, data, updated_at, deleted FROM records ORDER BY id")?;
    let rows = stmt.query_map([], row_to_record)?;
    rows.collect()
}

pub fn get(conn: &Connection, id: &str) -> rusqlite::Result<Option<Record>> {
    conn.query_row(
        "SELECT id, kind, data, updated_at, deleted FROM records WHERE id = ?1",
        params![id],
        row_to_record,
    )
    .optional()
}

/// Tulis record apa adanya (termasuk `updated_at`). Dipakai oleh merge sync.
pub fn put_raw(conn: &Connection, rec: &Record) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO records (id, kind, data, updated_at, deleted)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
            kind = excluded.kind, data = excluded.data,
            updated_at = excluded.updated_at, deleted = excluded.deleted",
        params![
            rec.id,
            rec.kind,
            rec.data.to_string(),
            rec.updated_at,
            rec.deleted as i64
        ],
    )?;
    Ok(())
}

/// Kunci di dalam `data` yang mencatat waktu ubah tiap field (untuk merge per field).
pub const FIELD_TIMES: &str = "_ft";

/// Waktu ubah tiap field sebuah record. Record lama tanpa `_ft` memakai `updated_at`.
fn field_times(rec: &Record) -> HashMap<String, i64> {
    let mut m = HashMap::new();
    if let Some(obj) = rec.data.as_object() {
        let ft = obj.get(FIELD_TIMES).and_then(|v| v.as_object());
        for k in obj.keys().filter(|k| *k != FIELD_TIMES) {
            let t = ft.and_then(|f| f.get(k)).and_then(|v| v.as_i64()).unwrap_or(rec.updated_at);
            m.insert(k.clone(), t);
        }
        // Field yang sudah dihapus tetap diingat waktunya supaya penghapusan ikut tersinkron.
        if let Some(f) = ft {
            for (k, v) in f {
                m.entry(k.clone()).or_insert_with(|| v.as_i64().unwrap_or(0));
            }
        }
    }
    m
}

/// Tandai waktu ubah field yang berbeda dari versi sebelumnya.
fn stamp_fields(prev: Option<&Record>, data: Value, now: i64) -> Value {
    let Value::Object(mut obj) = data else { return data };
    obj.remove(FIELD_TIMES);
    let mut ft = serde_json::Map::new();
    match prev.filter(|p| !p.deleted && p.data.is_object()) {
        Some(p) => {
            let pt = field_times(p);
            let pobj = p.data.as_object().expect("objek");
            for (k, v) in &obj {
                let t = if pobj.get(k) == Some(v) { pt.get(k).copied().unwrap_or(p.updated_at) } else { now };
                ft.insert(k.clone(), Value::from(t));
            }
            for (k, t) in pt {
                if obj.contains_key(&k) {
                    continue;
                }
                // Baru dihapus sekarang, atau sudah terhapus sebelumnya.
                let t = if pobj.contains_key(&k) { now } else { t };
                ft.insert(k, Value::from(t));
            }
        }
        None => {
            for k in obj.keys() {
                ft.insert(k.clone(), Value::from(now));
            }
        }
    }
    obj.insert(FIELD_TIMES.into(), Value::Object(ft));
    Value::Object(obj)
}

/// Gabungkan dua versi record per field: tiap field memakai nilai yang paling baru diubah.
/// Hasilnya sama dari sisi mana pun dihitung (urutan argumen tidak berpengaruh).
pub fn merge_fields(a: &Record, b: &Record) -> Record {
    let (ta, tb) = (field_times(a), field_times(b));
    let empty = serde_json::Map::new();
    let oa = a.data.as_object().unwrap_or(&empty);
    let ob = b.data.as_object().unwrap_or(&empty);
    let mut keys: Vec<&String> = ta.keys().chain(tb.keys()).collect();
    keys.sort();
    keys.dedup();
    let mut out = serde_json::Map::new();
    let mut ft = serde_json::Map::new();
    for k in keys {
        let x = ta.get(k).copied().unwrap_or(i64::MIN);
        let y = tb.get(k).copied().unwrap_or(i64::MIN);
        let pick_b = if x != y {
            y > x
        } else {
            // Seri: pilih secara pasti berdasarkan isi supaya semua perangkat sepakat.
            let va = oa.get(k).map(|v| v.to_string()).unwrap_or_default();
            let vb = ob.get(k).map(|v| v.to_string()).unwrap_or_default();
            vb > va
        };
        if let Some(v) = (if pick_b { ob } else { oa }).get(k) {
            out.insert(k.clone(), v.clone());
        }
        ft.insert(k.clone(), Value::from(x.max(y)));
    }
    out.insert(FIELD_TIMES.into(), Value::Object(ft));
    let newer = if b.updated_at > a.updated_at { b } else { a };
    Record { id: a.id.clone(), kind: newer.kind.clone(), data: Value::Object(out), updated_at: a.updated_at.max(b.updated_at), deleted: false }
}

/// Sama isi (tanpa memperhitungkan catatan waktu per field).
fn same_fields(a: &Value, b: &Value) -> bool {
    match (a.as_object(), b.as_object()) {
        (Some(x), Some(y)) => x.iter().filter(|(k, _)| *k != FIELD_TIMES).all(|(k, v)| y.get(k) == Some(v)) && y.keys().filter(|k| *k != FIELD_TIMES).count() == x.keys().filter(|k| *k != FIELD_TIMES).count(),
        _ => a == b,
    }
}

/// Simpan perubahan dari aplikasi: `updated_at` selalu diisi waktu sekarang.
/// Dijamin lebih besar dari nilai sebelumnya supaya perubahan selalu menang
/// saat sinkronisasi walau jam berubah sedikit. Field yang berubah dicap waktunya.
pub fn upsert(conn: &Connection, id: &str, kind: &str, data: Value) -> rusqlite::Result<Record> {
    let prev = get(conn, id)?;
    let updated_at = now_ms().max(prev.as_ref().map(|r| r.updated_at).unwrap_or(0) + 1);
    let rec = Record {
        id: id.to_string(),
        kind: kind.to_string(),
        data: stamp_fields(prev.as_ref(), data, updated_at),
        updated_at,
        deleted: false,
    };
    put_raw(conn, &rec)?;
    Ok(rec)
}

/// Hapus lunak: baris menjadi tombstone supaya penghapusan ikut tersinkron.
pub fn remove(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    if let Some(prev) = get(conn, id)? {
        let rec = Record {
            data: Value::Null,
            updated_at: now_ms().max(prev.updated_at + 1),
            deleted: true,
            ..prev
        };
        put_raw(conn, &rec)?;
    }
    Ok(())
}

/// Gabungkan record dari luar (perangkat lain / file backup).
/// Record luar menang jika `updated_at`-nya lebih baru. Mengembalikan jumlah
/// record lokal yang berubah.
pub fn merge(conn: &mut Connection, incoming: &[Record]) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    let mut changed = 0;
    for rec in incoming {
        let local = get(&tx, &rec.id)?;
        match local {
            None => {
                put_raw(&tx, rec)?;
                changed += 1;
            }
            // Penghapusan atau data bukan objek: versi terbaru menang utuh.
            Some(l) if l.deleted || rec.deleted || !l.data.is_object() || !rec.data.is_object() => {
                if rec.updated_at > l.updated_at {
                    put_raw(&tx, rec)?;
                    changed += 1;
                }
            }
            // Dua versi aktif: gabungkan per field supaya edit berbeda dari dua perangkat tidak saling menimpa.
            Some(l) => {
                let mut m = merge_fields(&l, rec);
                if same_fields(&m.data, &l.data) {
                    continue;
                }
                if !same_fields(&m.data, &rec.data) {
                    // Hasil gabungan memuat perubahan lokal yang belum dimiliki pengirim:
                    // naikkan waktunya supaya ikut terkirim balik.
                    m.updated_at = l.updated_at.max(rec.updated_at) + 1;
                }
                put_raw(&tx, &m)?;
                changed += 1;
            }
        }
    }
    tx.commit()?;
    Ok(changed)
}

/// Semua record (termasuk tombstone) yang berubah setelah `since` (ms).
pub fn changed_since(conn: &Connection, since: i64) -> rusqlite::Result<Vec<Record>> {
    let mut stmt = conn.prepare("SELECT id, kind, data, updated_at, deleted FROM records WHERE updated_at > ?1 ORDER BY updated_at")?;
    let rows = stmt.query_map(params![since], row_to_record)?;
    rows.collect()
}

/// Tulis paksa (abaikan last-write-wins), dipakai saat server tim menolak perubahan lokal.
pub fn force_put(conn: &mut Connection, recs: &[Record]) -> rusqlite::Result<usize> {
    let tx = conn.transaction()?;
    for r in recs {
        put_raw(&tx, r)?;
    }
    tx.commit()?;
    Ok(recs.len())
}

/// Pulihkan dari backup: isi database menjadi persis isi backup.
/// Record yang tidak ada di backup menjadi tombstone; isi backup ditulis dengan
/// waktu sekarang supaya menang saat disinkronkan ke perangkat lain.
pub fn restore(conn: &mut Connection, snapshot: &[Record]) -> rusqlite::Result<usize> {
    use std::collections::{HashMap, HashSet};
    let now = now_ms();
    let current = all(conn)?;
    let keep: HashSet<&str> = snapshot.iter().map(|r| r.id.as_str()).collect();
    let prev: HashMap<&str, i64> = current.iter().map(|r| (r.id.as_str(), r.updated_at)).collect();
    let tx = conn.transaction()?;
    let mut n = 0;
    for r in &current {
        if !r.deleted && !keep.contains(r.id.as_str()) {
            put_raw(&tx, &Record { data: Value::Null, updated_at: now.max(r.updated_at + 1), deleted: true, ..r.clone() })?;
            n += 1;
        }
    }
    let cur: HashMap<&str, &Record> = current.iter().map(|r| (r.id.as_str(), r)).collect();
    for r in snapshot {
        let ts = now.max(prev.get(r.id.as_str()).copied().unwrap_or(0) + 1);
        // Semua field dicap waktu pemulihan supaya isi backup juga menang di merge per field.
        let data = match r.data.as_object() {
            Some(obj) if !r.deleted => {
                let mut o = obj.clone();
                o.remove(FIELD_TIMES);
                let mut ft = serde_json::Map::new();
                let local_keys = cur.get(r.id.as_str()).and_then(|l| l.data.as_object()).map(|m| m.keys().cloned().collect::<Vec<_>>()).unwrap_or_default();
                for k in o.keys().cloned().chain(local_keys).filter(|k| k != FIELD_TIMES) {
                    ft.insert(k, Value::from(ts));
                }
                o.insert(FIELD_TIMES.into(), Value::Object(ft));
                Value::Object(o)
            }
            _ => r.data.clone(),
        };
        put_raw(&tx, &Record { updated_at: ts, data, ..r.clone() })?;
        n += 1;
    }
    tx.commit()?;
    Ok(n)
}

/// Jumlah record aktif (bukan tombstone).
pub fn count_active(conn: &Connection) -> rusqlite::Result<i64> {
    conn.query_row("SELECT COUNT(*) FROM records WHERE deleted = 0", [], |r| r.get(0))
}

/// Hapus (tombstone) semua record yang ditandai `demo: true`. Mengembalikan jumlahnya.
pub fn remove_demo(conn: &mut Connection) -> rusqlite::Result<usize> {
    let ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM records WHERE deleted = 0 AND json_extract(data, '$.demo') = 1",
        )?;
        let rows = stmt.query_map([], |r| r.get(0))?;
        rows.collect::<rusqlite::Result<_>>()?
    };
    let tx = conn.transaction()?;
    for id in &ids {
        remove(&tx, id)?;
    }
    tx.commit()?;
    Ok(ids.len())
}

pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row(
        "SELECT value FROM settings WHERE key = ?1",
        params![key],
        |r| r.get(0),
    )
    .optional()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn field_merge_keeps_both_devices_edits() {
        let mut a = open_in_memory().unwrap();
        let mut b = open_in_memory().unwrap();
        upsert(&a, "t1", "task", json!({"title": "Tulis bab 2", "due": "2026-10-30", "status": "todo"})).unwrap();
        let base = all(&a).unwrap();
        merge(&mut b, &base).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        // A mengganti judul, B mengganti tenggat (bersamaan).
        upsert(&a, "t1", "task", json!({"title": "Tulis bab 2 (revisi)", "due": "2026-10-30", "status": "todo"})).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        upsert(&b, "t1", "task", json!({"title": "Tulis bab 2", "due": "2026-11-02", "status": "todo"})).unwrap();
        // Sinkron dua arah.
        merge(&mut a, &all(&b).unwrap()).unwrap();
        merge(&mut b, &all(&a).unwrap()).unwrap();
        let ra = get(&a, "t1").unwrap().unwrap();
        let rb = get(&b, "t1").unwrap().unwrap();
        assert_eq!(ra.data["title"], "Tulis bab 2 (revisi)");
        assert_eq!(ra.data["due"], "2026-11-02");
        assert_eq!(ra.data, rb.data);
        assert_eq!(ra.updated_at, rb.updated_at);
        // Sinkron berikutnya tidak mengubah apa pun (stabil).
        assert_eq!(merge(&mut a, &all(&b).unwrap()).unwrap(), 0);
        assert_eq!(merge(&mut b, &all(&a).unwrap()).unwrap(), 0);
    }

    #[test]
    fn field_merge_same_field_and_removal() {
        let mut a = open_in_memory().unwrap();
        let mut b = open_in_memory().unwrap();
        upsert(&a, "n", "note", json!({"title": "A", "pinned": true})).unwrap();
        merge(&mut b, &all(&a).unwrap()).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(3));
        upsert(&a, "n", "note", json!({"title": "dari A"})).unwrap(); // field pinned dihapus
        std::thread::sleep(std::time::Duration::from_millis(3));
        upsert(&b, "n", "note", json!({"title": "dari B", "pinned": true})).unwrap(); // judul lebih baru
        merge(&mut a, &all(&b).unwrap()).unwrap();
        let r = get(&a, "n").unwrap().unwrap();
        assert_eq!(r.data["title"], "dari B");
        assert!(r.data.get("pinned").is_none(), "penghapusan field di A tetap berlaku: {}", r.data);
    }

    #[test]
    fn legacy_records_without_field_times_use_lww() {
        let mut c = open_in_memory().unwrap();
        put_raw(&c, &Record { id: "x".into(), kind: "note".into(), data: json!({"t": "lama", "a": 1}), updated_at: 100, deleted: false }).unwrap();
        merge(&mut c, &[Record { id: "x".into(), kind: "note".into(), data: json!({"t": "baru"}), updated_at: 200, deleted: false }]).unwrap();
        let r = get(&c, "x").unwrap().unwrap();
        assert_eq!(r.data["t"], "baru");
        assert_eq!(r.data["a"], 1, "field yang tidak ada di versi lama tanpa _ft tetap dipertahankan");
        // Versi lebih lama tidak menimpa.
        merge(&mut c, &[Record { id: "x".into(), kind: "note".into(), data: json!({"t": "kuno"}), updated_at: 50, deleted: false }]).unwrap();
        assert_eq!(get(&c, "x").unwrap().unwrap().data["t"], "baru");
    }

    #[test]
    fn restore_replaces_content() {
        let mut c = open_in_memory().unwrap();
        upsert(&c, "a", "note", json!({"t": "lama"})).unwrap();
        let snap = all(&c).unwrap();
        upsert(&c, "a", "note", json!({"t": "baru"})).unwrap();
        upsert(&c, "b", "note", json!({"t": "setelah backup"})).unwrap();
        let before = get(&c, "a").unwrap().unwrap().updated_at;
        restore(&mut c, &snap).unwrap();
        let a = get(&c, "a").unwrap().unwrap();
        assert_eq!(a.data["t"], "lama");
        assert_eq!(a.data[FIELD_TIMES]["t"], a.updated_at, "field dicap ulang supaya menang merge per field");
        assert!(a.updated_at > before, "isi backup harus menang LWW");
        assert!(get(&c, "b").unwrap().unwrap().deleted);
        assert_eq!(list(&c, "note").unwrap().len(), 1);
    }

    #[test]
    fn upsert_list_remove() {
        let conn = open_in_memory().unwrap();
        upsert(&conn, "a", "note", json!({"title": "Satu"})).unwrap();
        upsert(&conn, "b", "note", json!({"title": "Dua"})).unwrap();
        upsert(&conn, "c", "reminder", json!({"title": "Tiga"})).unwrap();
        assert_eq!(list(&conn, "note").unwrap().len(), 2);
        remove(&conn, "a").unwrap();
        assert_eq!(list(&conn, "note").unwrap().len(), 1);
        // tombstone tetap ada untuk sinkronisasi
        assert!(get(&conn, "a").unwrap().unwrap().deleted);
        assert_eq!(all(&conn).unwrap().len(), 3);
    }

    #[test]
    fn upsert_always_increases_timestamp() {
        let conn = open_in_memory().unwrap();
        let far_future = now_ms() + 1_000_000;
        put_raw(
            &conn,
            &Record { id: "x".into(), kind: "note".into(), data: json!({}), updated_at: far_future, deleted: false },
        )
        .unwrap();
        let r = upsert(&conn, "x", "note", json!({"v": 2})).unwrap();
        assert!(r.updated_at > far_future);
    }

    #[test]
    fn merge_last_write_wins() {
        let mut conn = open_in_memory().unwrap();
        put_raw(&conn, &Record { id: "a".into(), kind: "note".into(), data: json!({"v": "lokal"}), updated_at: 100, deleted: false }).unwrap();
        put_raw(&conn, &Record { id: "b".into(), kind: "note".into(), data: json!({"v": "lokal"}), updated_at: 300, deleted: false }).unwrap();
        let incoming = vec![
            Record { id: "a".into(), kind: "note".into(), data: json!({"v": "remote"}), updated_at: 200, deleted: false },
            Record { id: "b".into(), kind: "note".into(), data: json!({"v": "remote"}), updated_at: 250, deleted: false },
            Record { id: "c".into(), kind: "note".into(), data: Value::Null, updated_at: 50, deleted: true },
        ];
        assert_eq!(merge(&mut conn, &incoming).unwrap(), 2);
        assert_eq!(get(&conn, "a").unwrap().unwrap().data["v"], "remote");
        assert_eq!(get(&conn, "b").unwrap().unwrap().data["v"], "lokal");
        assert!(get(&conn, "c").unwrap().unwrap().deleted);
    }

    #[test]
    fn remove_demo_only_touches_demo_rows() {
        let mut conn = open_in_memory().unwrap();
        upsert(&conn, "a", "task", json!({"title": "Demo", "demo": true})).unwrap();
        upsert(&conn, "b", "task", json!({"title": "Asli"})).unwrap();
        upsert(&conn, "c", "note", json!({"title": "Demo juga", "demo": true})).unwrap();
        assert_eq!(count_active(&conn).unwrap(), 3);
        assert_eq!(remove_demo(&mut conn).unwrap(), 2);
        assert_eq!(count_active(&conn).unwrap(), 1);
        assert!(get(&conn, "a").unwrap().unwrap().deleted);
        assert!(!get(&conn, "b").unwrap().unwrap().deleted);
    }

    #[test]
    fn settings_roundtrip() {
        let conn = open_in_memory().unwrap();
        assert_eq!(get_setting(&conn, "k").unwrap(), None);
        set_setting(&conn, "k", "1").unwrap();
        set_setting(&conn, "k", "2").unwrap();
        assert_eq!(get_setting(&conn, "k").unwrap().as_deref(), Some("2"));
    }
}
