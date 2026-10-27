//! Jaringan untuk asisten AI, bot (Telegram, WhatsApp Cloud API), server tim
//! (PocketBase), dan email (SMTP kirim, IMAP baca). Permintaan HTTP dilakukan
//! dari Rust supaya tidak terhalang CORS dan kunci API tidak keluar dari mesin.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::time::Duration;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpReq {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct HttpRes {
    pub status: u16,
    pub body: String,
}

pub async fn http(req: HttpReq) -> Result<HttpRes, String> {
    let url = reqwest::Url::parse(&req.url).map_err(|e| format!("URL tidak valid: {e}"))?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("Hanya alamat http/https yang diizinkan.".into());
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(req.timeout_ms.unwrap_or(60_000).clamp(1_000, 120_000)))
        .user_agent(concat!("Ruangku/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|e| e.to_string())?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|_| "Metode HTTP tidak valid.".to_string())?;
    let mut b = client.request(method, url);
    for (k, v) in &req.headers {
        b = b.header(k, v);
    }
    if let Some(body) = req.body {
        b = b.body(body);
    }
    let res = b.send().await.map_err(|e| {
        if e.is_timeout() {
            "Waktu habis menunggu server.".to_string()
        } else if e.is_connect() {
            format!("Tidak bisa terhubung ke server: {e}")
        } else {
            e.to_string()
        }
    })?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;
    Ok(HttpRes { status, body })
}

// ---------- Email ----------

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MailCfg {
    /// Alamat pengirim (akun Gmail)
    pub user: String,
    /// App Password Gmail (16 huruf), bukan kata sandi biasa
    pub password: String,
    #[serde(default = "smtp_host")]
    pub smtp_host: String,
    #[serde(default = "smtp_port")]
    pub smtp_port: u16,
    #[serde(default = "imap_host")]
    pub imap_host: String,
    #[serde(default = "imap_port")]
    pub imap_port: u16,
    /// "ssl" (port 465/993), "starttls" (587), atau "none" (hanya untuk uji lokal)
    #[serde(default = "security")]
    pub security: String,
    #[serde(default)]
    pub from_name: Option<String>,
}
fn smtp_host() -> String {
    "smtp.gmail.com".into()
}
fn smtp_port() -> u16 {
    465
}
fn imap_host() -> String {
    "imap.gmail.com".into()
}
fn imap_port() -> u16 {
    993
}
fn security() -> String {
    "ssl".into()
}

pub fn send_mail(cfg: &MailCfg, to: &str, subject: &str, body: &str) -> Result<(), String> {
    use lettre::message::{header::ContentType, Mailbox};
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};
    let from: Mailbox = match &cfg.from_name {
        Some(n) if !n.is_empty() => format!("{n} <{}>", cfg.user),
        _ => cfg.user.clone(),
    }
    .parse()
    .map_err(|e| format!("Alamat pengirim tidak valid: {e}"))?;
    let to: Mailbox = to.parse().map_err(|e| format!("Alamat tujuan tidak valid: {e}"))?;
    let msg = Message::builder()
        .from(from)
        .to(to)
        .subject(subject)
        .header(ContentType::TEXT_PLAIN)
        .body(body.to_string())
        .map_err(|e| e.to_string())?;
    let creds = Credentials::new(cfg.user.clone(), cfg.password.clone());
    let mailer = match cfg.security.as_str() {
        "starttls" => SmtpTransport::starttls_relay(&cfg.smtp_host).map_err(|e| e.to_string())?.port(cfg.smtp_port).credentials(creds).build(),
        "none" => SmtpTransport::builder_dangerous(&cfg.smtp_host).port(cfg.smtp_port).build(),
        _ => SmtpTransport::relay(&cfg.smtp_host).map_err(|e| e.to_string())?.port(cfg.smtp_port).credentials(creds).build(),
    };
    mailer.send(&msg).map(|_| ()).map_err(|e| format!("Gagal mengirim email: {e}"))
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Incoming {
    pub uid: u32,
    pub from: String,
    pub subject: String,
    pub text: String,
}

/// Ambil email belum dibaca yang subjeknya berisi `marker` (mis. "[Ruangku"), lalu tandai terbaca.
pub fn fetch_mail(cfg: &MailCfg, marker: &str, limit: usize) -> Result<Vec<Incoming>, String> {
    let addr = (cfg.imap_host.as_str(), cfg.imap_port);
    let mut out = vec![];
    macro_rules! work {
        ($session:expr) => {{
            let mut s = $session;
            s.select("INBOX").map_err(|e| e.to_string())?;
            let query = format!("UNSEEN SUBJECT \"{}\"", marker.replace('"', ""));
            let mut uids: Vec<u32> = s.uid_search(&query).map_err(|e| e.to_string())?.into_iter().collect();
            uids.sort_unstable();
            for uid in uids.into_iter().take(limit) {
                let msgs = s.uid_fetch(uid.to_string(), "RFC822").map_err(|e| e.to_string())?;
                for m in msgs.iter() {
                    if let Some(raw) = m.body() {
                        if let Some(inc) = parse_mail(uid, raw) {
                            out.push(inc);
                        }
                    }
                }
                let _ = s.uid_store(uid.to_string(), "+FLAGS (\\Seen)");
            }
            let _ = s.logout();
        }};
    }
    if cfg.security == "none" {
        let stream = std::net::TcpStream::connect(addr).map_err(|e| format!("IMAP: {e}"))?;
        let client = imap::Client::new(stream);
        let session = client.login(&cfg.user, &cfg.password).map_err(|(e, _)| format!("Login IMAP gagal: {e}"))?;
        work!(session);
    } else {
        let tls = native_tls::TlsConnector::builder().build().map_err(|e| e.to_string())?;
        let client = imap::connect(addr, &cfg.imap_host, &tls).map_err(|e| format!("IMAP: {e}"))?;
        let session = client.login(&cfg.user, &cfg.password).map_err(|(e, _)| format!("Login IMAP gagal: {e}. Pastikan IMAP aktif dan memakai App Password."))?;
        work!(session);
    }
    Ok(out)
}

/// Ambil pengirim, subjek, dan isi teks; buang kutipan balasan ("> ..." dan "On ... wrote:").
pub fn parse_mail(uid: u32, raw: &[u8]) -> Option<Incoming> {
    let m = mailparse::parse_mail(raw).ok()?;
    let headers = &m.headers;
    use mailparse::MailHeaderMap;
    let from_raw = headers.get_first_value("From").unwrap_or_default();
    let from = mailparse::addrparse(&from_raw)
        .ok()
        .and_then(|l| l.extract_single_info())
        .map(|i| i.addr)
        .unwrap_or(from_raw);
    let subject = headers.get_first_value("Subject").unwrap_or_default();
    let text = plain_part(&m).unwrap_or_default();
    let mut lines = vec![];
    for l in text.lines() {
        let t = l.trim();
        if t.starts_with('>') {
            continue;
        }
        let low = t.to_lowercase();
        if (low.starts_with("on ") && low.ends_with("wrote:")) || (low.starts_with("pada ") && low.ends_with("menulis:")) || low.starts_with("-----original message") {
            break;
        }
        lines.push(l);
    }
    Some(Incoming { uid, from: from.to_lowercase(), subject, text: lines.join("\n").trim().to_string() })
}

fn plain_part(m: &mailparse::ParsedMail) -> Option<String> {
    if m.subparts.is_empty() {
        return if m.ctype.mimetype.starts_with("text/plain") || m.ctype.mimetype.is_empty() { m.get_body().ok() } else { None };
    }
    m.subparts.iter().find_map(plain_part)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_reply_and_strips_quote() {
        let raw = b"From: Rina Wulandari <Rina@Example.com>\r\nSubject: Re: [Ruangku #A1B2] Tugas baru\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nselesai\r\n\r\nOn Mon, 26 Oct 2026 Ruangku wrote:\r\n> Tugas baru untuk Anda\r\n";
        let m = parse_mail(7, raw).unwrap();
        assert_eq!(m.from, "rina@example.com");
        assert_eq!(m.subject, "Re: [Ruangku #A1B2] Tugas baru");
        assert_eq!(m.text, "selesai");
    }

    #[test]
    fn multipart_prefers_plain_text() {
        let raw = b"From: bayu@example.com\r\nSubject: [Ruangku] tugas\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=XX\r\n\r\n--XX\r\nContent-Type: text/plain\r\n\r\ntambah Kirim laporan besok\r\n--XX\r\nContent-Type: text/html\r\n\r\n<p>x</p>\r\n--XX--\r\n";
        let m = parse_mail(1, raw).unwrap();
        assert_eq!(m.text, "tambah Kirim laporan besok");
    }

    #[tokio::test]
    async fn rejects_non_http_schemes() {
        let r = http(HttpReq { method: "GET".into(), url: "file:///etc/passwd".into(), headers: Default::default(), body: None, timeout_ms: None }).await;
        assert!(r.is_err());
    }
}
