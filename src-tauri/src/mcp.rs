//! Server MCP (Model Context Protocol) lokal agar Claude Desktop, Claude Code, ChatGPT,
//! dan klien MCP lain bisa membaca & mengubah data Ruangku.
//!
//! - HTTP (Streamable HTTP) di 127.0.0.1:<port>/mcp, dilindungi token (header
//!   `Authorization: Bearer <token>` atau path `/mcp/<token>`), Origin divalidasi.
//! - Mode jembatan stdio: `ruangku.exe --mcp` membaca JSON-RPC per baris dari stdin dan
//!   meneruskannya ke server HTTP aplikasi yang sedang berjalan (port & token dibaca dari
//!   `mcp.json` di folder data aplikasi).
//!
//! Logika protokol (versi, alat, validasi header) ada di sisi TypeScript (`src/ai/mcp.ts`):
//! Rust hanya transport. Setiap permintaan diteruskan ke jendela utama lewat event
//! `mcp-request` lalu dijawab lewat perintah `mcp_respond`.

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

const MAX_HEAD: usize = 64 * 1024;
const MAX_BODY: usize = 4 * 1024 * 1024;
const TIMEOUT: Duration = Duration::from_secs(90);
pub const CONFIG_FILE: &str = "mcp.json";

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
    pub error: Option<String>,
    pub requests: u64,
}

struct Server {
    port: u16,
    stop: Arc<AtomicBool>,
}

static SERVER: Mutex<Option<Server>> = Mutex::new(None);
static LAST_ERROR: Mutex<Option<String>> = Mutex::new(None);
type Reply = mpsc::Sender<(u16, String)>;
static PENDING: OnceLock<Mutex<HashMap<u64, Reply>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static COUNT: AtomicU64 = AtomicU64::new(0);

fn pending() -> &'static Mutex<HashMap<u64, Reply>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpRequestEvent {
    id: u64,
    body: String,
    protocol_version: Option<String>,
    method: Option<String>,
    name: Option<String>,
}

// ---------- HTTP ----------

pub struct HttpRequest {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Vec<u8>,
}

/// Baca satu permintaan HTTP/1.1 (kepala + badan Content-Length).
pub fn read_request<R: Read>(stream: &mut R) -> Result<HttpRequest, String> {
    let mut buf = Vec::with_capacity(4096);
    let mut tmp = [0u8; 4096];
    let head_end = loop {
        if let Some(p) = find(&buf, b"\r\n\r\n") {
            break p;
        }
        if buf.len() > MAX_HEAD {
            return Err("kepala permintaan terlalu besar".into());
        }
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            return Err("koneksi ditutup".into());
        }
        buf.extend_from_slice(&tmp[..n]);
    };
    let head = String::from_utf8_lossy(&buf[..head_end]).to_string();
    let mut lines = head.split("\r\n");
    let first = lines.next().unwrap_or_default();
    let mut parts = first.split_whitespace();
    let method = parts.next().unwrap_or_default().to_string();
    let path = parts.next().unwrap_or("/").to_string();
    let mut headers = HashMap::new();
    for l in lines {
        if let Some((k, v)) = l.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    let len: usize = headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
    if len > MAX_BODY {
        return Err("badan permintaan terlalu besar".into());
    }
    let mut body = buf[head_end + 4..].to_vec();
    while body.len() < len {
        let n = stream.read(&mut tmp).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&tmp[..n]);
    }
    body.truncate(len);
    Ok(HttpRequest { method, path, headers, body })
}

fn find(h: &[u8], n: &[u8]) -> Option<usize> {
    h.windows(n.len()).position(|w| w == n)
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "OK",
    }
}

