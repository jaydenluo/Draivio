use crate::{
    image_assets::ImageAssets,
    project_container::{self, Opened, SaveRequest},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
};
const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;
static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);
#[derive(Default)]
pub struct ProjectFiles(pub Mutex<HashMap<String, PathBuf>>);
#[derive(Serialize)]
pub struct ProjectFile {
    pub token: String,
    pub name: String,
    pub contents: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub container: Option<Opened>,
    pub schema_version: u8,
}
fn new_token() -> String {
    NEXT_TOKEN.fetch_add(1, Ordering::Relaxed).to_string()
}
fn name(path: &Path) -> String {
    path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string()
}
fn atomic_save(path: &Path, contents: &str) -> Result<(), String> {
    if contents.len() as u64 > MAX_FILE_BYTES {
        return Err("旧项目超过 64 MiB 解析预算".into());
    }
    let parent = path.parent().ok_or("保存位置无效")?;
    let mut temp =
        tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法创建临时文件，请检查目录权限")?;
    temp.write_all(contents.as_bytes())
        .map_err(|_| "项目写入失败，原文件已保留，请检查剩余空间")?;
    temp.as_file()
        .sync_all()
        .map_err(|_| "无法持久化项目，原文件已保留")?;
    temp.persist(path)
        .map_err(|_| "无法替换项目文件，原文件已保留")?;
    Ok(())
}
fn lookup(state: &ProjectFiles, token: &str) -> Result<PathBuf, String> {
    state
        .0
        .lock()
        .map_err(|_| "项目文件状态不可用")?
        .get(token)
        .cloned()
        .ok_or("项目文件权限已失效，请重新打开".into())
}
pub fn register(state: &ProjectFiles, path: PathBuf) -> Result<(String, String), String> {
    let token = new_token();
    let name = name(&path);
    state
        .0
        .lock()
        .map_err(|_| "项目文件状态不可用")?
        .insert(token.clone(), path);
    Ok((token, name))
}
fn read_project(path: &Path, token: String, service: &ImageAssets) -> Result<ProjectFile, String> {
    if project_container::is_container(path)? {
        let owner = format!("open:{}:{}", token, new_token());
        let store = service.project_store();
        let cancel = AtomicBool::new(false);
        let generation = service.generation();
        let container =
            project_container::open_verified(path, &store, &owner, &cancel, |asset, path| {
                if service.generation() != generation {
                    return Err("项目打开已取消".into());
                }
                service
                    .verify_project_asset(asset, path, &cancel)
                    .map_err(|e| e.message)
            })?;
        if service.generation() != generation {
            let _ = project_container::release(&store, &owner);
            return Err("项目打开已取消".into());
        }
        Ok(ProjectFile {
            token,
            name: name(path),
            contents: None,
            container: Some(container),
            schema_version: 4,
        })
    } else {
        if std::fs::metadata(path)
            .map_err(|_| "无法读取项目文件")?
            .len()
            > MAX_FILE_BYTES
        {
            return Err("旧 JSON 项目超过 64 MiB 解析预算；二进制项目请通过原生打开".into());
        }
        let mut contents = String::new();
        FileReader::read(path, &mut contents)?;
        Ok(ProjectFile {
            token,
            name: name(path),
            contents: Some(contents),
            container: None,
            schema_version: 3,
        })
    }
}
struct FileReader;
impl FileReader {
    fn read(path: &Path, out: &mut String) -> Result<(), String> {
        let file = std::fs::File::open(path).map_err(|_| "无法读取项目文件")?;
        file.take(MAX_FILE_BYTES + 1)
            .read_to_string(out)
            .map_err(|_| "无法读取项目，请检查权限或文件格式")?;
        if out.len() as u64 > MAX_FILE_BYTES {
            return Err("旧项目超过解析预算".into());
        }
        Ok(())
    }
}
#[tauri::command]
pub async fn open_project_file(
    state: tauri::State<'_, ProjectFiles>,
    service: tauri::State<'_, ImageAssets>,
) -> Result<Option<ProjectFile>, String> {
    let path = tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .add_filter("Draivio 项目", &["draivio"])
            .pick_file()
    })
    .await
    .map_err(|_| "项目选择失败")?;
    let Some(path) = path else {
        return Ok(None);
    };
    let (token, _) = register(&state, path.clone())?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || read_project(&path, token, &service))
        .await
        .map_err(|_| "项目打开任务失败")?
        .map(Some)
}
#[tauri::command]
pub async fn open_project_token(
    state: tauri::State<'_, ProjectFiles>,
    service: tauri::State<'_, ImageAssets>,
    token: String,
) -> Result<ProjectFile, String> {
    let path = lookup(&state, &token)?;
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || read_project(&path, token, &service))
        .await
        .map_err(|_| "项目打开任务失败")?
}
fn save_path(previous: Option<PathBuf>, suggested_name: &str) -> Option<PathBuf> {
    previous.or_else(|| {
        let clean: String = suggested_name
            .chars()
            .filter(|c| !"/\\:*?\"<>|".contains(*c) && !c.is_control())
            .take(100)
            .collect();
        rfd::FileDialog::new()
            .add_filter("Draivio 项目", &["draivio"])
            .set_file_name(format!(
                "{}.draivio",
                if clean.is_empty() {
                    "未命名作品"
                } else {
                    &clean
                }
            ))
            .save_file()
    })
}
#[tauri::command]
pub async fn save_project_file(
    state: tauri::State<'_, ProjectFiles>,
    token: Option<String>,
    contents: String,
    suggested_name: String,
) -> Result<Option<ProjectFile>, String> {
    let previous = token.as_ref().map(|t| lookup(&state, t)).transpose()?;
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<PathBuf>, String> {
            let Some(path) = save_path(previous, &suggested_name) else {
                return Ok(None);
            };
            if path.exists() && project_container::is_container(&path)? {
                return Err("v4 项目必须通过二进制保存，原文件已保留".into());
            }
            atomic_save(&path, &contents)?;
            Ok(Some(path))
        })
        .await
        .map_err(|_| "项目保存任务失败")??;
    let Some(path) = result else {
        return Ok(None);
    };
    let (token, _) = register(&state, path.clone())?;
    Ok(Some(ProjectFile {
        token,
        name: name(&path),
        contents: None,
        container: None,
        schema_version: 3,
    }))
}
#[tauri::command]
pub async fn save_project_container(
    state: tauri::State<'_, ProjectFiles>,
    service: tauri::State<'_, ImageAssets>,
    token: Option<String>,
    request: SaveRequest,
    suggested_name: String,
) -> Result<Option<ProjectFile>, String> {
    let previous = token.as_ref().map(|t| lookup(&state, t)).transpose()?;
    let service = service.inner().clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<Option<PathBuf>, String> {
            let Some(path) = save_path(previous, &suggested_name) else {
                return Ok(None);
            };
            if path.exists() && !project_container::is_container(&path)? {
                return Err("旧项目升级必须另存为新文件名；原版项目已保留".into());
            }
            project_container::save(
                &path,
                &service.project_store(),
                &request,
                &AtomicBool::new(false),
            )?;
            Ok(Some(path))
        })
        .await
        .map_err(|_| "项目保存任务失败")??;
    let Some(path) = result else {
        return Ok(None);
    };
    let (token, _) = register(&state, path.clone())?;
    Ok(Some(ProjectFile {
        token,
        name: name(&path),
        contents: None,
        container: None,
        schema_version: 4,
    }))
}
#[tauri::command]
pub fn release_project_container(
    service: tauri::State<'_, ImageAssets>,
    owner_id: String,
) -> Result<(), String> {
    if !owner_id.starts_with("open:") && !owner_id.starts_with("save:") {
        return Err("项目资源权限无效".into());
    }
    project_container::release(&service.project_store(), &owner_id)
}
#[tauri::command]
pub async fn register_project_inline(
    service: tauri::State<'_, ImageAssets>,
    source: String,
    owner_id: String,
) -> Result<crate::image_resource_store::StoredProjectSource, String> {
    let service = service.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service
            .register_project_inline(&source, &owner_id)
            .map_err(|e| e.message)
    })
    .await
    .map_err(|_| "旧资源迁移失败")?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn replaces_atomically_and_preserves_existing_file_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("art.draivio");
        std::fs::write(&path, "old").unwrap();
        atomic_save(&path, "new").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert!(atomic_save(&dir.path().join("missing/art.draivio"), "bad").is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
    }
}
