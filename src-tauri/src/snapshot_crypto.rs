use aes_gcm::{aead::{Aead, KeyInit, Payload}, Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use crate::{db, system, AppState};

const AAD: &[u8] = b"ruangku-snapshot:v1:pbkdf2-sha256:600000:aes-256-gcm";
const ITERATIONS: u32 = 600_000;
const MAX: usize = 32 * 1024 * 1024;
pub const ENABLED: &str = "snapshot_encryption";
const SECRET: &str = "snapshot_password";
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Envelope { encrypted: String, version: u32, iterations: u32, salt: String, nonce: String, ciphertext: String }

pub fn encrypt(text: &str, password: &str) -> Result<String, String> {
    if text.len() > 20 * 1024 * 1024 { return Err("Snapshot melebihi 20 MB.".into()); }
    let mut salt = [0u8; 16]; let mut nonce = [0u8; 12];
    OsRng.fill_bytes(&mut salt); OsRng.fill_bytes(&mut nonce);
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(password.as_bytes(), &salt, ITERATIONS, &mut key);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "Kunci tidak valid.")?;
    let bytes = cipher.encrypt(Nonce::from_slice(&nonce), Payload { msg: text.as_bytes(), aad: AAD }).map_err(|_| "Enkripsi gagal.")?;
    serde_json::to_string(&Envelope { encrypted: "ruangku".into(), version: 1, iterations: ITERATIONS, salt: STANDARD.encode(salt), nonce: STANDARD.encode(nonce), ciphertext: STANDARD.encode(bytes) }).map_err(|e| e.to_string())
}
pub fn is_encrypted(text: &str) -> bool { serde_json::from_str::<serde_json::Value>(text).ok().and_then(|v| v.get("encrypted").cloned()).is_some() }
pub fn decrypt(text: &str, password: &str) -> Result<String, String> {
    if text.len() > MAX { return Err("Snapshot terlalu besar.".into()); }
    let env: Envelope = serde_json::from_str(text).map_err(|_| "Format snapshot terenkripsi tidak valid.")?;
    if env.encrypted != "ruangku" || env.version != 1 || env.iterations != ITERATIONS { return Err("Versi enkripsi tidak didukung.".into()); }
    let salt = STANDARD.decode(env.salt).map_err(|_| "Salt tidak valid.")?;
    let nonce = STANDARD.decode(env.nonce).map_err(|_| "Nonce tidak valid.")?;
    let ciphertext = STANDARD.decode(env.ciphertext).map_err(|_| "Isi snapshot tidak valid.")?;
    if salt.len() != 16 || nonce.len() != 12 { return Err("Parameter enkripsi tidak valid.".into()); }
    let mut key = [0u8; 32];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(password.as_bytes(), &salt, ITERATIONS, &mut key);
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|_| "Kunci tidak valid.")?;
    let bytes = cipher.decrypt(Nonce::from_slice(&nonce), Payload { msg: &ciphertext, aad: AAD }).map_err(|_| "Kata sandi salah atau snapshot telah berubah. Sinkronisasi dihentikan.")?;
    String::from_utf8(bytes).map_err(|_| "Isi snapshot bukan teks UTF-8.".into())
}
pub fn password(c: &rusqlite::Connection) -> Result<Option<String>, String> {
    if db::get_setting(c, ENABLED).map_err(|e| e.to_string())?.as_deref() != Some("true") { return Ok(None); }
    system::secret_get(c, SECRET).map_err(|e| e.to_string())?.filter(|v| !v.is_empty()).map(Some).ok_or("Masukkan kata sandi snapshot pada perangkat ini.".into())
}

#[tauri::command]
pub fn snapshot_unlock(app: AppHandle, state: State<AppState>, password: String) -> Result<(), String> {
    if password.chars().count() < 12 { return Err("Gunakan kata sandi minimal 12 karakter.".into()); }
    let c = state.conn.lock().map_err(|e| e.to_string())?;
    let store = system::secret_set(&c, SECRET, &password).map_err(|e| e.to_string())?;
    if store != "credman" {
        system::secret_delete(&c, SECRET).map_err(|e| e.to_string())?;
        return Err("Penyimpanan aman Windows tidak tersedia. Kata sandi tidak disimpan; coba lagi dari aplikasi Windows.".into());
    }
    db::set_setting(&c, ENABLED, "true").map_err(|e| e.to_string())?;
    let _ = app.emit("setting-changed", ENABLED);
    Ok(())
}

#[tauri::command]
pub fn snapshot_encode(state: State<AppState>, text: String) -> Result<String, String> {
    let c = state.conn.lock().map_err(|e| e.to_string())?;
    match password(&c)? { Some(p) => encrypt(&text, &p), None => Ok(text) }
}
#[tauri::command]
pub fn snapshot_decode(state: State<AppState>, text: String, migrate: bool) -> Result<String, String> {
    let c = state.conn.lock().map_err(|e| e.to_string())?;
    let p = password(&c)?;
    if is_encrypted(&text) { return decrypt(&text, &p.ok_or("Aktifkan enkripsi dan masukkan kata sandi snapshot yang sama.")?); }
    if p.is_some() && !migrate { return Err("Snapshot lama belum terenkripsi. Jalankan konversi snapshot di pengaturan.".into()); }
    Ok(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn roundtrip_randomized_and_authenticated() {
        let password = "kata sandi panjang 🔑";
        let a = encrypt("catatan rahasia", password).unwrap();
        let b = encrypt("catatan rahasia", password).unwrap();
        assert_ne!(a, b); assert!(!a.contains("catatan rahasia"));
        assert_eq!(decrypt(&a, password).unwrap(), "catatan rahasia");
        assert!(decrypt(&a, "password salah").is_err());
        let mut env: serde_json::Value = serde_json::from_str(&a).unwrap();
        env["iterations"] = 1.into();
        assert!(decrypt(&env.to_string(), password).is_err());
        env["iterations"] = ITERATIONS.into();
        env["ciphertext"] = STANDARD.encode([0u8; 32]).into();
        assert!(decrypt(&env.to_string(), password).is_err());
    }
}
