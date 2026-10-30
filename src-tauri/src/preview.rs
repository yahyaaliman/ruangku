//! Bounded local previews. Text is never interpreted as HTML.
use serde::Serialize;
use std::{fs::File, io::Read, path::Path};

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Preview {
    Text { text: String, truncated: bool },
    Image { mime: String, bytes: Vec<u8> },
    Pdf { bytes: Vec<u8> },
}

pub fn read(path: &Path) -> Result<Preview, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    if !file.metadata().map_err(|e| e.to_string())?.is_file() {
        return Err("Pilih sebuah file untuk pratinjau.".into());
    }
    let ext = path.extension().and_then(|v| v.to_str()).unwrap_or("").to_lowercase();
    let mime = match ext.as_str() {
        "png" => Some("image/png"), "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"), "webp" => Some("image/webp"), "bmp" => Some("image/bmp"),
        _ => None,
    };
    let pdf = ext == "pdf";
    let text = matches!(ext.as_str(), "txt" | "md" | "log" | "csv" | "tsv" | "json" | "xml" | "html" | "css" | "js" | "ts" | "tsx" | "jsx" | "rs" | "py" | "toml" | "yaml" | "yml" | "ini" | "sql");
    if mime.is_none() && !pdf && !text { return Err("Format ini belum mendukung pratinjau.".into()); }
    let limit = if text { 256 * 1024 } else { 10 * 1024 * 1024 };
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    let truncated = bytes.len() > limit as usize;
    if text {
        bytes.truncate(limit as usize);
        if bytes.contains(&0) { return Err("File biner atau teks selain UTF-8 tidak dapat ditampilkan.".into()); }
        return Ok(Preview::Text { text: String::from_utf8_lossy(&bytes).into_owned(), truncated });
    }
    if truncated { return Err("Pratinjau gambar/PDF dibatasi 10 MB. Buka file untuk melihat seluruh isinya.".into()); }
    if pdf {
        if !bytes.starts_with(b"%PDF-") { return Err("Isi file bukan PDF yang valid.".into()); }
        Ok(Preview::Pdf { bytes })
    } else { Ok(Preview::Image { mime: mime.unwrap().into(), bytes }) }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn limits_text_and_rejects_active_or_binary_content() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("test.txt");
        std::fs::write(&p, vec![b'a'; 300_000]).unwrap();
        assert!(matches!(read(&p).unwrap(), Preview::Text { truncated: true, .. }));
        std::fs::write(&p, b"a\0b").unwrap();
        assert!(read(&p).is_err());
        let svg = t.path().join("test.svg");
        std::fs::write(&svg, b"<svg/>").unwrap();
        assert!(read(&svg).is_err());
        assert!(read(t.path()).is_err());
    }
    #[test]
    fn pdf_requires_signature_and_size_limit() {
        let t = tempfile::tempdir().unwrap();
        let p = t.path().join("test.pdf");
        std::fs::write(&p, b"not a pdf").unwrap();
        assert!(read(&p).is_err());
        std::fs::write(&p, b"%PDF-1.7\n").unwrap();
        assert!(matches!(read(&p).unwrap(), Preview::Pdf { .. }));
        let f = std::fs::OpenOptions::new().write(true).open(&p).unwrap();
        f.set_len(11 * 1024 * 1024).unwrap();
        assert!(read(&p).is_err());
    }
}
