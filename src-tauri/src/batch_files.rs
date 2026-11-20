use serde::Serialize;
use std::{
    collections::HashMap,
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
    },
};
const MAX_BYTES: u64 = 32 * 1024 * 1024;
static NEXT: AtomicU64 = AtomicU64::new(1);
#[derive(Default)]
pub struct BatchFiles {
    inputs: Mutex<HashMap<String, PathBuf>>,
    outputs: Mutex<HashMap<String, PathBuf>>,
}
#[derive(Serialize)]
pub struct Input {
    id: String,
    name: String,
    token: String,
}
#[derive(Serialize)]
pub struct Directory {
    name: String,
    token: String,
}
fn token() -> String {
    NEXT.fetch_add(1, Ordering::Relaxed).to_string()
}
fn image(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str(),
        "png" | "jpg" | "jpeg" | "webp"
    )
}
fn collect(dir: &Path, files: &mut Vec<PathBuf>, depth: usize) -> Result<(), String> {
    if depth > 32 {
        return Err("文件夹层级超过 32".into());
    }
    for entry in std::fs::read_dir(dir).map_err(|_| "无法读取文件夹，请检查权限")? {
        let entry = entry.map_err(|_| "无法读取文件条目")?;
        let kind = entry.file_type().map_err(|_| "无法读取文件类型")?;
        // Do not follow symlinks outside the explicitly selected directory.
        if kind.is_symlink() {
            continue;
        }
        if kind.is_dir() {
            collect(&entry.path(), files, depth + 1)?
        } else if kind.is_file() && image(&entry.path()) {
            files.push(entry.path());
            if files.len() > 1000 {
                return Err("每批最多 1000 个文件".into());
            }
        }
    }
    Ok(())
}
fn write_unique(dir: &Path, name: &str, bytes: &[u8]) -> Result<String, String> {
    if bytes.len() as u64 > MAX_BYTES
        || name.len() > 180
        || name.starts_with('.')
        || name
            .chars()
            .any(|c| c.is_control() || "/\\:*?\"<>|".contains(c))
        || !image(Path::new(name))
    {
        return Err("输出名称、格式或大小无效".into());
    }
    let stem = Path::new(name)
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("名称无效")?;
    let ext = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .ok_or("扩展名无效")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(dir).map_err(|_| "无法创建输出，请重新选择可写目录")?;
    temporary
        .write_all(bytes)
        .map_err(|_| "输出写入失败，请检查磁盘空间")?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| "输出持久化失败")?;
    for index in 1..=10000 {
        let candidate = dir.join(if index == 1 {
            name.to_string()
        } else {
            format!("{stem}-{index}.{ext}")
        });
        match temporary.persist_noclobber(&candidate) {
            Ok(_) => return Ok(candidate.to_string_lossy().into_owned()),
            Err(e) => {
                if e.error.kind() != std::io::ErrorKind::AlreadyExists {
                    return Err("无法保存输出，请检查权限或剩余空间".into());
                }
                temporary = e.file;
            }
        }
    }
    Err("输出名称冲突过多".into())
}
#[tauri::command]
pub async fn batch_pick_inputs(
    state: tauri::State<'_, BatchFiles>,
    folder: bool,
) -> Result<Option<Vec<Input>>, String> {
    let paths =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<Vec<PathBuf>>, String> {
            if folder {
                let Some(dir) = rfd::FileDialog::new().pick_folder() else {
                    return Ok(None);
                };
                let mut files = vec![];
                collect(&dir, &mut files, 0)?;
                Ok(Some(files))
            } else {
                Ok(rfd::FileDialog::new()
                    .add_filter("图片", &["png", "jpg", "jpeg", "webp"])
                    .pick_files())
            }
        })
        .await
        .map_err(|_| "文件选择任务失败")??;
    let Some(mut paths) = paths else {
        return Ok(None);
    };
    if paths.len() > 1000 {
        return Err("每批最多 1000 个文件".into());
    }
    paths.sort();
    let mut inputs = state.inputs.lock().map_err(|_| "文件状态不可用")?;
    // Replacing a selection releases previous path capabilities; reads already in progress own their path.
    inputs.clear();
    let mut result = vec![];
    for path in paths {
        let key = token();
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        inputs.insert(key.clone(), path);
        result.push(Input {
            id: key.clone(),
            name,
            token: key,
        });
    }
    Ok(Some(result))
}
#[tauri::command]
pub async fn batch_pick_output(
    state: tauri::State<'_, BatchFiles>,
) -> Result<Option<Directory>, String> {
    let selected = tauri::async_runtime::spawn_blocking(|| rfd::FileDialog::new().pick_folder())
        .await
        .map_err(|_| "目录选择任务失败")?;
    let Some(path) = selected else {
        return Ok(None);
    };
    let key = token();
    let name = path.to_string_lossy().into_owned();
    let mut outputs = state.outputs.lock().map_err(|_| "目录状态不可用")?;
    outputs.clear();
    outputs.insert(key.clone(), path);
    Ok(Some(Directory { name, token: key }))
}
#[tauri::command]
pub async fn batch_read_input(
    state: tauri::State<'_, BatchFiles>,
    token: String,
) -> Result<Vec<u8>, String> {
    let path = state
        .inputs
        .lock()
        .map_err(|_| "文件状态不可用")?
        .get(&token)
        .cloned()
        .ok_or("输入已失效，请重新选择")?;
    tauri::async_runtime::spawn_blocking(move || {
        let file = std::fs::File::open(&path).map_err(|_| "无法读取图片，请检查权限")?;
        if file.metadata().map_err(|_| "无法读取图片信息")?.len() > MAX_BYTES {
            return Err("输入超过 32MB".into());
        }
        use std::io::Read;
        let mut bytes = vec![];
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "图片读取失败")?;
        if bytes.len() as u64 > MAX_BYTES {
            return Err("输入超过 32MB".into());
        }
        Ok(bytes)
    })
    .await
    .map_err(|_| "读取任务失败")?
}
#[tauri::command]
pub async fn batch_write_output(
    state: tauri::State<'_, BatchFiles>,
    token: String,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    let dir = state
        .outputs
        .lock()
        .map_err(|_| "目录状态不可用")?
        .get(&token)
        .cloned()
        .ok_or("目录已失效，请重新选择")?;
    tauri::async_runtime::spawn_blocking(move || write_unique(&dir, &name, &bytes))
        .await
        .map_err(|_| "写入任务失败")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_originals_and_uses_exclusive_atomic_names() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("photo.png");
        std::fs::write(&source, b"source").unwrap();
        let first = write_unique(dir.path(), "photo.png", b"one").unwrap();
        let second = write_unique(dir.path(), "photo.png", b"two").unwrap();
        assert!(first.ends_with("photo-2.png"));
        assert!(second.ends_with("photo-3.png"));
        assert_eq!(std::fs::read(&source).unwrap(), b"source");
        assert_eq!(std::fs::read(first).unwrap(), b"one");
        assert_eq!(std::fs::read(second).unwrap(), b"two");
    }
    #[test]
    fn rejects_traversal_and_preserves_prior_results_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        for name in [
            "../escape.png",
            "/tmp/x.png",
            "..\\x.png",
            ".hidden.png",
            "x.txt",
        ] {
            assert!(write_unique(dir.path(), name, b"bad").is_err())
        }
        let file = write_unique(dir.path(), "valid.png", b"good").unwrap();
        assert!(write_unique(&dir.path().join("missing"), "valid.png", b"bad").is_err());
        assert_eq!(std::fs::read(file).unwrap(), b"good");
    }
    #[test]
    fn accepts_byte_budgeted_chinese_and_emoji_output_names_without_overwrite() {
        let dir = tempfile::tempdir().unwrap();
        // Matches the frontend 170-byte budget, including -batch-1000.png suffix.
        for stem in ["图".repeat(51), "😀".repeat(38)] {
            let name = format!("{stem}-batch-1000.png");
            assert!(name.len() <= 170);
            let first = write_unique(dir.path(), &name, b"first").unwrap();
            let second = write_unique(dir.path(), &name, b"second").unwrap();
            assert_ne!(first, second);
            assert_eq!(std::fs::read(first).unwrap(), b"first");
            assert_eq!(std::fs::read(second).unwrap(), b"second");
        }
        assert!(
            write_unique(
                dir.path(),
                &format!("{}-batch-1000.png", "图".repeat(60)),
                b"bad"
            )
            .is_err()
        );
    }
    #[test]
    fn collects_nested_files_but_not_nonimages() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::create_dir(dir.path().join("nested")).unwrap();
        std::fs::write(dir.path().join("a.PNG"), b"x").unwrap();
        std::fs::write(dir.path().join("nested/a.jpg"), b"x").unwrap();
        std::fs::write(dir.path().join("a.txt"), b"x").unwrap();
        let mut files = vec![];
        collect(dir.path(), &mut files, 0).unwrap();
        assert_eq!(files.len(), 2);
    }
}