fn write_response<W: Write>(w: &mut W, status: u16, body: &str, extra: &[(&str, &str)]) {
    let mut head = format!("HTTP/1.1 {} {}\r\nConnection: close\r\nCache-Control: no-store\r\n", status, reason(status));
    for (k, v) in extra {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    if body.is_empty() {
        head.push_str("Content-Length: 0\r\n\r\n");
    } else {
        head.push_str(&format!("Content-Type: application/json\r\nContent-Length: {}\r\n\r\n", body.len()));
    }
    let _ = w.write_all(head.as_bytes());
    let _ = w.write_all(body.as_bytes());
    let _ = w.flush();
}

fn rpc_error(code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": Value::Null, "error": { "code": code, "message": message } }).to_string()
}

/// Origin boleh kosong (klien non-browser) atau localhost; selain itu ditolak (cegah DNS rebinding).
pub fn origin_ok(origin: Option<&String>) -> bool {
    let Some(o) = origin else { return true };
    if o == "null" {
        return false;
    }
    let host = o.split("://").nth(1).unwrap_or(o).split('/').next().unwrap_or("");
    let host = if host.starts_with('[') { host.split(']').next().unwrap_or("").trim_start_matches('[') } else { host.split(':').next().unwrap_or("") };
    matches!(host, "localhost" | "127.0.0.1" | "::1")
}

/// Token dari header Authorization atau path /mcp/<token>. Mengembalikan (path cocok, token cocok).
pub fn route(path: &str, auth: Option<&String>, token: &str) -> (bool, bool) {
    let p = path.split('?').next().unwrap_or(path).trim_end_matches('/');
    if p == "/mcp" {
        let given = auth.and_then(|a| a.strip_prefix("Bearer ").or_else(|| a.strip_prefix("bearer "))).map(str::trim);
        return (true, given.is_some_and(|g| ct_eq(g, token)));
    }
    if let Some(t) = p.strip_prefix("/mcp/") {
        return (true, ct_eq(t, token));
    }
    (false, false)
}

fn ct_eq(a: &str, b: &str) -> bool {
    if a.len() != b.len() || b.is_empty() {
        return false;
    }
    a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn handle(app: &AppHandle, mut stream: TcpStream, token: &str) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(30)));
    let req = match read_request(&mut stream) {
        Ok(r) => r,
        Err(e) => {
            write_response(&mut stream, 400, &rpc_error(-32700, &e), &[]);
            return;
        }
    };
    if !origin_ok(req.headers.get("origin")) {
        write_response(&mut stream, 403, &rpc_error(-32000, "Origin tidak diizinkan"), &[]);
        return;
    }
    let path_only = req.path.split('?').next().unwrap_or("").to_string();
    if path_only == "/health" || path_only == "/" {
        write_response(&mut stream, 200, &json!({ "ok": true, "name": "Ruangku", "mcp": "/mcp" }).to_string(), &[]);
        return;
    }
    let (is_mcp, authed) = route(&req.path, req.headers.get("authorization"), token);
    if !is_mcp {
        write_response(&mut stream, 404, &rpc_error(-32601, "Endpoint MCP ada di /mcp"), &[]);
        return;
    }
    if !authed {
        write_response(&mut stream, 401, &rpc_error(-32001, "Token Ruangku salah atau tidak ada. Salin ulang dari Pengaturan › Connector."), &[("WWW-Authenticate", "Bearer")]);
        return;
    }
    match req.method.as_str() {
        "POST" => {}
        "OPTIONS" => {
            write_response(&mut stream, 204, "", &[("Allow", "POST")]);
            return;
        }
        _ => {
            write_response(&mut stream, 405, "", &[("Allow", "POST")]);
            return;
        }
    }
    COUNT.fetch_add(1, Ordering::Relaxed);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = mpsc::channel();
    pending().lock().unwrap().insert(id, tx);
    let ev = McpRequestEvent {
        id,
        body: String::from_utf8_lossy(&req.body).to_string(),
        protocol_version: req.headers.get("mcp-protocol-version").cloned(),
        method: req.headers.get("mcp-method").cloned(),
        name: req.headers.get("mcp-name").cloned(),
    };
    if app.emit_to("main", "mcp-request", ev).is_err() {
        pending().lock().unwrap().remove(&id);
        write_response(&mut stream, 503, &rpc_error(-32000, "Jendela utama Ruangku belum siap"), &[]);
        return;
    }
    match rx.recv_timeout(TIMEOUT) {
        Ok((status, body)) => write_response(&mut stream, status, &body, &[]),
        Err(_) => {
            pending().lock().unwrap().remove(&id);
            write_response(&mut stream, 504, &rpc_error(-32000, "Ruangku tidak menjawab dalam 90 detik"), &[]);
        }
    }
    let _ = stream.shutdown(Shutdown::Both);
}

