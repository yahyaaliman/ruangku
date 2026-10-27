//! Operasi file untuk modul File Manager.
//! Penghapusan selalu lewat Recycle Bin (crate `trash`) supaya bisa dipulihkan.

use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified: i64,
    pub ext: String,
    pub hidden: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub label: String,
    pub path: String,
    pub kind: String,
}

fn is_hidden(path: &Path, name: &str) -> bool {
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if let Ok(m) = fs::metadata(path) {
            // FILE_ATTRIBUTE_HIDDEN = 0x2, FILE_ATTRIBUTE_SYSTEM = 0x4
            if m.file_attributes() & 0x6 != 0 {
                return true;
            }
        }
    }
    let _ = path;
    name.starts_with('.')
}

pub fn entry_for(path: &Path) -> Option<Entry> {
    let meta = fs::metadata(path).ok()?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    let modified = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let ext = if meta.is_dir() {
        String::new()
    } else {
        path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default()
    };
    Some(Entry {
        hidden: is_hidden(path, &name),
        name,
        path: path.to_string_lossy().to_string(),
        is_dir: meta.is_dir(),
        size: if meta.is_dir() { 0 } else { meta.len() },
        modified,
        ext,
    })
}

pub fn list_dir(path: &Path) -> Result<Vec<Entry>, String> {
    let rd = fs::read_dir(path).map_err(|e| format!("Tidak bisa membuka {}: {e}", path.display()))?;
    let mut out: Vec<Entry> = rd.flatten().filter_map(|e| entry_for(&e.path())).collect();
    out.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(out)
}

/// Drive yang tersedia di Windows (C:\, D:\, ...) atau `/` di sistem lain.
pub fn drives() -> Vec<Place> {
    #[cfg(windows)]
    {
        (b'A'..=b'Z')
            .map(|c| format!("{}:\\", c as char))
            .filter(|p| Path::new(p).exists())
            .map(|p| Place { label: format!("Drive {}", &p[..2]), path: p, kind: "drive".into() })
            .collect()
    }
    #[cfg(not(windows))]
    {
        vec![Place { label: "Root".into(), path: "/".into(), kind: "drive".into() }]
    }
}

fn validate_name(name: &str) -> Result<&str, String> {
    let n = name.trim();
    if n.is_empty() || n == "." || n == ".." {
        return Err("Nama tidak boleh kosong.".into());
    }
    if n.chars().any(|c| matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') || c.is_control()) {
        return Err("Nama tidak boleh memuat karakter < > : \" / \\ | ? *".into());
    }
    Ok(n)
}

/// Nama yang belum dipakai di `dir`: "Laporan.docx" -> "Laporan (1).docx".
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let first = dir.join(name);
    if !first.exists() {
        return first;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1..)
        .map(|i| dir.join(format!("{stem} ({i}){ext}")))
        .find(|c| !c.exists())
        .unwrap()
}

pub fn mkdir(parent: &Path, name: &str) -> Result<Entry, String> {
    let n = validate_name(name)?;
    let target = parent.join(n);
    if target.exists() {
        return Err(format!("\"{n}\" sudah ada di folder ini."));
    }
    fs::create_dir(&target).map_err(|e| e.to_string())?;
    entry_for(&target).ok_or_else(|| "Folder dibuat tapi tidak terbaca.".into())
}

pub fn create_file(parent: &Path, name: &str) -> Result<Entry, String> {
    let n = validate_name(name)?;
    let target = parent.join(n);
    if target.exists() {
        return Err(format!("\"{n}\" sudah ada di folder ini."));
    }
    fs::write(&target, b"").map_err(|e| e.to_string())?;
    entry_for(&target).ok_or_else(|| "File dibuat tapi tidak terbaca.".into())
}

pub fn rename(path: &Path, new_name: &str) -> Result<Entry, String> {
    let n = validate_name(new_name)?;
    let parent = path.parent().ok_or("Item ini tidak bisa diganti nama.")?;
    let target = parent.join(n);
    // Izinkan mengganti huruf besar/kecil saja (Windows tidak peka huruf).
    let same = target.to_string_lossy().to_lowercase() == path.to_string_lossy().to_lowercase();
    if target.exists() && !same {
        return Err(format!("\"{n}\" sudah ada di folder ini."));
    }
    fs::rename(path, &target).map_err(|e| e.to_string())?;
    entry_for(&target).ok_or_else(|| "Nama diganti tapi item tidak terbaca.".into())
}

fn copy_recursive(src: &Path, dst: &Path) -> std::io::Result<()> {
    if src.is_dir() {
        fs::create_dir_all(dst)?;
        for e in fs::read_dir(src)? {
            let e = e?;
            copy_recursive(&e.path(), &dst.join(e.file_name()))?;
        }
    } else {
        fs::copy(src, dst)?;
    }
    Ok(())
}

fn check_not_into_self(src: &Path, dest_dir: &Path) -> Result<(), String> {
    let s = fs::canonicalize(src).map_err(|e| e.to_string())?;
    let d = fs::canonicalize(dest_dir).map_err(|e| e.to_string())?;
    if src.is_dir() && d.starts_with(&s) {
        return Err(format!("Tidak bisa menyalin atau memindah \"{}\" ke dalam dirinya sendiri.", src.display()));
    }
    Ok(())
}

