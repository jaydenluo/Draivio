//! Durable recovery manifests. Artwork bytes stay in the resource store; this
//! journal contains only document metadata, project JSON and resource revisions.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};
use tauri::{Manager, State};
static NEXT: AtomicU64 = AtomicU64::new(1);
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryEntry {
    pub document_id: String,
    pub revision: String,
    pub saved_at: u64,
    pub project: String,
}
#[derive(Default)]
pub struct RecoveryState {
    pub root: std::sync::Mutex<Option<PathBuf>>,
}
fn safe(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > 256 || id.contains('/') || id.contains('\\') {
        Err("恢复文档标识无效".into())
    } else {
        Ok(())
    }
}
fn root(state: &State<'_, RecoveryState>) -> Result<PathBuf, String> {
    state
        .root
        .lock()
        .unwrap()
        .clone()
        .ok_or("恢复存储未初始化".into())
}
fn path(root: &Path, id: &str) -> PathBuf {
    root.join(format!("{id}.manifest"))
}
#[tauri::command]
pub fn recovery_write(state: State<'_, RecoveryState>, entry: RecoveryEntry) -> Result<(), String> {
    safe(&entry.document_id)?;
    if entry.project.as_bytes().len() > 8 * 1024 * 1024 || entry.revision.is_empty() || entry.revision.len() > 256 {
        return Err("恢复清单超过限制".into());
    }
    let root = root(&state)?;
    fs::create_dir_all(&root).map_err(|_| "恢复存储不可用".to_string())?;
    let tmp = root.join(format!(
        ".{}.{}.tmp",
        entry.document_id,
        NEXT.fetch_add(1, Ordering::Relaxed)
    ));
    let bytes = serde_json::to_vec(&entry).map_err(|_| "恢复清单无效".to_string())?;
    fs::write(&tmp, &bytes).map_err(|_| "恢复清单写入失败，原副本已保留".to_string())?;
    let f = fs::File::open(&tmp).map_err(|_| "恢复清单持久化失败".to_string())?;
    f.sync_all().map_err(|_| "恢复清单持久化失败".to_string())?;
    fs::rename(&tmp, path(&root, &entry.document_id))
        .map_err(|_| "恢复清单替换失败，原副本已保留".to_string())?;
    fs::File::open(&root)
        .and_then(|f| f.sync_all())
        .map_err(|_| "恢复清单目录持久化未确认".to_string())?;
    Ok(())
}
#[tauri::command]
pub fn recovery_list(state: State<'_, RecoveryState>) -> Result<Vec<RecoveryEntry>, String> {
    let root = root(&state)?;
    let mut out = vec![];
    let entries = fs::read_dir(root).map_err(|_| "恢复存储不可用".to_string())?;
    for e in entries {
        let e = e.map_err(|_| "恢复清单损坏，请重试".to_string())?;
            if e.path().extension().and_then(|x| x.to_str()) != Some("manifest") {
                continue;
            }
            let bytes = fs::read(e.path()).map_err(|_| "恢复清单损坏，请重试".to_string())?;
            let v = serde_json::from_slice::<RecoveryEntry>(&bytes).map_err(|_| "恢复清单损坏，请重试".to_string())?;
            if safe(&v.document_id).is_err() || v.project.as_bytes().len() > 8 * 1024 * 1024 || v.revision.is_empty() || v.revision.len() > 256 { return Err("恢复清单损坏，请重试".into()); }
            out.push(v);
    }
    out.sort_by_key(|v| std::cmp::Reverse(v.saved_at));
    Ok(out)
}
#[tauri::command]
pub fn recovery_discard(
    state: State<'_, RecoveryState>,
    document_id: String,
) -> Result<(), String> {
    safe(&document_id)?;
    let root = root(&state)?;
    let p = path(&root, &document_id);
    if p.exists() {
        fs::remove_file(p).map_err(|_| "恢复副本删除失败，原副本已保留".to_string())?
    }
    Ok(())
}
pub fn init(app: &tauri::AppHandle, state: &RecoveryState) -> Result<(), String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|_| "恢复存储不可用".to_string())?
        .join("workspace-recovery-v1");
    fs::create_dir_all(&root).map_err(|_| "恢复存储不可用".to_string())?;
    *state.root.lock().unwrap() = Some(root);
    Ok(())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_path_ids() {
        assert!(safe("../x").is_err());
        assert!(safe("doc").is_ok())
    }
}