pub fn start(app: &AppHandle, dir: PathBuf, port: u16, token: String) -> Result<McpStatus, String> {
    stop(&dir);
    if token.len() < 16 {
        return Err("Token terlalu pendek".into());
    }
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|e| {
        let m = format!("Port {port} tidak bisa dipakai ({e}). Pilih port lain.");
        *LAST_ERROR.lock().unwrap() = Some(m.clone());
        m
    })?;
    let port = listener.local_addr().map(|a| a.port()).unwrap_or(port);
    let stop_flag = Arc::new(AtomicBool::new(false));
    let flag = stop_flag.clone();
    let app2 = app.clone();
    let tok = token.clone();
    std::thread::spawn(move || {
        for conn in listener.incoming() {
            if flag.load(Ordering::Relaxed) {
                break;
            }
            if let Ok(s) = conn {
                let app3 = app2.clone();
                let t = tok.clone();
                std::thread::spawn(move || handle(&app3, s, &t));
            }
        }
    });
    *SERVER.lock().unwrap() = Some(Server { port, stop: stop_flag });
    *LAST_ERROR.lock().unwrap() = None;
    let cfg = json!({ "port": port, "token": token, "url": format!("http://127.0.0.1:{port}/mcp") });
    let _ = std::fs::write(dir.join(CONFIG_FILE), serde_json::to_vec_pretty(&cfg).unwrap_or_default());
    Ok(status())
}

pub fn stop(dir: &std::path::Path) {
    if let Some(s) = SERVER.lock().unwrap().take() {
        s.stop.store(true, Ordering::Relaxed);
        // Bangunkan accept() yang sedang menunggu.
        let _ = TcpStream::connect_timeout(&([127, 0, 0, 1], s.port).into(), Duration::from_millis(300));
    }
    let _ = std::fs::remove_file(dir.join(CONFIG_FILE));
}

pub fn status() -> McpStatus {
    let s = SERVER.lock().unwrap();
    let port = s.as_ref().map(|x| x.port).unwrap_or(0);
    McpStatus {
        running: s.is_some(),
        port,
        url: if port > 0 { format!("http://127.0.0.1:{port}/mcp") } else { String::new() },
        error: LAST_ERROR.lock().unwrap().clone(),
        requests: COUNT.load(Ordering::Relaxed),
    }
}

pub fn respond(id: u64, status: u16, body: String) {
    if let Some(tx) = pending().lock().unwrap().remove(&id) {
        let _ = tx.send((status, body));
    }
}

// ---------- Jembatan stdio (ruangku.exe --mcp) ----------

/// Folder data aplikasi tanpa Tauri (sama dengan `app_data_dir()` untuk identifier ini).
pub fn data_dir_standalone() -> Option<PathBuf> {
    const ID: &str = "com.ruangku.app";
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|a| PathBuf::from(a).join(ID))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|h| PathBuf::from(h).join("Library/Application Support").join(ID))
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .map(|d| d.join(ID))
    }
}

fn b64(data: &[u8]) -> String {
    const T: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(data.len().div_ceil(3) * 4);
    for c in data.chunks(3) {
        let n = (c[0] as u32) << 16 | (*c.get(1).unwrap_or(&0) as u32) << 8 | *c.get(2).unwrap_or(&0) as u32;
        out.push(T[(n >> 18) as usize & 63] as char);
        out.push(T[(n >> 12) as usize & 63] as char);
        out.push(if c.len() > 1 { T[(n >> 6) as usize & 63] as char } else { '=' });
        out.push(if c.len() > 2 { T[n as usize & 63] as char } else { '=' });
    }
    out
}

/// Nilai header aman ASCII, atau sentinel Base64 sesuai spesifikasi MCP.
pub fn header_value(v: &str) -> String {
    let safe = !v.is_empty() && v.bytes().all(|b| (0x20..=0x7e).contains(&b)) && v.trim() == v && !(v.starts_with("=?base64?") && v.ends_with("?="));
    if safe {
        v.to_string()
    } else {
        format!("=?base64?{}?=", b64(v.as_bytes()))
    }
}

