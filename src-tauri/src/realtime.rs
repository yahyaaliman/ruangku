//! Realtime server tim (PocketBase SSE): begitu anggota lain mengubah data,
//! jendela utama diberi tahu untuk langsung menarik perubahan, tanpa menunggu
//! jadwal sinkron 30 detik.

use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// Generasi koneksi: menaikkan angka ini menghentikan koneksi lama.
static GEN: AtomicU64 = AtomicU64::new(0);

/// Topik PocketBase yang diikuti.
pub const TOPICS: [&str; 3] = ["records", "members", "workspaces"];

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SseEvent {
    pub event: String,
    pub data: String,
    pub id: Option<String>,
}

/// Ambil semua event lengkap dari buffer SSE; sisa yang belum lengkap tetap di buffer.
pub fn take_events(buf: &mut String) -> Vec<SseEvent> {
    let normalized = buf.replace("\r\n", "\n");
    *buf = normalized;
    let mut out = Vec::new();
    while let Some(end) = buf.find("\n\n") {
        let block: String = buf.drain(..end + 2).collect();
        let mut ev = SseEvent { event: "message".into(), data: String::new(), id: None };
        let mut has = false;
        for line in block.lines() {
            if line.is_empty() || line.starts_with(':') {
                continue;
            }
            let (field, value) = line.split_once(':').map(|(f, v)| (f, v.strip_prefix(' ').unwrap_or(v))).unwrap_or((line, ""));
            match field {
                "event" => ev.event = value.to_string(),
                "data" => {
                    if !ev.data.is_empty() {
                        ev.data.push('\n');
                    }
                    ev.data.push_str(value);
                    has = true;
                }
                "id" => ev.id = Some(value.to_string()),
                _ => {}
            }
        }
        if has || ev.event != "message" {
            out.push(ev);
        }
    }
    out
}

fn client_id(ev: &SseEvent) -> Option<String> {
    serde_json::from_str::<serde_json::Value>(&ev.data)
        .ok()
        .and_then(|v| v.get("clientId").and_then(|c| c.as_str()).map(String::from))
        .or_else(|| ev.id.clone())
}

/// Satu sesi koneksi: hubungkan, berlangganan, lalu teruskan event ke `on_change`
/// sampai koneksi putus atau generasi berganti. Galat dikembalikan untuk dicoba ulang.
pub async fn session(base: &str, token: &str, gen: u64, mut on_change: impl FnMut(&str), mut on_connected: impl FnMut()) -> Result<(), String> {
    let base = base.trim_end_matches('/');
    let client = reqwest::Client::builder().connect_timeout(Duration::from_secs(15)).user_agent(concat!("Ruangku/", env!("CARGO_PKG_VERSION"))).build().map_err(|e| e.to_string())?;
    let mut res = client
        .get(format!("{base}/api/realtime"))
        .header("accept", "text/event-stream")
        .send()
        .await
        .map_err(|e| format!("Tidak bisa terhubung ke realtime: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Realtime HTTP {}", res.status()));
    }
    let mut buf = String::new();
    loop {
        if GEN.load(Ordering::SeqCst) != gen {
            return Ok(());
        }
        // Batas tunggu per potongan: PocketBase memutus koneksi diam ±5 menit; kita sambung ulang.
        let chunk = match tokio::time::timeout(Duration::from_secs(330), res.chunk()).await {
            Err(_) => return Err("Realtime diam terlalu lama, menyambung ulang".into()),
            Ok(r) => r.map_err(|e| e.to_string())?,
        };
        let Some(bytes) = chunk else { return Ok(()) };
        buf.push_str(&String::from_utf8_lossy(&bytes));
        for ev in take_events(&mut buf) {
            if ev.event == "PB_CONNECT" {
                let Some(cid) = client_id(&ev) else { continue };
                let body = serde_json::json!({ "clientId": cid, "subscriptions": TOPICS });
                let r = client
                    .post(format!("{base}/api/realtime"))
                    .header("authorization", token)
                    .header("content-type", "application/json")
                    .body(body.to_string())
                    .timeout(Duration::from_secs(20))
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !r.status().is_success() {
                    return Err(format!("Langganan realtime ditolak (HTTP {})", r.status()));
                }
                on_connected();
            } else if TOPICS.iter().any(|t| ev.event == *t || ev.event.starts_with(&format!("{t}/"))) {
                on_change(&ev.event);
            }
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub connected: bool,
    pub error: Option<String>,
}

/// Mulai (atau mulai ulang) koneksi realtime di latar. `emit` dipanggil untuk status & perubahan.
pub fn start<F>(base: String, token: String, emit: F)
where
    F: Fn(&str, serde_json::Value) + Send + Sync + 'static,
{
    let gen = GEN.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        let mut backoff = 2u64;
        while GEN.load(Ordering::SeqCst) == gen {
            let r = session(
                &base,
                &token,
                gen,
                |topic| emit("team-remote-change", serde_json::json!(topic)),
                || emit("team-realtime", serde_json::json!(Status { connected: true, error: None })),
            )
            .await;
            if GEN.load(Ordering::SeqCst) != gen {
                break;
            }
            match r {
                Ok(()) => backoff = 2,
                Err(e) => {
                    emit("team-realtime", serde_json::json!(Status { connected: false, error: Some(e) }));
                    backoff = (backoff * 2).min(60);
                }
            }
            tokio::time::sleep(Duration::from_secs(backoff)).await;
        }
    });
}

