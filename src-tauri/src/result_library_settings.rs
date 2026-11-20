use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};
use tauri::Manager;

#[derive(Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Preferences {
    directory: Option<PathBuf>,
    previous_directories: Vec<PathBuf>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySettings {
    directory: PathBuf,
    default_directory: PathBuf,
    is_default: bool,
}
fn default_directory(app_data: &Path) -> PathBuf {
    app_data.join("generated-images")
}
fn read(app_data: &Path) -> Result<Preferences, String> {
    let file = app_data.join("image-library-settings.json");
    match fs::read(&file) {
        Ok(bytes) => {
            if bytes.len() > 1024 * 1024 {
                return Err("图片目录配置过大".into());
            }
            let value: Preferences =
                serde_json::from_slice(&bytes).map_err(|_| "图片目录配置损坏")?;
            if value
                .directory
                .iter()
                .chain(value.previous_directories.iter())
                .any(|p| !p.is_absolute())
            {
                return Err("图片目录配置无效".into());
            }
            Ok(value)
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Preferences::default()),
        Err(_) => Err("无法读取图片目录配置".into()),
    }
}
fn settings(app_data: &Path) -> Result<LibrarySettings, String> {
    let default_directory = default_directory(app_data);
    let directory = read(app_data)?
        .directory
        .unwrap_or_else(|| default_directory.clone());
    Ok(LibrarySettings {
        is_default: directory == default_directory,
        directory,
        default_directory,
    })
}
pub(super) fn directories(app_data: &Path) -> Result<Vec<PathBuf>, String> {
    let preferences = read(app_data)?;
    let mut roots = vec![
        preferences
            .directory
            .unwrap_or_else(|| default_directory(app_data)),
    ];
    for path in preferences
        .previous_directories
        .into_iter()
        .chain(std::iter::once(default_directory(app_data)))
    {
        if !roots.contains(&path) {
            roots.push(path);
        }
    }
    Ok(roots)
}
pub(super) fn change(app_data: &Path, selected: Option<&Path>) -> Result<LibrarySettings, String> {
    let mut preferences = read(app_data)?;
    let default = default_directory(app_data);
    let requested = selected.unwrap_or(&default);
    if !requested.is_absolute() {
        return Err("请选择有效的绝对文件夹路径".into());
    }
    // Only the application's default folder may be created implicitly.
    if selected.is_none() {
        fs::create_dir_all(requested).map_err(|_| "无法创建默认图片目录")?;
    }
    if !requested.is_dir() {
        return Err("所选文件夹不存在".into());
    }
    let resolved = fs::canonicalize(requested).map_err(|_| "无法访问所选文件夹")?;
    let mut probe = tempfile::NamedTempFile::new_in(&resolved)
        .map_err(|_| "所选文件夹不可写，请选择其他位置")?;
    use std::io::Write;
    probe
        .write_all(b"Draivio directory check")
        .map_err(|_| "所选文件夹不可写")?;
    probe
        .as_file()
        .sync_all()
        .map_err(|_| "图片目录写入失败，请检查剩余空间")?;
    let old = preferences
        .directory
        .clone()
        .unwrap_or_else(|| default.clone());
    let next = if selected.is_none() || fs::canonicalize(&default).ok().as_ref() == Some(&resolved)
    {
        default.clone()
    } else {
        resolved
    };
    if old != next && !preferences.previous_directories.contains(&old) {
        preferences.previous_directories.push(old);
    }
    preferences.previous_directories.retain(|p| p != &next);
    preferences.directory = (next != default).then_some(next);
    fs::create_dir_all(app_data).map_err(|_| "无法创建应用设置目录")?;
    let bytes = serde_json::to_vec(&preferences).map_err(|_| "无法编码图片目录设置")?;
    super::result_library::atomic_write(&app_data.join("image-library-settings.json"), &bytes)?;
    settings(app_data)
}
pub(super) fn app_data(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|_| "无法定位应用设置目录".into())
}
#[tauri::command]
pub async fn result_library_settings(app: tauri::AppHandle) -> Result<LibrarySettings, String> {
    let dir = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = super::result_library::LOCK
            .lock()
            .map_err(|_| "作品库暂不可用")?;
        settings(&dir)
    })
    .await
    .map_err(|_| "读取设置任务失败")?
}
#[tauri::command]
pub async fn result_library_choose_directory(
    app: tauri::AppHandle,
) -> Result<Option<LibrarySettings>, String> {
    let dir = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let current = {
            let _guard = super::result_library::LOCK
                .lock()
                .map_err(|_| "作品库暂不可用")?;
            settings(&dir)?.directory
        };
        let mut dialog = rfd::FileDialog::new().set_title("选择生成图片保存文件夹");
        if current.is_dir() {
            dialog = dialog.set_directory(current);
        }
        let Some(selected) = dialog.pick_folder() else {
            return Ok(None);
        };
        let _guard = super::result_library::LOCK
            .lock()
            .map_err(|_| "作品库暂不可用")?;
        change(&dir, Some(&selected)).map(Some)
    })
    .await
    .map_err(|_| "选择图片目录任务失败")?
}
#[tauri::command]
pub async fn result_library_reset_directory(
    app: tauri::AppHandle,
) -> Result<LibrarySettings, String> {
    let dir = app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = super::result_library::LOCK
            .lock()
            .map_err(|_| "作品库暂不可用")?;
        change(&dir, None)
    })
    .await
    .map_err(|_| "恢复图片目录任务失败")?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn defaults_do_not_require_existing_directory() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let initial = settings(&app).unwrap();
        assert!(initial.is_default);
        assert_eq!(initial.directory, app.join("generated-images"));
        assert!(!app.exists());
    }
    #[test]
    fn persists_choice_and_previous_directories_across_restart_and_reset() {
        let dir = tempfile::tempdir().unwrap();
        let app = dir.path().join("app");
        let custom = dir.path().join("pictures");
        fs::create_dir(&custom).unwrap();
        let selected = change(&app, Some(&custom)).unwrap();
        assert!(!selected.is_default);
        assert_eq!(
            settings(&app).unwrap().directory,
            fs::canonicalize(&custom).unwrap()
        );
        assert_eq!(
            directories(&app).unwrap(),
            vec![
                fs::canonicalize(&custom).unwrap(),
                app.join("generated-images")
            ]
        );
        let reset = change(&app, None).unwrap();
        assert!(reset.is_default);
        assert_eq!(
            directories(&app).unwrap(),
            vec![
                app.join("generated-images"),
                fs::canonicalize(&custom).unwrap()
            ]
        );
        assert!(custom.is_dir());
    }
    #[test]
    fn choosing_the_default_folder_is_still_default_even_through_a_canonical_path() {
        let dir = tempfile::tempdir().unwrap();
        let default = default_directory(dir.path());
        fs::create_dir(&default).unwrap();
        let selected = change(dir.path(), Some(&fs::canonicalize(&default).unwrap())).unwrap();
        assert!(selected.is_default);
        assert_eq!(directories(dir.path()).unwrap(), vec![default]);
    }
    #[test]
    fn invalid_choice_preserves_settings_and_existing_images() {
        let dir = tempfile::tempdir().unwrap();
        let custom = dir.path().join("pictures");
        fs::create_dir(&custom).unwrap();
        change(dir.path(), Some(&custom)).unwrap();
        let original = fs::read(dir.path().join("image-library-settings.json")).unwrap();
        fs::write(custom.join("keep.png"), b"original").unwrap();
        for path in [
            PathBuf::from("relative"),
            dir.path().join("missing"),
            custom.join("keep.png"),
        ] {
            assert!(change(dir.path(), Some(&path)).is_err());
        }
        assert_eq!(
            fs::read(dir.path().join("image-library-settings.json")).unwrap(),
            original
        );
        assert_eq!(fs::read(custom.join("keep.png")).unwrap(), b"original");
    }
}