/// Header transport untuk satu pesan JSON-RPC (dari isinya sendiri).
pub fn headers_for(msg: &Value, legacy_version: Option<&str>) -> Vec<(String, String)> {
    let mut h = Vec::new();
    let method = msg.get("method").and_then(Value::as_str).unwrap_or("");
    let modern = msg.pointer("/params/_meta/io.modelcontextprotocol~1protocolVersion").and_then(Value::as_str);
    if let Some(v) = modern.or(legacy_version) {
        h.push(("MCP-Protocol-Version".to_string(), v.to_string()));
    }
    if !method.is_empty() {
        h.push(("Mcp-Method".to_string(), method.to_string()));
    }
    let name = msg.pointer("/params/name").and_then(Value::as_str).or_else(|| msg.pointer("/params/uri").and_then(Value::as_str));
    if let (Some(n), true) = (name, matches!(method, "tools/call" | "resources/read" | "prompts/get")) {
        h.push(("Mcp-Name".to_string(), header_value(n)));
    }
    h
}

fn post_local(port: u16, token: &str, headers: &[(String, String)], body: &str) -> Result<(u16, String), String> {
    let mut s = TcpStream::connect_timeout(&([127, 0, 0, 1], port).into(), Duration::from_secs(3)).map_err(|e| e.to_string())?;
    let _ = s.set_read_timeout(Some(TIMEOUT + Duration::from_secs(5)));
    let mut req = format!(
        "POST /mcp HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer {token}\r\nContent-Type: application/json\r\nAccept: application/json, text/event-stream\r\nContent-Length: {}\r\nConnection: close\r\n",
        body.len()
    );
    for (k, v) in headers {
        req.push_str(&format!("{k}: {v}\r\n"));
    }
    req.push_str("\r\n");
    s.write_all(req.as_bytes()).map_err(|e| e.to_string())?;
    s.write_all(body.as_bytes()).map_err(|e| e.to_string())?;
    let mut raw = Vec::new();
    s.read_to_end(&mut raw).map_err(|e| e.to_string())?;
    let end = find(&raw, b"\r\n\r\n").ok_or("jawaban tidak lengkap")?;
    let head = String::from_utf8_lossy(&raw[..end]);
    let status: u16 = head.split_whitespace().nth(1).and_then(|x| x.parse().ok()).unwrap_or(500);
    Ok((status, String::from_utf8_lossy(&raw[end + 4..]).to_string()))
}

fn read_config() -> Option<(u16, String)> {
    let dir = data_dir_standalone()?;
    let v: Value = serde_json::from_slice(&std::fs::read(dir.join(CONFIG_FILE)).ok()?).ok()?;
    Some((v.get("port")?.as_u64()? as u16, v.get("token")?.as_str()?.to_string()))
}

fn bridge_one(line: &str, legacy: &Mutex<Option<String>>, out: &Mutex<std::io::Stdout>) {
    let Ok(msg) = serde_json::from_str::<Value>(line) else {
        emit_line(out, &json!({ "jsonrpc": "2.0", "id": Value::Null, "error": { "code": -32700, "message": "JSON tidak valid" } }).to_string());
        return;
    };
    let id = msg.get("id").cloned();
    let is_init = msg.get("method").and_then(Value::as_str) == Some("initialize");
    let lv = legacy.lock().unwrap().clone();
    let headers = headers_for(&msg, if is_init { None } else { lv.as_deref() });
    let res = match read_config() {
        Some((port, token)) => post_local(port, &token, &headers, line),
        None => Err("mcp.json tidak ada".into()),
    };
    match res {
        Ok((202, _)) => {}
        Ok((_, body)) if !body.trim().is_empty() => {
            if is_init {
                if let Some(v) = serde_json::from_str::<Value>(&body).ok().and_then(|b| b.pointer("/result/protocolVersion").and_then(Value::as_str).map(str::to_string)) {
                    *legacy.lock().unwrap() = Some(v);
                }
            }
            emit_line(out, body.trim());
        }
        Ok(_) => {}
        Err(e) => {
            if let Some(id) = id {
                eprintln!("ruangku --mcp: {e}");
                emit_line(
                    out,
                    &json!({ "jsonrpc": "2.0", "id": id, "error": { "code": -32000, "message": "Ruangku tidak berjalan atau server MCP belum diaktifkan. Buka Ruangku, lalu nyalakan Pengaturan › Connector › Server MCP." } }).to_string(),
                );
            }
        }
    }
}

fn emit_line(out: &Mutex<std::io::Stdout>, s: &str) {
    let o = out.lock().unwrap();
    let mut l = o.lock();
    let _ = l.write_all(s.replace('\n', " ").as_bytes());
    let _ = l.write_all(b"\n");
    let _ = l.flush();
}