pub fn stop() {
    GEN.fetch_add(1, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    use std::net::TcpListener;
    use std::sync::{Arc, Mutex};

    #[test]
    fn parses_sse_blocks_and_keeps_partial() {
        let mut buf = String::from("id:abc\r\nevent:PB_CONNECT\r\ndata:{\"clientId\":\"abc\"}\r\n\r\n: komentar\n\nevent: records\ndata: {\"action\":\"update\"}\n\nevent: rec");
        let evs = take_events(&mut buf);
        assert_eq!(evs.len(), 2);
        assert_eq!(evs[0].event, "PB_CONNECT");
        assert_eq!(client_id(&evs[0]).as_deref(), Some("abc"));
        assert_eq!(evs[1], SseEvent { event: "records".into(), data: "{\"action\":\"update\"}".into(), id: None });
        assert_eq!(buf, "event: rec");
        buf.push_str("ords\ndata: 1\ndata: 2\n\n");
        let evs = take_events(&mut buf);
        assert_eq!(evs[0].data, "1\n2");
        assert!(buf.is_empty());
    }

    /// Server SSE tiruan: kirim PB_CONNECT, terima langganan (POST), lalu kirim dua perubahan.
    #[tokio::test(flavor = "multi_thread")]
    async fn session_subscribes_and_forwards_changes() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let posted = Arc::new(Mutex::new(String::new()));
        let p2 = posted.clone();
        std::thread::spawn(move || {
            // Koneksi 1: GET SSE (tetap terbuka); koneksi 2: POST langganan.
            let (mut sse, _) = listener.accept().unwrap();
            let mut r = BufReader::new(sse.try_clone().unwrap());
            let mut line = String::new();
            while r.read_line(&mut line).unwrap() > 2 {
                line.clear();
            }
            sse.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nCache-Control: no-cache\r\n\r\n").unwrap();
            sse.write_all(b"id:c1\nevent:PB_CONNECT\ndata:{\"clientId\":\"c1\"}\n\n").unwrap();
            sse.flush().unwrap();
            let (mut post, _) = listener.accept().unwrap();
            let mut pr = BufReader::new(post.try_clone().unwrap());
            let mut head = String::new();
            let mut len = 0usize;
            loop {
                let mut l = String::new();
                pr.read_line(&mut l).unwrap();
                if l.to_lowercase().starts_with("content-length:") {
                    len = l[15..].trim().parse().unwrap();
                }
                if l == "\r\n" {
                    break;
                }
                head.push_str(&l);
            }
            let mut body = vec![0u8; len];
            pr.read_exact(&mut body).unwrap();
            *p2.lock().unwrap() = format!("{head}\n{}", String::from_utf8_lossy(&body));
            post.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\n\r\n").unwrap();
            std::thread::sleep(Duration::from_millis(100));
            sse.write_all(b"event:records\ndata:{\"action\":\"create\"}\n\nevent:members\ndata:{}\n\n").unwrap();
            sse.flush().unwrap();
            std::thread::sleep(Duration::from_millis(300));
            // Tutup: sesi selesai normal.
        });
        let gen = GEN.load(Ordering::SeqCst);
        let mut changes = Vec::new();
        let mut connected = 0;
        let r = session(&format!("http://{addr}"), "tok123", gen, |t| changes.push(t.to_string()), || connected += 1).await;
        assert!(r.is_ok(), "{r:?}");
        assert_eq!(connected, 1);
        assert_eq!(changes, vec!["records", "members"]);
        let p = posted.lock().unwrap().clone();
        assert!(p.to_lowercase().contains("authorization: tok123"), "{p}");
        assert!(p.contains("\"clientId\":\"c1\""));
        assert!(p.contains("\"records\""));
    }
}
