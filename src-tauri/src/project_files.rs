use std::{collections::HashMap, io::Write, path::Path, sync::{atomic::{AtomicU64, Ordering}, Mutex}};
use serde::Serialize;

const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);
#[derive(Default)]
pub struct ProjectFiles(pub Mutex<HashMap<String, std::path::PathBuf>>);
#[derive(Serialize)]
pub struct ProjectFile { token: String, name: String, contents: Option<String> }

fn atomic_save(path: &Path, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > MAX_FILE_BYTES { return Err("项目文件超过 256MB".into()); }
    let parent = path.parent().ok_or("保存位置无效")?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建临时文件，请检查目录权限")?;
    temporary.write_all(contents.as_bytes()).map_err(|_| "项目写入失败，原文件已保留，请检查剩余空间")?;
    temporary.as_file().sync_all().map_err(|_| "无法持久化项目，原文件已保留")?;
    temporary.persist(path).map_err(|_| "无法替换项目文件，原文件已保留")?;
    Ok(())
}

#[tauri::command]
pub async fn open_project_file(state: tauri::State<'_, ProjectFiles>) -> Result<Option<ProjectFile>, String> {
    let result = tauri::async_runtime::spawn_blocking(|| -> Result<Option<(std::path::PathBuf, String)>, String> {
        let Some(path) = rfd::FileDialog::new().add_filter("Draivio 项目", &["draivio"]).pick_file() else { return Ok(None); };
        let size = std::fs::metadata(&path).map_err(|_| "无法读取项目文件")?.len();
        if size > MAX_FILE_BYTES { return Err("项目文件超过 256MB".to_string()); }
        let contents = std::fs::read_to_string(&path).map_err(|_| "无法读取项目，请检查权限或文件格式")?;
        Ok(Some((path, contents)))
    }).await.map_err(|_| "项目打开任务失败")??;
    let Some((path, contents)) = result else { return Ok(None); };
    let token = NEXT_TOKEN.fetch_add(1, Ordering::Relaxed).to_string();
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    state.0.lock().map_err(|_| "项目文件状态不可用")?.insert(token.clone(), path);
    Ok(Some(ProjectFile { token, name, contents: Some(contents) }))
}

#[tauri::command]
pub async fn save_project_file(state: tauri::State<'_, ProjectFiles>, token: Option<String>, contents: String, suggested_name: String) -> Result<Option<ProjectFile>, String> {
    let previous = match &token {
        Some(key) => Some(state.0.lock().map_err(|_| "项目文件状态不可用")?.get(key).cloned().ok_or("保存位置已失效，请另存为")?),
        None => None,
    };
    let result = tauri::async_runtime::spawn_blocking(move || -> Result<Option<std::path::PathBuf>, String> {
        let path = match previous {
            Some(path) => path,
            None => {
                let clean_name: String = suggested_name.chars().filter(|c| !"/\\:*?\"<>|".contains(*c) && !c.is_control()).take(100).collect();
                let Some(path) = rfd::FileDialog::new().add_filter("Draivio 项目", &["draivio"]).set_file_name(format!("{}.draivio", if clean_name.is_empty() { "未命名作品" } else { &clean_name })).save_file() else { return Ok(None); };
                path
            }
        };
        atomic_save(&path, &contents)?;
        Ok(Some(path))
    }).await.map_err(|_| "项目保存任务失败")??;
    let Some(path) = result else { return Ok(None); };
    let token = token.unwrap_or_else(|| NEXT_TOKEN.fetch_add(1, Ordering::Relaxed).to_string());
    let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
    state.0.lock().map_err(|_| "项目文件状态不可用")?.insert(token.clone(), path);
    Ok(Some(ProjectFile { token, name, contents: None }))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_atomically_and_preserves_existing_file_on_failure() {
        let dir = tempfile::tempdir().unwrap(); let path = dir.path().join("art.draivio");
        std::fs::write(&path, "old").unwrap(); atomic_save(&path, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(atomic_save(&dir.path().join("missing/art.draivio"), "bad").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
    }
}