/// Jalankan jembatan stdio sampai stdin ditutup.
pub fn run_stdio_bridge() -> i32 {
    let legacy = Arc::new(Mutex::new(None::<String>));
    let out = Arc::new(Mutex::new(std::io::stdout()));
    let stdin = std::io::stdin();
    let mut handles = Vec::new();
    for line in BufReader::new(stdin.lock()).lines() {
        let Ok(line) = line else { break };
        let line = line.trim().to_string();
        if line.is_empty() {
            continue;
        }
        // initialize dijawab dulu supaya versi legacy diketahui sebelum pesan berikutnya.
        if line.contains("\"initialize\"") {
            bridge_one(&line, &legacy, &out);
            continue;
        }
        let (l2, o2) = (legacy.clone(), out.clone());
        handles.push(std::thread::spawn(move || bridge_one(&line, &l2, &o2)));
        handles.retain(|h| !h.is_finished());
    }
    for h in handles {
        let _ = h.join();
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_request() {
        let raw = b"POST /mcp HTTP/1.1\r\nHost: x\r\nContent-Length: 11\r\nMcp-Method: tools/list\r\n\r\n{\"a\":true}\n";
        let r = read_request(&mut &raw[..]).unwrap();
        assert_eq!(r.method, "POST");
        assert_eq!(r.path, "/mcp");
        assert_eq!(r.headers.get("mcp-method").unwrap(), "tools/list");
        assert_eq!(r.body, b"{\"a\":true}\n");
    }

    #[test]
    fn auth_and_origin() {
        let tok = "abcdefghijklmnop0123";
        assert_eq!(route("/mcp", Some(&format!("Bearer {tok}")), tok), (true, true));
        assert_eq!(route("/mcp", Some(&"Bearer salah".to_string()), tok), (true, false));
        assert_eq!(route("/mcp", None, tok), (true, false));
        assert_eq!(route(&format!("/mcp/{tok}"), None, tok), (true, true));
        assert_eq!(route("/lain", None, tok), (false, false));
        assert!(origin_ok(None));
        assert!(origin_ok(Some(&"http://localhost:5173".to_string())));
        assert!(origin_ok(Some(&"http://127.0.0.1".to_string())));
        assert!(!origin_ok(Some(&"https://evil.example.com".to_string())));
        assert!(!origin_ok(Some(&"http://localhost.evil.com".to_string())));
        assert!(!origin_ok(Some(&"null".to_string())));
    }

    #[test]
    fn bridge_headers() {
        let m: Value = serde_json::from_str(r#"{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"saldo_kas","arguments":{},"_meta":{"io.modelcontextprotocol/protocolVersion":"2026-07-28"}}}"#).unwrap();
        let h = headers_for(&m, None);
        assert!(h.contains(&("MCP-Protocol-Version".into(), "2026-07-28".into())));
        assert!(h.contains(&("Mcp-Method".into(), "tools/call".into())));
        assert!(h.contains(&("Mcp-Name".into(), "saldo_kas".into())));
        let legacy: Value = serde_json::from_str(r#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#).unwrap();
        assert_eq!(headers_for(&legacy, Some("2025-06-18"))[0], ("MCP-Protocol-Version".into(), "2025-06-18".into()));
        assert_eq!(header_value("Halo, 世界"), "=?base64?SGFsbywg5LiW55WM?=");
        assert_eq!(b64(b"Hello, \xe4\xb8\x96\xe7\x95\x8c"), "SGVsbG8sIOS4lueVjA==");
        assert_eq!(header_value(" padded "), "=?base64?IHBhZGRlZCA=?=");
    }

    #[test]
    fn round_trip_over_tcp() {
        // Server tiruan: jawab dengan isi yang sama.
        let l = TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let r = read_request(&mut s).unwrap();
            assert_eq!(r.headers.get("authorization").unwrap(), "Bearer tok");
            let body = String::from_utf8(r.body).unwrap();
            write_response(&mut s, 200, &body, &[]);
        });
        let (st, body) = post_local(port, "tok", &[], "{\"jsonrpc\":\"2.0\",\"id\":1}").unwrap();
        assert_eq!(st, 200);
        assert_eq!(body, "{\"jsonrpc\":\"2.0\",\"id\":1}");
    }
}