pub fn copy(sources: &[PathBuf], dest_dir: &Path) -> Result<usize, String> {
    let mut n = 0;
    for src in sources {
        check_not_into_self(src, dest_dir)?;
        let name = src.file_name().ok_or("Sumber tidak valid.")?.to_string_lossy().to_string();
        let target = unique_path(dest_dir, &name);
        copy_recursive(src, &target).map_err(|e| format!("Gagal menyalin {name}: {e}"))?;
        n += 1;
    }
    Ok(n)
}

pub fn move_items(sources: &[PathBuf], dest_dir: &Path) -> Result<usize, String> {
    let mut n = 0;
    for src in sources {
        if src.parent() == Some(dest_dir) {
            continue;
        }
        check_not_into_self(src, dest_dir)?;
        let name = src.file_name().ok_or("Sumber tidak valid.")?.to_string_lossy().to_string();
        let target = unique_path(dest_dir, &name);
        if fs::rename(src, &target).is_err() {
            // Beda drive: salin lalu hapus sumber.
            copy_recursive(src, &target).map_err(|e| format!("Gagal memindah {name}: {e}"))?;
            if src.is_dir() {
                fs::remove_dir_all(src)
            } else {
                fs::remove_file(src)
            }
            .map_err(|e| format!("{name} tersalin tapi sumber gagal dihapus: {e}"))?;
        }
        n += 1;
    }
    Ok(n)
}

pub fn to_recycle_bin(paths: &[PathBuf]) -> Result<usize, String> {
    trash::delete_all(paths).map_err(|e| format!("Gagal memindah ke Recycle Bin: {e}"))?;
    Ok(paths.len())
}

/// Cari file/folder yang namanya memuat `query` (tidak peka huruf besar/kecil).
pub fn search(root: &Path, query: &str, limit: usize) -> Vec<Entry> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return vec![];
    }
    walkdir::WalkDir::new(root)
        .max_depth(12)
        .into_iter()
        .filter_entry(|e| {
            // Lewati folder sistem/berat yang jarang dicari.
            let n = e.file_name().to_string_lossy();
            !(e.depth() > 0
                && e.file_type().is_dir()
                && matches!(n.as_ref(), "node_modules" | ".git" | "$Recycle.Bin" | "AppData" | "Windows" | "System Volume Information"))
        })
        .flatten()
        .filter(|e| e.depth() > 0 && e.file_name().to_string_lossy().to_lowercase().contains(&q))
        .take(limit)
        .filter_map(|e| entry_for(e.path()))
        .collect()
}

/// Ukuran total sebuah folder (dibatasi supaya tidak lama di folder raksasa).
pub fn dir_size(path: &Path) -> (u64, u64) {
    let mut bytes = 0u64;
    let mut files = 0u64;
    for e in walkdir::WalkDir::new(path).into_iter().flatten().take(200_000) {
        if e.file_type().is_file() {
            files += 1;
            bytes += e.metadata().map(|m| m.len()).unwrap_or(0);
        }
    }
    (bytes, files)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mkdir_rename_copy_move() {
        let t = tempfile::tempdir().unwrap();
        let root = t.path();
        mkdir(root, "Proyek").unwrap();
        assert!(mkdir(root, "Proyek").is_err());
        assert!(mkdir(root, "a/b").is_err());
        create_file(&root.join("Proyek"), "catatan.txt").unwrap();
        fs::write(root.join("Proyek/catatan.txt"), b"halo").unwrap();

        let e = rename(&root.join("Proyek"), "Proyek 2026").unwrap();
        assert!(e.is_dir);

        mkdir(root, "Arsip").unwrap();
        let src = vec![root.join("Proyek 2026")];
        copy(&src, &root.join("Arsip")).unwrap();
        copy(&src, &root.join("Arsip")).unwrap();
        assert!(root.join("Arsip/Proyek 2026/catatan.txt").exists());
        assert!(root.join("Arsip/Proyek 2026 (1)/catatan.txt").exists());

        // tidak boleh menyalin folder ke dalam dirinya sendiri
        assert!(copy(&[root.join("Arsip")], &root.join("Arsip/Proyek 2026")).is_err());

        move_items(&src, &root.join("Arsip")).unwrap();
        assert!(!root.join("Proyek 2026").exists());
        assert!(root.join("Arsip/Proyek 2026 (2)/catatan.txt").exists());

        let list = list_dir(root).unwrap();
        assert_eq!(list.len(), 1);
        let found = search(root, "CATATAN", 50);
        assert_eq!(found.len(), 3);
        assert_eq!(dir_size(root), (12, 3));
    }

    #[test]
    fn unique_names() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("a.txt"), b"").unwrap();
        fs::write(t.path().join("a (1).txt"), b"").unwrap();
        assert_eq!(unique_path(t.path(), "a.txt"), t.path().join("a (2).txt"));
        assert_eq!(unique_path(t.path(), "b.txt"), t.path().join("b.txt"));
    }

    #[test]
    fn list_sorts_folders_first() {
        let t = tempfile::tempdir().unwrap();
        fs::write(t.path().join("a.txt"), b"x").unwrap();
        fs::create_dir(t.path().join("z")).unwrap();
        let l = list_dir(t.path()).unwrap();
        assert_eq!(l[0].name, "z");
        assert_eq!(l[1].ext, "txt");
    }
}
