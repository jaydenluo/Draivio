//! Bounded native project container. No artwork bytes cross JSON IPC.
use crate::image_resource_store::{
    COPY_BUFFER_BYTES, PreparedBlob, RasterReference, ResourceRoot, ResourceStore, StoredAsset,
    StoredProjectSource,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, HashSet},
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use zip::{CompressionMethod, ZipArchive, ZipWriter, write::SimpleFileOptions};
pub const MAGIC: &[u8; 16] = b"DRAIVIO4\r\n\x1a\n\0\0\0\0";
const MAX_MANIFEST: u64 = 8 * 1024 * 1024;
const MAX_DIRECTORY: u64 = 8 * 1024 * 1024;
const MAX_ENTRIES: usize = 4096;
const MAX_BLOB: u64 = 16 * 1024 * 1024 * 1024;
const MAX_TOTAL: u64 = 64 * 1024 * 1024 * 1024;
type Result<T> = std::result::Result<T, String>;
fn failure<T>(_: T) -> String {
    "项目容器损坏或存储不可用；原文件已保留".into()
}
fn cancelled(cancel: &AtomicBool) -> Result<()> {
    if cancel.load(Ordering::SeqCst) {
        Err("项目操作已取消；原文件已保留".into())
    } else {
        Ok(())
    }
}
fn valid_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
}
fn ref_key(r: &RasterReference) -> String {
    format!("{}:{}", r.asset_id, r.revision)
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SaveRequest {
    pub metadata: Value,
    pub document: Value,
    pub references: Vec<RasterReference>,
    #[serde(default)]
    pub working_diffs: Vec<String>,
    #[serde(default)]
    pub legacy_sources: Vec<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub format: String,
    pub schema_version: u8,
    pub metadata: Value,
    pub document: Value,
    pub assets: Vec<StoredAsset>,
    pub working_diffs: Vec<String>,
    #[serde(default)]
    pub legacy_sources: Vec<StoredProjectSource>,
    pub blobs: BTreeMap<String, u64>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    pub format: String,
    pub schema_version: u8,
    pub metadata: Value,
    pub document: Value,
    pub assets: Vec<StoredAsset>,
    pub working_diffs: Vec<String>,
    pub legacy_sources: BTreeMap<String, String>,
    pub owner_id: String,
}
fn validate_json(value: &Value, depth: usize, refs: &mut HashSet<String>) -> Result<()> {
    if depth > 64 {
        return Err("项目结构嵌套超过限制".into());
    }
    match value {
        Value::String(s) => {
            if s.len() > 1024 * 1024
                || s.starts_with("blob:")
                || s.contains("draivio-image:")
                || s.contains("draivio-image.localhost")
                || s.starts_with("asset:")
            {
                return Err("v4 项目不能包含运行时资源或未迁移的大型内联资源".into());
            }
        }
        Value::Array(a) => {
            if a.len() > 100000 {
                return Err("项目数组超过限制".into());
            }
            for item in a {
                validate_json(item, depth + 1, refs)?;
            }
        }
        Value::Object(o) => {
            for (k, v) in o {
                if ["resourceUrl", "session", "lease", "resourceId"].contains(&k.as_str()) {
                    return Err("项目包含运行时资源权限".into());
                }
                if k == "rasterRef" {
                    let r: RasterReference = serde_json::from_value(v.clone()).map_err(failure)?;
                    if r.asset_id.len() != 48
                        || !r
                            .asset_id
                            .bytes()
                            .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
                        || r.revision == 0
                        || r.revision > 9007199254740991
                        || v.as_object().is_none_or(|o| o.len() != 2)
                    {
                        return Err("项目原件引用无效".into());
                    }
                    refs.insert(ref_key(&r));
                } else {
                    validate_json(v, depth + 1, refs)?;
                }
            }
        }
        _ => {}
    }
    Ok(())
}
fn document_diffs(value: &Value, hashes: &mut HashSet<String>) -> Result<()> {
    match value {
        Value::Object(o) => {
            for (k, v) in o {
                if k == "workingDiffs" {
                    for h in v.as_array().ok_or("差分引用无效")? {
                        let h = h.as_str().filter(|h| valid_hash(h)).ok_or("差分引用无效")?;
                        hashes.insert(h.to_string());
                    }
                } else if k == "workingDiffHash" {
                    hashes.insert(
                        v.as_str()
                            .filter(|h| valid_hash(h))
                            .ok_or("差分引用无效")?
                            .into(),
                    );
                } else {
                    document_diffs(v, hashes)?;
                }
            }
        }
        Value::Array(a) => {
            for v in a {
                document_diffs(v, hashes)?;
            }
        }
        _ => {}
    }
    Ok(())
}
fn validate_document(metadata: &Value, document: &Value) -> Result<HashSet<String>> {
    if !metadata.is_object()
        || metadata
            .get("id")
            .and_then(Value::as_str)
            .is_none_or(|s| s.is_empty() || s.len() > 256)
        || metadata
            .get("name")
            .and_then(Value::as_str)
            .is_none_or(|s| s.is_empty() || s.len() > 1024)
    {
        return Err("项目元数据无效".into());
    }
    if !document.is_object()
        || document
            .get("layers")
            .and_then(Value::as_array)
            .is_none_or(|a| a.len() > 10000)
    {
        return Err("项目文档结构无效".into());
    }
    for k in ["documentWidth", "documentHeight"] {
        if document
            .get(k)
            .and_then(Value::as_u64)
            .is_none_or(|n| n == 0 || n > 16384)
        {
            return Err("项目尺寸无效".into());
        }
    }
    let mut refs = HashSet::new();
    validate_json(metadata, 0, &mut refs)?;
    validate_json(document, 0, &mut refs)?;
    Ok(refs)
}
pub fn is_container(path: &Path) -> Result<bool> {
    let mut file = File::open(path).map_err(failure)?;
    let mut b = [0; 16];
    let count = file.read(&mut b).map_err(failure)?;
    Ok(count == 16 && &b == MAGIC)
}
fn validate_legacy_refs(document: &Value, legacy: &[String]) -> Result<()> {
    let mut sources = HashSet::new();
    fn walk(v: &Value, sources: &mut HashSet<String>) {
        match v {
            Value::String(s) => {
                if let Some(hash) = s.strip_prefix("project-source:") {
                    sources.insert(hash.into());
                }
            }
            Value::Array(a) => {
                for v in a {
                    walk(v, sources);
                }
            }
            Value::Object(o) => {
                for v in o.values() {
                    walk(v, sources);
                }
            }
            _ => {}
        }
    }
    walk(document, &mut sources);
    if legacy.len() != sources.len() || sources != legacy.iter().cloned().collect() {
        return Err("旧资源迁移索引不一致".into());
    }
    Ok(())
}
fn checked_manifest(m: &Manifest) -> Result<()> {
    if m.format != "draivio" || m.schema_version != 4 {
        return Err("项目容器版本不受支持，请更新应用".into());
    }
    let refs = validate_document(&m.metadata, &m.document)?;
    validate_legacy_refs(
        &m.document,
        &m.legacy_sources
            .iter()
            .map(|s| s.hash.clone())
            .collect::<Vec<_>>(),
    )?;
    let mut actual = HashSet::new();
    let mut required = HashSet::new();
    for asset in &m.assets {
        if !actual.insert(ref_key(&asset.reference)) {
            return Err("项目原件身份重复".into());
        }
        asset.metadata.validate().map_err(failure)?;
        if !valid_hash(&asset.original_hash)
            || m.blobs.get(&asset.original_hash) != Some(&asset.byte_length)
            || asset.profile_hash != asset.metadata.profile_hash
        {
            return Err("项目原件索引无效".into());
        }
        required.insert(asset.original_hash.clone());
        if let Some(h) = &asset.profile_hash {
            if !valid_hash(h) || m.blobs.get(h).is_none_or(|n| *n > 16 * 1024 * 1024) {
                return Err("项目 ICC 索引无效".into());
            }
            required.insert(h.clone());
        }
    }
    if refs != actual {
        return Err("项目原件缺失或存在多余身份".into());
    }
    let mut document_hashes = HashSet::new();
    document_diffs(&m.document, &mut document_hashes)?;
    if document_hashes != m.working_diffs.iter().cloned().collect() {
        return Err("项目必需差分引用与索引不一致".into());
    }
    let mut legacy_bytes = 0u64;
    for source in &m.legacy_sources {
        if !valid_hash(&source.hash)
            || m.blobs.get(&source.hash) != Some(&source.byte_length)
            || !source.mime.starts_with("image/")
        {
            return Err("旧资源索引无效".into());
        }
        required.insert(source.hash.clone());
        legacy_bytes += source.byte_length;
    }
    if legacy_bytes > 16 * 1024 * 1024 {
        return Err("旧资源迁移超过 16 MiB 兼容预算".into());
    }
    let mut diffs = HashSet::new();
    for h in &m.working_diffs {
        if !valid_hash(h) || !diffs.insert(h) || !m.blobs.contains_key(h) {
            return Err("项目差分索引无效".into());
        }
        required.insert(h.clone());
    }
    if required != m.blobs.keys().cloned().collect() {
        return Err("项目存在未声明资源".into());
    }
    let mut total = 0u64;
    for (h, n) in &m.blobs {
        if !valid_hash(h) || *n == 0 || *n > MAX_BLOB {
            return Err("项目资源超出限制".into());
        }
        total = total.checked_add(*n).ok_or("项目资源超出限制")?;
    }
    if total > MAX_TOTAL || m.blobs.len() + 1 > MAX_ENTRIES {
        return Err("项目资源超出限制".into());
    }
    Ok(())
}
pub fn save(
    path: &Path,
    store: &Arc<ResourceStore>,
    request: &SaveRequest,
    cancel: &AtomicBool,
) -> Result<()> {
    cancelled(cancel)?;
    let refs = validate_document(&request.metadata, &request.document)?;
    validate_legacy_refs(&request.document, &request.legacy_sources)?;
    if request.references.len() > MAX_ENTRIES || request.working_diffs.len() > MAX_ENTRIES {
        return Err("项目资源数量超出限制".into());
    }
    let mut assets = Vec::new();
    let mut leases = Vec::new();
    let mut blobs = BTreeMap::new();
    let mut actual = HashSet::new();
    for reference in &request.references {
        if !actual.insert(ref_key(reference)) {
            return Err("项目原件身份重复".into());
        }
        let (asset, lease) = store.lease_asset(reference).map_err(failure)?;
        blobs.insert(asset.original_hash.clone(), asset.byte_length);
        if let Some(h) = &asset.profile_hash {
            blobs.insert(
                h.clone(),
                std::fs::metadata(store.blob_path(h).map_err(failure)?)
                    .map_err(failure)?
                    .len(),
            );
        }
        assets.push(asset);
        leases.push(lease);
    }
    if refs != actual {
        return Err("项目引用与资源索引不一致".into());
    }
    let (diffs, _diff_lease) = store
        .lease_working_diffs(&request.working_diffs)
        .map_err(failure)?;
    for (h, n) in diffs {
        blobs.insert(h, n);
    }
    let (legacy_sources, _source_lease) = store
        .lease_project_sources(&request.legacy_sources)
        .map_err(failure)?;
    for source in &legacy_sources {
        blobs.insert(source.hash.clone(), source.byte_length);
    }
    let manifest = Manifest {
        format: "draivio".into(),
        schema_version: 4,
        metadata: request.metadata.clone(),
        document: request.document.clone(),
        assets,
        working_diffs: request.working_diffs.clone(),
        legacy_sources,
        blobs,
    };
    checked_manifest(&manifest)?;
    let json = serde_json::to_vec(&manifest).map_err(failure)?;
    if json.len() as u64 > MAX_MANIFEST {
        return Err("项目清单超过 8 MiB 限制".into());
    }
    let parent = path.parent().ok_or("保存位置无效")?;
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(failure)?;
    temp.write_all(MAGIC).map_err(failure)?;
    {
        let mut zip = ZipWriter::new(temp.as_file_mut());
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .large_file(true)
            .unix_permissions(0o600);
        zip.start_file("manifest.json", options).map_err(failure)?;
        zip.write_all(&json).map_err(failure)?;
        let mut buffer = vec![0; COPY_BUFFER_BYTES];
        for (hash, expected) in &manifest.blobs {
            cancelled(cancel)?;
            zip.start_file(format!("blobs/{hash}"), options)
                .map_err(failure)?;
            let mut input = File::open(store.blob_path(hash).map_err(failure)?).map_err(failure)?;
            let mut bytes = 0u64;
            let mut sha = Sha256::new();
            loop {
                cancelled(cancel)?;
                let n = input.read(&mut buffer).map_err(failure)?;
                if n == 0 {
                    break;
                }
                bytes += n as u64;
                if bytes > *expected {
                    return Err("原件在保存时发生变化".into());
                }
                sha.update(&buffer[..n]);
                zip.write_all(&buffer[..n]).map_err(failure)?;
            }
            if bytes != *expected || format!("{:x}", sha.finalize()) != *hash {
                return Err("原件哈希校验失败；原文件已保留".into());
            }
        }
        zip.finish().map_err(failure)?;
    }
    cancelled(cancel)?;
    temp.as_file().sync_all().map_err(failure)?;
    cancelled(cancel)?;
    temp.persist(path).map_err(failure)?;
    #[cfg(unix)]
    File::open(parent)
        .and_then(|f| f.sync_all())
        .map_err(|_| "项目已原子替换，但目录持久化未确认；请保留当前文档并重新保存".to_string())?;
    drop(leases);
    Ok(())
}
// Bound central-directory allocation *before* ZipArchive parses any names or extras.
// v4 emits ZIP64 entry headers; its directory is small enough for classic EOCD.
fn preflight(file: &mut File) -> Result<()> {
    let len = file.metadata().map_err(failure)?.len();
    if len < 38 || len > MAX_TOTAL + MAX_DIRECTORY + MAX_MANIFEST {
        return Err("项目文件长度超过限制".into());
    }
    let mut magic = [0; 16];
    file.read_exact(&mut magic).map_err(failure)?;
    if &magic != MAGIC {
        return Err("不是 v4 项目容器".into());
    }
    let mut end = [0; 22];
    file.seek(SeekFrom::End(-22)).map_err(failure)?;
    file.read_exact(&mut end).map_err(failure)?;
    if &end[..4] != b"PK\x05\x06" || end[4..8] != [0; 4] || end[20..22] != [0; 2] {
        return Err("项目目录结构无效".into());
    }
    let count = u16::from_le_bytes([end[10], end[11]]) as usize;
    let size = u32::from_le_bytes(end[12..16].try_into().unwrap()) as u64;
    let offset = u32::from_le_bytes(end[16..20].try_into().unwrap()) as u64;
    if count == 0 || count > MAX_ENTRIES || size > MAX_DIRECTORY || end[8..10] != end[10..12] {
        return Err("项目目录超过限制".into());
    }
    // Beyond 4GiB the EOCD offset uses a ZIP64 locator/end record; inspect its
    // fixed fields without loading the directory or trusting claimed allocation.
    if offset == u32::MAX as u64 || size == u32::MAX as u64 || count == u16::MAX as usize {
        file.seek(SeekFrom::End(-42)).map_err(failure)?;
        let mut locator = [0; 20];
        file.read_exact(&mut locator).map_err(failure)?;
        if &locator[..4] != b"PK\x06\x07"
            || locator[4..8] != [0; 4]
            || u32::from_le_bytes(locator[16..20].try_into().unwrap()) != 1
        {
            return Err("ZIP64 目录无效".into());
        }
        let at = u64::from_le_bytes(locator[8..16].try_into().unwrap());
        if at > len.saturating_sub(98) {
            return Err("ZIP64 偏移无效".into());
        }
        file.seek(SeekFrom::Start(at)).map_err(failure)?;
        let mut z = [0; 56];
        file.read_exact(&mut z).map_err(failure)?;
        let count = u64::from_le_bytes(z[32..40].try_into().unwrap());
        let size = u64::from_le_bytes(z[40..48].try_into().unwrap());
        let offset = u64::from_le_bytes(z[48..56].try_into().unwrap());
        if &z[..4] != b"PK\x06\x06"
            || u64::from_le_bytes(z[4..12].try_into().unwrap()) != 44
            || z[16..24] != [0; 8]
            || z[24..32] != z[32..40]
            || count > MAX_ENTRIES as u64
            || size > MAX_DIRECTORY
            || offset.checked_add(size) != Some(at)
        {
            return Err("ZIP64 目录超过限制".into());
        }
    } else if offset.checked_add(size) != Some(len - 22) {
        return Err("项目目录偏移无效".into());
    }
    file.seek(SeekFrom::Start(0)).map_err(failure)?;
    Ok(())
}
pub fn release(store: &ResourceStore, owner: &str) -> Result<()> {
    let root = ResourceRoot {
        kind: "project".into(),
        id: owner.into(),
    };
    store.replace_root(&root, &[]).map_err(failure)?;
    store.replace_blob_root(&root, &[]).map_err(failure)
}
pub fn open(
    path: &Path,
    store: &Arc<ResourceStore>,
    owner: &str,
    cancel: &AtomicBool,
) -> Result<Opened> {
    open_verified(path, store, owner, cancel, |_, _| Ok(()))
}
pub fn open_verified(
    path: &Path,
    store: &Arc<ResourceStore>,
    owner: &str,
    cancel: &AtomicBool,
    mut verify: impl FnMut(&StoredAsset, &Path) -> Result<()>,
) -> Result<Opened> {
    cancelled(cancel)?;
    let mut file = File::open(path).map_err(failure)?;
    preflight(&mut file)?;
    let mut zip = ZipArchive::new(file).map_err(failure)?;
    if zip.has_duplicate_names() || zip.len() > MAX_ENTRIES {
        return Err("项目资源数量超过限制".into());
    }
    let mut entries = BTreeMap::new();
    let mut total = 0u64;
    for i in 0..zip.len() {
        let entry = zip.by_index(i).map_err(failure)?;
        let name = std::str::from_utf8(entry.name_raw())
            .map_err(failure)?
            .to_string();
        if name != "manifest.json"
            && !(name.len() == 70 && name.starts_with("blobs/") && valid_hash(&name[6..]))
        {
            return Err("项目资源路径无效".into());
        }
        if entry.is_symlink()
            || entry.is_dir()
            || entry.compression() != CompressionMethod::Stored
            || entry.size() != entry.compressed_size()
            || entry.size() > MAX_BLOB
            || entries.insert(name, entry.size()).is_some()
        {
            return Err("项目资源重复、压缩类型或大小无效".into());
        }
        total = total.checked_add(entry.size()).ok_or("项目资源超出限制")?;
        if total > MAX_TOTAL + MAX_MANIFEST {
            return Err("项目资源总量超出限制".into());
        }
    }
    let size = *entries.get("manifest.json").ok_or("项目清单缺失")?;
    if size > MAX_MANIFEST {
        return Err("项目清单过大".into());
    }
    let mut json = Vec::with_capacity(size as usize);
    zip.by_name("manifest.json")
        .map_err(failure)?
        .take(MAX_MANIFEST + 1)
        .read_to_end(&mut json)
        .map_err(failure)?;
    let manifest: Manifest = serde_json::from_slice(&json).map_err(failure)?;
    checked_manifest(&manifest)?;
    if entries.len() != manifest.blobs.len() + 1
        || manifest
            .blobs
            .iter()
            .any(|(h, n)| entries.get(&format!("blobs/{h}")) != Some(n))
    {
        return Err("项目资源缺失或存在多余条目".into());
    }
    let mut prepared = BTreeMap::<String, PreparedBlob>::new();
    for (hash, n) in &manifest.blobs {
        cancelled(cancel)?;
        let mut entry = zip.by_name(&format!("blobs/{hash}")).map_err(failure)?;
        let blob = store
            .prepare_reader(&mut entry, *n, cancel)
            .map_err(failure)?;
        if blob.hash != *hash {
            return Err("项目资源 SHA-256 校验失败".into());
        }
        prepared.insert(hash.clone(), blob);
    }
    // All entries have reached EOF (and passed ZIP CRC + SHA) before any roots
    // become visible. Duplicated content is staged again from its verified blob.
    for asset in &manifest.assets {
        verify(
            asset,
            &prepared
                .get(&asset.original_hash)
                .ok_or("项目原件缺失")?
                .path,
        )?;
    }
    let mut legacy_sources = BTreeMap::new();
    for source in &manifest.legacy_sources {
        use base64::Engine;
        let mut bytes = Vec::with_capacity(source.byte_length as usize);
        File::open(&prepared.get(&source.hash).ok_or("旧资源缺失")?.path)
            .map_err(failure)?
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(failure)?;
        legacy_sources.insert(
            source.hash.clone(),
            format!(
                "data:{};base64,{}",
                source.mime,
                base64::engine::general_purpose::STANDARD.encode(bytes)
            ),
        );
    }
    let root = ResourceRoot {
        kind: "project".into(),
        id: owner.into(),
    };
    let publish = (|| -> Result<()> {
        for asset in &manifest.assets {
            let original = prepared.get(&asset.original_hash).ok_or("项目原件缺失")?;
            let original = store
                .prepare(
                    &original.path,
                    cancel,
                    std::time::Duration::from_secs(600),
                    || Ok(()),
                )
                .map_err(failure)?;
            let profile = if let Some(h) = &asset.profile_hash {
                let p = prepared.get(h).ok_or("项目ICC缺失")?;
                Some(
                    store
                        .prepare(&p.path, cancel, std::time::Duration::from_secs(600), || {
                            Ok(())
                        })
                        .map_err(failure)?,
                )
            } else {
                None
            };
            store
                .commit_original(
                    asset.reference.clone(),
                    asset.metadata.clone(),
                    original,
                    profile,
                    root.clone(),
                    cancel,
                )
                .map_err(failure)?;
        }
        for source in &manifest.legacy_sources {
            let p = prepared.get(&source.hash).ok_or("旧资源缺失")?;
            let blob = store
                .prepare(&p.path, cancel, std::time::Duration::from_secs(60), || {
                    Ok(())
                })
                .map_err(failure)?;
            store
                .commit_project_source(blob, source.mime.clone(), &root)
                .map_err(failure)?;
        }
        for h in &manifest.working_diffs {
            cancelled(cancel)?;
            let p = prepared.get(h).ok_or("项目差分缺失")?;
            let blob = store
                .prepare(&p.path, cancel, std::time::Duration::from_secs(600), || {
                    Ok(())
                })
                .map_err(failure)?;
            store.commit_working_diff(blob, &root).map_err(failure)?;
        }
        cancelled(cancel)?;
        Ok(())
    })();
    if let Err(error) = publish {
        let _ = release(store, owner);
        return Err(error);
    }
    Ok(Opened {
        format: manifest.format,
        schema_version: 4,
        metadata: manifest.metadata,
        document: manifest.document,
        assets: manifest.assets,
        working_diffs: manifest.working_diffs,
        legacy_sources,
        owner_id: owner.into(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::image_assets::Metadata;
    use crate::image_resource_store::{RasterReference, ResourceRoot};
    use std::{
        sync::{Arc, atomic::AtomicBool},
        time::Duration,
    };
    fn asset(store: &Arc<ResourceStore>, dir: &Path, size: usize) -> StoredAsset {
        let path = dir.join("original.bin");
        let mut file = std::fs::File::create(&path).unwrap();
        let block = vec![37; 256 * 1024];
        for _ in 0..size {
            std::io::Write::write_all(&mut file, &block).unwrap();
        }
        let cancel = AtomicBool::new(false);
        let blob = store
            .prepare(&path, &cancel, Duration::from_secs(60), || Ok(()))
            .unwrap();
        store
            .commit_original(
                RasterReference {
                    asset_id: "a".repeat(48),
                    revision: 1,
                },
                Metadata {
                    width: 100,
                    height: 100,
                    bands: 4,
                    sample_type: "u8".into(),
                    orientation: 1,
                    pages: 1,
                    format: "png".into(),
                    editing_supported: true,
                    profile_hash: None,
                },
                blob,
                None,
                ResourceRoot {
                    kind: "document".into(),
                    id: "test".into(),
                },
                &cancel,
            )
            .unwrap()
    }
    #[test]
    fn streams_registered_original_and_diff_into_independent_store() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("source-store")).unwrap());
        let original = asset(&store, dir.path(), 2);
        let diff_path = dir.path().join("diff");
        std::fs::write(&diff_path, b"actual edit pixels").unwrap();
        let cancel = AtomicBool::new(false);
        let diff = store
            .prepare(&diff_path, &cancel, Duration::from_secs(10), || Ok(()))
            .unwrap();
        let hash = store
            .commit_working_diff(
                diff,
                &ResourceRoot {
                    kind: "document".into(),
                    id: "test".into(),
                },
            )
            .unwrap();
        let request = SaveRequest {
            metadata: serde_json::json!({"id":"test","name":"roundtrip"}),
            document: serde_json::json!({"documentWidth":100,"documentHeight":100,"layers":[{"rasterRef": original.reference}],"workingDiffs":[hash]}),
            references: vec![original.reference.clone()],
            working_diffs: vec![hash.clone()],
            legacy_sources: vec![],
        };
        let path = dir.path().join("test.draivio");
        save(&path, &store, &request, &cancel).unwrap();
        assert!(is_container(&path).unwrap());
        let target = Arc::new(ResourceStore::open(dir.path().join("target-store")).unwrap());
        let opened = open(&path, &target, "opened", &cancel).unwrap();
        assert_eq!(opened.assets[0].original_hash, original.original_hash);
        let restored = target.resolve(&original.reference).unwrap();
        target
            .verify_blob(&restored.original_hash, original.byte_length)
            .unwrap();
        assert_eq!(
            std::fs::read(target.blob_path(&hash).unwrap()).unwrap(),
            b"actual edit pixels"
        );
        assert_eq!(opened.document, request.document);
        assert!(target.collect_unrooted().unwrap() == 0);
    }
    #[test]
    fn cancelled_save_preserves_previous_file_and_unregistered_diff_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let path = dir.path().join("old.draivio");
        std::fs::write(&path, b"old").unwrap();
        let mut request = SaveRequest {
            metadata: serde_json::json!({"id":"x","name":"x"}),
            document: serde_json::json!({"documentWidth":1,"documentHeight":1,"layers":[]}),
            references: vec![],
            working_diffs: vec![],
            legacy_sources: vec![],
        };
        assert!(save(&path, &store, &request, &AtomicBool::new(true)).is_err());
        request.working_diffs.push("c".repeat(64));
        assert!(save(&path, &store, &request, &AtomicBool::new(false)).is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"old");
    }
    fn empty_manifest() -> Manifest {
        Manifest {
            format: "draivio".into(),
            schema_version: 4,
            metadata: serde_json::json!({"id":"x","name":"x"}),
            document: serde_json::json!({"documentWidth":1,"documentHeight":1,"layers":[]}),
            assets: vec![],
            working_diffs: vec![],
            legacy_sources: vec![],
            blobs: BTreeMap::new(),
        }
    }
    fn archive(path: &Path, manifest: &Manifest, extras: &[(&str, &[u8])]) {
        let mut file = File::create(path).unwrap();
        file.write_all(MAGIC).unwrap();
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .large_file(true);
        zip.start_file("manifest.json", options).unwrap();
        zip.write_all(&serde_json::to_vec(manifest).unwrap())
            .unwrap();
        for (name, bytes) in extras {
            zip.start_file(*name, options).unwrap();
            zip.write_all(bytes).unwrap();
        }
        zip.finish().unwrap();
    }
    #[test]
    fn rejects_traversal_missing_extra_resources_and_bad_manifest_without_roots() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let path = dir.path().join("bad.draivio");
        let cancel = AtomicBool::new(false);
        let mut m = empty_manifest();
        archive(&path, &m, &[("../outside", b"bad")]);
        assert!(open(&path, &store, "malicious", &cancel).is_err());
        archive(
            &path,
            &m,
            &[(&format!("blobs/{}", "a".repeat(64)), b"unindexed")],
        );
        assert!(open(&path, &store, "malicious", &cancel).is_err());
        m.working_diffs.push("a".repeat(64));
        m.document["workingDiffs"] = serde_json::json!(["a".repeat(64)]);
        m.blobs.insert("a".repeat(64), 1);
        archive(&path, &m, &[]);
        assert!(open(&path, &store, "malicious", &cancel).is_err());
        m.schema_version = 5;
        archive(&path, &m, &[]);
        assert!(
            open(&path, &store, "malicious", &cancel)
                .unwrap_err()
                .contains("版本")
        );
        assert_eq!(store.collect_unrooted().unwrap(), 0);
    }
    #[test]
    fn rejects_sha_crc_symlink_and_unbounded_directory() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let path = dir.path().join("bad.draivio");
        let cancel = AtomicBool::new(false);
        let mut m = empty_manifest();
        let hash = format!("{:x}", Sha256::digest(b"good"));
        m.working_diffs.push(hash.clone());
        m.document["workingDiffs"] = serde_json::json!([hash]);
        m.blobs.insert(hash.clone(), 4);
        archive(&path, &m, &[(&format!("blobs/{hash}"), b"evil")]);
        assert!(
            open(&path, &store, "malicious", &cancel)
                .unwrap_err()
                .contains("SHA")
        );
        archive(&path, &m, &[(&format!("blobs/{hash}"), b"good")]);
        let mut zip = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        let start = zip
            .by_name(&format!("blobs/{hash}"))
            .unwrap()
            .data_start()
            .unwrap();
        drop(zip);
        let mut file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.seek(SeekFrom::Start(start)).unwrap();
        file.write_all(b"evil").unwrap();
        drop(file);
        assert!(open(&path, &store, "malicious", &cancel).is_err());
        archive(&path, &empty_manifest(), &[]);
        let mut file = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
        file.seek(SeekFrom::End(-12)).unwrap();
        file.write_all(&5000u16.to_le_bytes()).unwrap();
        drop(file);
        assert!(open(&path, &store, "malicious", &cancel).is_err());
        let mut file = File::create(&path).unwrap();
        file.write_all(MAGIC).unwrap();
        let mut zip = ZipWriter::new(file);
        zip.add_symlink("manifest.json", "elsewhere", SimpleFileOptions::default())
            .unwrap();
        zip.finish().unwrap();
        assert!(open(&path, &store, "malicious", &cancel).is_err());
    }
    #[test]
    fn omitted_required_diff_and_inline_runtime_url_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let path = dir.path().join("bad.draivio");
        let mut request = SaveRequest {
            metadata: serde_json::json!({"id":"x","name":"x"}),
            document: serde_json::json!({"documentWidth":1,"documentHeight":1,"layers":[],"workingDiffs":["a".repeat(64)]}),
            references: vec![],
            working_diffs: vec![],
            legacy_sources: vec![],
        };
        assert!(save(&path, &store, &request, &AtomicBool::new(false)).is_err());
        request.document = serde_json::json!({"documentWidth":1,"documentHeight":1,"layers":[{"source":"blob:runtime"}]});
        assert!(save(&path, &store, &request, &AtomicBool::new(false)).is_err());
    }
    fn worker() -> crate::image_assets::ImageAssets {
        let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let path = if root.join("image-worker/bin/draivio-image-worker").exists() {
            root.join("image-worker/bin/draivio-image-worker")
        } else {
            root.join("../bin/draivio-image-worker")
        };
        crate::image_assets::ImageAssets::new(Some(path.canonicalize().unwrap())).unwrap()
    }
    fn registered_fixture(service: &crate::image_assets::ImageAssets, name: &str) -> StoredAsset {
        let asset = service
            .import(Path::new("/tmp/draivio-large-images").join(name))
            .unwrap();
        let started = service
            .start(&asset.asset_id, 1, &asset.lease, "original", 1024, 120000)
            .unwrap();
        loop {
            let job = service.job(&started.job_id).unwrap();
            if job.phase == "ready" {
                break;
            }
            assert!(
                job.phase == "queued" || job.phase == "running",
                "{:?}",
                job.error
            );
            std::thread::sleep(Duration::from_millis(5));
        }
        let asset = service.asset(&asset.asset_id, 1, &asset.lease).unwrap();
        let reference = asset.raster_ref.unwrap();
        let store = service.project_store();
        store
            .claim_import(
                &ResourceRoot {
                    kind: "document".into(),
                    id: "fixture".into(),
                },
                &reference,
            )
            .unwrap();
        let stored = store.resolve(&reference).unwrap();
        service.dispose(&asset.asset_id, &asset.lease).unwrap();
        stored
    }
    #[test]
    #[ignore = "explicit generated alpha/ICC fixture and real worker verification"]
    fn real_alpha_icc_and_legacy_webp_roundtrip_reprobe_and_preserve_bytes() {
        use base64::Engine;
        let service = worker();
        let store = service.project_store();
        let alpha = registered_fixture(&service, "odd-alpha.png");
        let icc = registered_fixture(&service, "baseline-icc-exif.jpg");
        let dir = tempfile::tempdir().unwrap();
        let source_path = Path::new("/tmp/draivio-large-images/odd-alpha.png");
        let source = format!(
            "data:image/png;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(std::fs::read(source_path).unwrap())
        );
        let inline = service
            .register_project_inline(&source, "save:legacy")
            .unwrap();
        let encoded = "data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAkAAEAdQqDJUsD+BiOh/AAA=";
        let webp = service
            .register_project_inline(encoded, "save:webp")
            .unwrap();
        let request = SaveRequest {
            metadata: serde_json::json!({"id":"real","name":"real"}),
            document: serde_json::json!({"documentWidth":1024,"documentHeight":1024,"layers":[{"rasterRef":alpha.reference,"opacity":43},{"rasterRef":icc.reference,"transform":{"rotation":37}}],"snapshot":{"source":format!("project-source:{}",inline.hash)},"webpSnapshot":{"source":format!("project-source:{}",webp.hash)}}),
            references: vec![alpha.reference.clone(), icc.reference.clone()],
            working_diffs: vec![],
            legacy_sources: vec![inline.hash.clone(), webp.hash.clone()],
        };
        let path = dir.path().join("real.draivio");
        let cancel = AtomicBool::new(false);
        save(&path, &store, &request, &cancel).unwrap();
        let target = Arc::new(ResourceStore::open(dir.path().join("target")).unwrap());
        let opened = open_verified(&path, &target, "opened-real", &cancel, |asset, p| {
            service
                .verify_project_asset(asset, p, &cancel)
                .map_err(|e| e.code)
        })
        .unwrap();
        assert_eq!(opened.document, request.document);
        assert_eq!(opened.legacy_sources[&inline.hash], source);
        assert_eq!(
            target.resolve(&alpha.reference).unwrap().original_hash,
            "34cb8d55c122640a29f2ca462838b5d37dc7d778ede21a376c767bc4dd0406dd"
        );
        assert_eq!(
            target.resolve(&icc.reference).unwrap().profile_hash,
            icc.profile_hash
        );
        assert_eq!(icc.metadata.orientation, 6);
        assert!(icc.profile_hash.is_some());
        assert_eq!(alpha.metadata.bands, 4);
        // Source signatures are rechecked on restore, including legacy formats
        // outside the native raster decoder enum.
        assert_eq!(opened.legacy_sources[&webp.hash], encoded);
        let decoded=std::process::Command::new("python3").arg("-c").arg(r#"import sys,hashlib,json
from PIL import Image,ImageOps
results=[]
for source,target in [(sys.argv[1],sys.argv[2]),(sys.argv[3],sys.argv[4])]:
 a,b=Image.open(source),Image.open(target)
 assert a.size==b.size and a.mode==b.mode
 assert ImageOps.exif_transpose(a).tobytes()==ImageOps.exif_transpose(b).tobytes()
 assert a.info.get('icc_profile')==b.info.get('icc_profile')
 results.append({'size':a.size,'mode':a.mode,'decodedSHA256':hashlib.sha256(a.tobytes()).hexdigest(),'iccSHA256':hashlib.sha256(a.info.get('icc_profile',b'')).hexdigest()})
w=Image.open(sys.argv[5]).convert('RGBA');assert w.size==(3,2) and set(w.getdata())=={(12,80,130,63)}
print(json.dumps(results))"#).arg("/tmp/draivio-large-images/odd-alpha.png").arg(target.blob_path(&alpha.original_hash).unwrap()).arg("/tmp/draivio-large-images/baseline-icc-exif.jpg").arg(target.blob_path(&icc.original_hash).unwrap()).arg(target.blob_path(&webp.hash).unwrap()).output().unwrap();
        assert!(
            decoded.status.success(),
            "{}",
            String::from_utf8_lossy(&decoded.stderr)
        );
        println!(
            "independent Pillow decoded pixels/ICC: {}",
            String::from_utf8_lossy(&decoded.stdout)
        );
        let wrong = source.replacen("image/png", "image/webp", 1);
        assert!(
            service
                .register_project_inline(&wrong, "save:wrong")
                .is_err()
        );
        let mut bad = ZipArchive::new(File::open(&path).unwrap()).unwrap();
        let mut manifest: Manifest = {
            let mut bytes = Vec::new();
            bad.by_name("manifest.json")
                .unwrap()
                .read_to_end(&mut bytes)
                .unwrap();
            serde_json::from_slice(&bytes).unwrap()
        };
        drop(bad);
        manifest.assets[0].metadata.width += 1;
        let mut extras = Vec::new();
        for (hash, _) in &manifest.blobs {
            extras.push((
                format!("blobs/{hash}"),
                std::fs::read(store.blob_path(hash).unwrap()).unwrap(),
            ));
        }
        let slices: Vec<_> = extras
            .iter()
            .map(|(n, b)| (n.as_str(), b.as_slice()))
            .collect();
        archive(&path, &manifest, &slices);
        let fresh = Arc::new(ResourceStore::open(dir.path().join("fresh")).unwrap());
        assert!(
            open_verified(&path, &fresh, "forged", &cancel, |asset, p| service
                .verify_project_asset(asset, p, &cancel)
                .map_err(|e| e.code))
            .is_err()
        );
        assert_eq!(fresh.collect_unrooted().unwrap(), 0);
    }
    #[test]
    fn original_and_diff_can_share_content_identity_without_losing_roles() {
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let original = asset(&store, dir.path(), 1);
        let cancel = AtomicBool::new(false);
        let prepared = store
            .prepare(
                &store.blob_path(&original.original_hash).unwrap(),
                &cancel,
                Duration::from_secs(10),
                || Ok(()),
            )
            .unwrap();
        store
            .commit_working_diff(
                prepared,
                &ResourceRoot {
                    kind: "document".into(),
                    id: "diff".into(),
                },
            )
            .unwrap();
        assert!(
            store
                .lease_working_diffs(&[original.original_hash.clone()])
                .is_ok()
        );
    }
    #[test]
    fn duplicate_directory_names_and_compressed_entries_are_rejected_before_payload_restore() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("bad.draivio");
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let a = format!("blobs/{}", "a".repeat(64));
        let b = format!("blobs/{}", "b".repeat(64));
        archive(&path, &empty_manifest(), &[(&a, b"one"), (&b, b"two")]);
        let mut bytes = std::fs::read(&path).unwrap();
        let mut at = 0;
        while at + a.len() <= bytes.len() {
            if &bytes[at..at + b.len()] == b.as_bytes() {
                bytes[at..at + b.len()].copy_from_slice(a.as_bytes());
                at += b.len();
            } else {
                at += 1;
            }
        }
        std::fs::write(&path, &bytes).unwrap();
        assert!(
            ZipArchive::new(File::open(&path).unwrap())
                .unwrap()
                .has_duplicate_names()
        );
        assert!(open(&path, &store, "duplicate", &AtomicBool::new(false)).is_err());
        archive(&path, &empty_manifest(), &[]);
        let mut bytes = std::fs::read(&path).unwrap();
        let central = bytes.windows(4).position(|b| b == b"PK\x01\x02").unwrap();
        bytes[central + 10..central + 12].copy_from_slice(&8u16.to_le_bytes());
        std::fs::write(&path, bytes).unwrap();
        assert!(open(&path, &store, "compressed", &AtomicBool::new(false)).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn real_directory_permission_failure_preserves_previous_project() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(dir.path().join("store")).unwrap());
        let parent = dir.path().join("read-only");
        std::fs::create_dir(&parent).unwrap();
        let path = parent.join("old.draivio");
        std::fs::write(&path, b"old project").unwrap();
        let m = empty_manifest();
        let request = SaveRequest {
            metadata: m.metadata,
            document: m.document,
            references: vec![],
            working_diffs: vec![],
            legacy_sources: vec![],
        };
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o555)).unwrap();
        let result = save(&path, &store, &request, &AtomicBool::new(false));
        std::fs::set_permissions(&parent, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert!(result.is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"old project");
    }
    #[test]
    #[ignore = "explicit real 200MB fixture and >256MiB roundtrip/cancellation evidence"]
    fn real_200mb_original_and_80mib_diff_cross_256mib_and_cancel_mid_write() {
        let service = worker();
        let store = service.project_store();
        let original = registered_fixture(&service, "200mb-gray.tiff");
        let alpha = registered_fixture(&service, "odd-alpha.png");
        let dir = tempfile::tempdir().unwrap();
        let diff_path = dir.path().join("working.rgba");
        let mut diff = File::create(&diff_path).unwrap();
        let block: Vec<u8> = (0..COPY_BUFFER_BYTES).map(|i| (i % 251) as u8).collect();
        for _ in 0..320 {
            diff.write_all(&block).unwrap();
        }
        drop(diff);
        let cancel = AtomicBool::new(false);
        let prepared = store
            .prepare(&diff_path, &cancel, Duration::from_secs(120), || Ok(()))
            .unwrap();
        let hash = store
            .commit_working_diff(
                prepared,
                &ResourceRoot {
                    kind: "document".into(),
                    id: "large-diff".into(),
                },
            )
            .unwrap();
        let request = SaveRequest {
            metadata: serde_json::json!({"id":"large","name":"large"}),
            document: serde_json::json!({"documentWidth":10000,"documentHeight":10000,"layers":[{"rasterRef":original.reference},{"rasterRef":alpha.reference}],"workingDiffHash":hash}),
            references: vec![original.reference.clone(), alpha.reference.clone()],
            working_diffs: vec![hash.clone()],
            legacy_sources: vec![],
        };
        let path = dir.path().join("large.draivio");
        save(&path, &store, &request, &cancel).unwrap();
        let bytes = std::fs::metadata(&path).unwrap().len();
        assert!(bytes > 256 * 1024 * 1024);
        println!(
            "real container bytes={bytes}; original bytes={}; diff bytes={}",
            original.byte_length,
            std::fs::metadata(&diff_path).unwrap().len()
        );
        let target = Arc::new(ResourceStore::open(dir.path().join("target")).unwrap());
        open_verified(&path, &target, "large-open", &cancel, |asset, p| {
            service
                .verify_project_asset(asset, p, &cancel)
                .map_err(|e| e.code)
        })
        .unwrap();
        assert_eq!(
            target.resolve(&original.reference).unwrap().original_hash,
            "9fec1b83e28cd05088086835745db990bf7f0b17abe943fb67ea26fc03db414f"
        );
        target.verify_blob(&hash, 80 * 1024 * 1024).unwrap();
        let old = dir.path().join("old.draivio");
        std::fs::write(&old, b"previous project survives").unwrap();
        let save_dir = dir.path().to_owned();
        std::thread::scope(|scope| {
            scope.spawn(|| {
                let start = std::time::Instant::now();
                loop {
                    if std::fs::read_dir(&save_dir)
                        .unwrap()
                        .filter_map(|e| e.ok())
                        .any(|e| {
                            e.file_name().to_string_lossy().starts_with(".tmp")
                                && e.metadata().is_ok_and(|m| m.len() > 1024 * 1024)
                        })
                    {
                        cancel.store(true, Ordering::SeqCst);
                        break;
                    }
                    assert!(
                        start.elapsed() < Duration::from_secs(20),
                        "save never reached streaming write"
                    );
                    std::thread::yield_now();
                }
            });
            assert!(save(&old, &store, &request, &cancel).is_err());
        });
        assert!(cancel.load(Ordering::SeqCst));
        assert_eq!(std::fs::read(old).unwrap(), b"previous project survives");
    }
}
