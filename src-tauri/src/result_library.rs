use super::result_library_settings;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
    sync::Mutex,
};

pub(super) static LOCK: Mutex<()> = Mutex::new(());
const MAX_BYTES: usize = 64 * 1024 * 1024;
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Record {
    id: String,
    document_id: String,
    prompt: String,
    model: String,
    provider: String,
    size: String,
    created_at: String,
    status: String,
    favorite: bool,
    adopted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_metadata: Option<GenerationMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImageParameters { model: String, size: String, ratio: String, count: String, strength: String }
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct ImageOverrides {
    #[serde(skip_serializing_if = "Option::is_none")] count: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")] ratio: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] strength: Option<f64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct SentImageParameters {
    #[serde(skip_serializing_if = "Option::is_none")] size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] quality: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")] strength: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")] n: Option<u8>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct GenerationMetadata { defaults: ImageParameters, resolved: ImageParameters, overrides: ImageOverrides, sent: SentImageParameters, operation: String }
#[derive(Serialize, Deserialize)]
struct Entry {
    record: Record,
    extension: String,
}
fn valid_id(id: &str) -> Result<(), String> {
    if id.is_empty()
        || id.len() > 256
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b':')
    {
        return Err("作品标识无效".into());
    }
    Ok(())
}
fn file_id(id: &str) -> String {
    format!("{:x}", Sha256::digest(id.as_bytes()))
}
fn decode(source: &str) -> Result<(Vec<u8>, &'static str), String> {
    if source.len() > 90 * 1024 * 1024 {
        return Err("图片超过本地保存限制".into());
    }
    let (payload, ext, format) = if let Some(v) = source.strip_prefix("data:image/png;base64,") {
        (v, "png", image::ImageFormat::Png)
    } else if let Some(v) = source.strip_prefix("data:image/jpeg;base64,") {
        (v, "jpg", image::ImageFormat::Jpeg)
    } else if let Some(v) = source.strip_prefix("data:image/webp;base64,") {
        (v, "webp", image::ImageFormat::WebP)
    } else {
        return Err("请提供已下载的 PNG、JPEG 或 WebP 图片".into());
    };
    let bytes = STANDARD.decode(payload).map_err(|_| "图片数据损坏")?;
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        return Err("图片超过本地保存限制".into());
    }
    if image::guess_format(&bytes).ok() != Some(format) {
        return Err("图片格式与内容不一致".into());
    }
    Ok((bytes, ext))
}
pub(super) fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut temp = tempfile::NamedTempFile::new_in(path.parent().ok_or("作品目录无效")?)
        .map_err(|_| "无法创建本地图片")?;
    temp.write_all(bytes)
        .map_err(|_| "本地保存失败，请检查剩余空间")?;
    temp.as_file().sync_all().map_err(|_| "本地图片写入失败")?;
    temp.persist(path).map_err(|_| "无法完成本地保存")?;
    Ok(())
}
fn save(
    root: &Path,
    mut record: Record,
    source: &str,
    favorite_override: Option<bool>,
) -> Result<(), String> {
    valid_id(&record.id)?;
    if record.generation_metadata.as_ref().is_some_and(|m| serde_json::to_vec(m).map_or(true, |v| v.len() > 16 * 1024)) { return Err("图片参数记录过大".into()); }
    if record.status != "success"
        || record.error.as_ref().is_some_and(|s| s.len() > 4096)
        || record.prompt.len() > 512 * 1024
        || record.size.len() > 1024
        || record.created_at.len() > 100
        || record.model.len() > 1024
        || record.provider.len() > 1024
        || record.document_id.len() > 100
        || record
            .thumbnail
            .as_ref()
            .is_some_and(|s| s.len() > 256 * 1024 || !s.starts_with("data:image/"))
    {
        return Err("作品记录无效".into());
    }
    let (bytes, ext) = decode(source)?;
    fs::create_dir_all(root).map_err(|_| "无法创建本地作品库")?;
    if root.join(format!("{}.json", file_id(&record.id))).exists() {
        let previous = entry(root, &record.id)?;
        if previous.extension != ext {
            return Err("作品标识已被其他图片使用".into());
        }
        record.document_id = previous.record.document_id;
        record.favorite = favorite_override.unwrap_or(previous.record.favorite);
        record.adopted |= previous.record.adopted;
    }
    let path = root.join(format!("{}.{}", file_id(&record.id), ext));
    if path.exists() {
        if fs::read(&path).map_err(|_| "无法读取已有作品")? != bytes {
            return Err("作品标识已被其他图片使用".into());
        }
    } else {
        atomic_write(&path, &bytes)?
    }
    let entry = Entry {
        record,
        extension: ext.into(),
    };
    atomic_write(
        &root.join(format!("{}.json", file_id(&entry.record.id))),
        &serde_json::to_vec(&entry).map_err(|_| "无法编码作品记录")?,
    )
}
fn entry(root: &Path, id: &str) -> Result<Entry, String> {
    valid_id(id)?;
    let bytes =
        fs::read(root.join(format!("{}.json", file_id(id)))).map_err(|_| "本地作品不存在")?;
    if bytes.len() > 1024 * 1024 {
        return Err("作品记录过大".into());
    }
    let e: Entry = serde_json::from_slice(&bytes).map_err(|_| "本地作品记录损坏")?;
    if e.record.id != id || !["png", "jpg", "webp"].contains(&e.extension.as_str()) {
        return Err("作品记录无效".into());
    }
    Ok(e)
}
fn find_directory(roots: &[PathBuf], id: &str) -> Result<PathBuf, String> {
    valid_id(id)?;
    for dir in roots {
        if dir.join(format!("{}.json", file_id(id))).exists() {
            // A corrupt known record is an error, not a reason to create a new copy.
            entry(dir, id)?;
            return Ok(dir.clone());
        }
    }
    Err("本地作品不存在".into())
}
fn save_to_directories(
    roots: &[PathBuf],
    record: Record,
    source: &str,
    favorite_override: Option<bool>,
) -> Result<(), String> {
    // Update existing records at their original location; only new results use the new folder.
    let dir = if roots
        .iter()
        .any(|dir| dir.join(format!("{}.json", file_id(&record.id))).exists())
    {
        find_directory(roots, &record.id)?
    } else {
        roots.first().cloned().ok_or("图片保存目录不可用")?
    };
    save(&dir, record, source, favorite_override)
}
fn remove_from_directories(roots: &[PathBuf], id: &str) -> Result<(), String> {
    valid_id(id)?;
    let mut paths = vec![];
    let mut seen = std::collections::HashSet::new();
    let mut original_hash = None;
    // Validate every copy before moving anything; conflicting IDs must not delete another image.
    for dir in roots {
        let record = dir.join(format!("{}.json", file_id(id)));
        if !record.exists() {
            continue;
        }
        let canonical = fs::canonicalize(dir).map_err(|_| "无法访问作品目录")?;
        if !seen.insert(canonical) {
            continue;
        }
        let e = entry(dir, id)?;
        let image = dir.join(format!("{}.{}", file_id(id), e.extension));
        if fs::metadata(&image)
            .map_err(|_| "原图不存在，尚未移除作品")?
            .len()
            > MAX_BYTES as u64
        {
            return Err("本地原图超过移除预算".into());
        }
        let hash = Sha256::digest(fs::read(&image).map_err(|_| "无法验证本地原图")?);
        if original_hash
            .as_ref()
            .is_some_and(|previous| previous != &hash)
        {
            return Err("不同目录存在同名但内容不同的图片，未移除任何作品".into());
        }
        original_hash = Some(hash);
        paths.push((dir.clone(), image, record));
    }
    if paths.is_empty() {
        return Err("本地作品不存在".into());
    }
    let suffix = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|_| "系统时间无效")?
        .as_nanos();
    let mut moves = vec![];
    for (dir, image, record) in paths {
        let trash = dir.join("trash");
        fs::create_dir_all(&trash).map_err(|_| "无法创建作品回收目录")?;
        for source in [image, record] {
            let name = source
                .file_name()
                .ok_or("作品文件名无效")?
                .to_string_lossy();
            moves.push((source.clone(), trash.join(format!("{suffix}-{name}"))));
        }
    }
    for (index, (source, target)) in moves.iter().enumerate() {
        if fs::rename(source, target).is_err() {
            let mut recovered = true;
            for (before, after) in moves[..index].iter().rev() {
                if fs::rename(after, before).is_err() {
                    recovered = false;
                }
            }
            return Err(if recovered {
                "无法移除作品，已恢复原位置"
            } else {
                "部分图片已保留在原目录的 trash 文件夹，请检查后重试"
            }
            .into());
        }
    }
    Ok(())
}
fn list_records(roots: &[PathBuf]) -> Result<Vec<Record>, String> {
    let mut values = vec![];
    let mut seen = std::collections::HashSet::new();
    for dir in roots {
        if !dir.exists() {
            continue;
        }
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            // An old external drive may be unavailable; other libraries remain usable.
            Err(_) if dir != &roots[0] => continue,
            Err(_) => return Err("无法读取作品库".into()),
        };
        for item in entries {
            let path = item.map_err(|_| "无法读取作品记录")?.path();
            if path.extension().is_some_and(|s| s == "json") {
                if let Ok(bytes) = fs::read(&path) {
                    if bytes.len() <= 1024 * 1024 {
                        if let Ok(e) = serde_json::from_slice::<Entry>(&bytes) {
                            if valid_id(&e.record.id).is_ok()
                                && path.file_stem().and_then(|v| v.to_str())
                                    == Some(file_id(&e.record.id).as_str())
                                && ["png", "jpg", "webp"].contains(&e.extension.as_str())
                                && seen.insert(e.record.id.clone())
                            {
                                values.push(e.record);
                            }
                        }
                    }
                }
            }
        }
    }
    values.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(values)
}
#[tauri::command]
pub async fn result_library_save(
    app: tauri::AppHandle,
    record: Record,
    source: String,
    favorite_override: Option<bool>,
) -> Result<(), String> {
    let app_data = result_library_settings::app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "作品库暂不可用")?;
        let roots = result_library_settings::directories(&app_data)?;
        save_to_directories(&roots, record, &source, favorite_override)
    })
    .await
    .map_err(|_| "本地保存任务失败")?
}
#[tauri::command]
pub async fn result_library_list(app: tauri::AppHandle) -> Result<Vec<Record>, String> {
    let app_data = result_library_settings::app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "作品库暂不可用")?;
        list_records(&result_library_settings::directories(&app_data)?)
    })
    .await
    .map_err(|_| "作品库读取任务失败")?
}
#[tauri::command]
pub async fn result_library_load(app: tauri::AppHandle, id: String) -> Result<String, String> {
    let app_data = result_library_settings::app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "作品库暂不可用")?;
        let dir = find_directory(&result_library_settings::directories(&app_data)?, &id)?;
        let e = entry(&dir, &id)?;
        let path = dir.join(format!("{}.{}", file_id(&id), e.extension));
        if fs::metadata(&path).map_err(|_| "原图不存在")?.len() > MAX_BYTES as u64 {
            return Err("本地图片超过读取限制".into());
        }
        let bytes = fs::read(path).map_err(|_| "本地原图读取失败")?;
        Ok(format!(
            "data:image/{};base64,{}",
            if e.extension == "jpg" {
                "jpeg"
            } else {
                &e.extension
            },
            STANDARD.encode(bytes)
        ))
    })
    .await
    .map_err(|_| "原图读取任务失败")?
}
#[tauri::command]
pub async fn result_library_remove(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_data = result_library_settings::app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "作品库暂不可用")?;
        remove_from_directories(&result_library_settings::directories(&app_data)?, &id)
    })
    .await
    .map_err(|_| "移除作品任务失败")?
}
#[tauri::command]
pub async fn result_library_export(source: String, suggested_name: String) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let (bytes, ext) = decode(&source)?;
        let stem = Path::new(&suggested_name)
            .file_stem()
            .and_then(|v| v.to_str())
            .unwrap_or("Draivio-image")
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
            .take(80)
            .collect::<String>();
        let Some(path) = rfd::FileDialog::new()
            .set_file_name(format!("{stem}.{ext}"))
            .add_filter("图片", &[ext])
            .save_file()
        else {
            return Ok(false);
        };
        atomic_write(&path, &bytes)?;
        Ok(true)
    })
    .await
    .map_err(|_| "导出图片任务失败")?
}
#[tauri::command]
pub async fn result_library_reveal(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let app_data = result_library_settings::app_data(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(|_| "作品库暂不可用")?;
        let dir = find_directory(&result_library_settings::directories(&app_data)?, &id)?;
        let e = entry(&dir, &id)?;
        let path = dir.join(format!("{}.{}", file_id(&id), e.extension));
        if !path.is_file() {
            return Err("本地图片不存在".into());
        }
        #[cfg(target_os = "macos")]
        let status = std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .status();
        #[cfg(target_os = "windows")]
        let status = std::process::Command::new("explorer")
            .arg(format!("/select,{}", path.display()))
            .status();
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let status = std::process::Command::new("xdg-open").arg(&dir).status();
        if status.map_err(|_| "无法打开作品文件夹")?.success() {
            Ok(())
        } else {
            Err("无法打开作品文件夹".into())
        }
    })
    .await
    .map_err(|_| "打开文件夹任务失败")?
}
#[cfg(test)]
mod tests {
    use super::*;
    const SOURCE: &str = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==";
    fn record() -> Record {
        Record {
            id: "generated-one".into(),
            document_id: "doc".into(),
            prompt: "海报".into(),
            model: "image".into(),
            provider: "test".into(),
            size: "1x1".into(),
            created_at: "2026-11-19".into(),
            status: "success".into(),
            favorite: false,
            adopted: false,
            thumbnail: None,
            generation_metadata: None,
            error: None,
        }
    }
    #[test]
    fn persists_optional_generation_metadata_and_reads_legacy_records() {
        let legacy = serde_json::to_value(record()).unwrap();
        assert!(legacy.get("generationMetadata").is_none());
        assert!(serde_json::from_value::<Record>(legacy.clone()).is_ok());
        let mut value = legacy;
        value["error"] = serde_json::json!("局部修改未合成，当前为完整原图");
        value["generationMetadata"] = serde_json::json!({
            "defaults":{"model":"image","size":"1024 × 1024","ratio":"1:1","count":"1 张","strength":"强度 48%"},
            "resolved":{"model":"image","size":"1024 × 1024","ratio":"1:1","count":"2 张","strength":"强度 48%"},
            "overrides":{"count":2},"sent":{"size":"1024x1024"},"operation":"generate"
        });
        let data: Record = serde_json::from_value(value.clone()).unwrap();
        let root = tempfile::tempdir().unwrap();
        save(root.path(), data, SOURCE, None).unwrap();
        let listed = list_records(&[root.path().to_path_buf()]).unwrap();
        assert!(listed[0].generation_metadata.is_some());
        assert_eq!(listed[0].error.as_deref(), Some("局部修改未合成，当前为完整原图"));
        value["generationMetadata"]["apiKey"] = serde_json::json!("must-reject");
        assert!(serde_json::from_value::<Record>(value).is_err());
    }
    #[test]
    fn finds_old_images_after_directory_change_and_deduplicates_saved_records() {
        let app = tempfile::tempdir().unwrap();
        let old = app.path().join("generated-images");
        let next = app.path().join("custom");
        fs::create_dir(&next).unwrap();
        save(&old, record(), SOURCE, None).unwrap();
        super::super::result_library_settings::change(app.path(), Some(&next)).unwrap();
        let roots = super::super::result_library_settings::directories(app.path()).unwrap();
        assert_eq!(find_directory(&roots, "generated-one").unwrap(), old);
        assert_eq!(list_records(&roots).unwrap().len(), 1);
        let mut newer = record();
        newer.id = "new-image".into();
        save_to_directories(&roots, newer, SOURCE, None).unwrap();
        save_to_directories(&roots, record(), SOURCE, Some(true)).unwrap();
        assert!(entry(&old, "generated-one").unwrap().record.favorite);
        assert!(
            !next
                .join(format!("{}.json", file_id("generated-one")))
                .exists()
        );
        assert_eq!(list_records(&roots).unwrap().len(), 2);
        assert!(next.join(format!("{}.png", file_id("new-image"))).is_file());
        assert!(
            old.join(format!("{}.png", file_id("generated-one")))
                .is_file()
        );
        save(&next, record(), SOURCE, None).unwrap();
        assert_eq!(list_records(&roots).unwrap().len(), 2);
        assert_eq!(
            find_directory(&roots, "generated-one").unwrap(),
            fs::canonicalize(next).unwrap()
        );
    }
    #[test]
    fn removing_duplicate_ids_does_not_make_an_old_directory_copy_reappear() {
        let app = tempfile::tempdir().unwrap();
        let first = app.path().join("one");
        let second = app.path().join("two");
        save(&first, record(), SOURCE, None).unwrap();
        save(&second, record(), SOURCE, None).unwrap();
        let roots = vec![first.clone(), second.clone()];
        remove_from_directories(&roots, "generated-one").unwrap();
        assert!(list_records(&roots).unwrap().is_empty());
        assert!(first.join("trash").is_dir());
        assert!(second.join("trash").is_dir());
        assert_eq!(fs::read_dir(first.join("trash")).unwrap().count(), 2);
        assert_eq!(fs::read_dir(second.join("trash")).unwrap().count(), 2);
    }
    #[test]
    fn incomplete_duplicate_cannot_partially_trash_the_valid_original() {
        let app = tempfile::tempdir().unwrap();
        let first = app.path().join("one");
        let second = app.path().join("two");
        save(&first, record(), SOURCE, None).unwrap();
        save(&second, record(), SOURCE, None).unwrap();
        fs::remove_file(second.join(format!("{}.png", file_id("generated-one")))).unwrap();
        assert!(remove_from_directories(&[first.clone(), second], "generated-one").is_err());
        assert!(
            first
                .join(format!("{}.png", file_id("generated-one")))
                .is_file()
        );
        assert!(entry(&first, "generated-one").is_ok());
    }
    #[test]
    fn conflicting_ids_in_different_directories_are_not_trashed() {
        let app = tempfile::tempdir().unwrap();
        let first = app.path().join("one");
        let second = app.path().join("two");
        save(&first, record(), SOURCE, None).unwrap();
        save(&second, record(), SOURCE, None).unwrap();
        let second_image = second.join(format!("{}.png", file_id("generated-one")));
        let mut bytes = fs::read(&second_image).unwrap();
        bytes.push(1);
        fs::write(&second_image, &bytes).unwrap();
        assert!(
            remove_from_directories(&[first.clone(), second.clone()], "generated-one").is_err()
        );
        assert!(entry(&first, "generated-one").is_ok());
        assert!(entry(&second, "generated-one").is_ok());
        assert!(
            first
                .join(format!("{}.png", file_id("generated-one")))
                .is_file()
        );
        assert!(second_image.is_file());
    }
    #[test]
    fn persists_original_bytes_and_metadata_across_reopen() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), record(), SOURCE, None).unwrap();
        let reopened = entry(dir.path(), "generated-one").unwrap();
        assert_eq!(reopened.record.prompt, "海报");
        assert_eq!(
            fs::read(dir.path().join(format!("{}.png", file_id("generated-one")))).unwrap(),
            decode(SOURCE).unwrap().0
        );
        save(dir.path(), record(), SOURCE, None).unwrap();
    }
    #[test]
    fn rejects_paths_remote_urls_and_mismatched_formats() {
        let dir = tempfile::tempdir().unwrap();
        for id in ["../outside", "a/b", "a\\b", ""] {
            let mut r = record();
            r.id = id.into();
            assert!(save(dir.path(), r, SOURCE, None).is_err())
        }
        assert!(save(dir.path(), record(), "https://supplier.test/x.png", None).is_err());
        assert!(
            save(
                dir.path(),
                record(),
                &SOURCE.replace("image/png", "image/jpeg"),
                None
            )
            .is_err()
        );
        assert!(
            !dir.path()
                .join(format!("{}.json", file_id("generated-one")))
                .exists()
        );
    }
    #[test]
    fn document_copies_preserve_origin_and_global_flags_with_windows_safe_names() {
        let dir = tempfile::tempdir().unwrap();
        let mut first = record();
        first.id = "generated:batch:1".into();
        save(dir.path(), first.clone(), SOURCE, None).unwrap();
        let mut copy = first.clone();
        copy.document_id = "new-doc".into();
        copy.adopted = true;
        save(dir.path(), copy.clone(), SOURCE, None).unwrap();
        first.favorite = true;
        save(dir.path(), first.clone(), SOURCE, Some(true)).unwrap();
        save(dir.path(), copy, SOURCE, None).unwrap();
        let saved = entry(dir.path(), &first.id).unwrap().record;
        assert_eq!(saved.document_id, "doc");
        assert!(saved.adopted);
        assert!(saved.favorite);
        save(dir.path(), first.clone(), SOURCE, Some(false)).unwrap();
        let saved = entry(dir.path(), &first.id).unwrap().record;
        assert!(saved.adopted);
        assert!(!saved.favorite);
        assert!(
            dir.path()
                .join(format!("{}.png", file_id(&first.id)))
                .is_file()
        );
    }
}
