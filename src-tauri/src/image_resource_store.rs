//! Durable artwork resources. Display caches have no access to this store's GC.
//! Publication order is synced blob -> directory sync -> SQLite FULL/WAL commit.
use crate::image_assets::{AssetError, Metadata};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
    sync::{
        Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::{Duration, Instant},
};
type Result<T> = std::result::Result<T, AssetError>;
fn error(code: &str) -> AssetError {
    AssetError::new(code)
}
pub const COPY_BUFFER_BYTES: usize = 256 * 1024;
const INPUT_LIMIT: u64 = 16 * 1024 * 1024 * 1024;
const STORE_LIMIT: i64 = 64 * 1024 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RasterReference {
    pub asset_id: String,
    pub revision: u64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAsset {
    pub reference: RasterReference,
    pub original_hash: String,
    pub byte_length: u64,
    pub metadata: Metadata,
    pub profile_hash: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StoredProjectSource {
    pub hash: String,
    pub byte_length: u64,
    pub mime: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceRoot {
    pub kind: String,
    pub id: String,
}
impl ResourceRoot {
    fn validate(&self) -> Result<()> {
        if ![
            "document",
            "undo",
            "redo",
            "recovery",
            "transaction",
            "project",
        ]
        .contains(&self.kind.as_str())
            || self.id.is_empty()
            || self.id.len() > 256
        {
            return Err(error("invalid_root"));
        }
        Ok(())
    }
}
pub struct PreparedBlob {
    pub hash: String,
    pub bytes: u64,
    pub(crate) path: PathBuf,
    _stage: tempfile::TempDir,
}
pub struct ResourceStore {
    root: PathBuf,
    connection: Mutex<Connection>,
    readers: Mutex<HashMap<String, usize>>,
    _exclusive: File,
}
impl Drop for ResourceStore {
    fn drop(&mut self) {
        // Explicit unlock matters when another native test/process has forked
        // between open and close: a transient inherited descriptor must not keep
        // our finished owner's flock alive until that child reaches exec.
        let _ = self._exclusive.unlock();
    }
}
pub struct ResourceReadLease {
    store: Arc<ResourceStore>,
    hashes: Vec<String>,
}
impl Drop for ResourceReadLease {
    fn drop(&mut self) {
        let mut readers = self.store.readers.lock().unwrap();
        for hash in &self.hashes {
            if let Some(n) = readers.get_mut(hash) {
                *n -= 1;
                if *n == 0 {
                    readers.remove(hash);
                }
            }
        }
    }
}
fn sync_dir(path: &Path) -> Result<()> {
    #[cfg(unix)]
    File::open(path)
        .and_then(|f| f.sync_all())
        .map_err(|_| error("storage_unavailable"))?;
    // Windows directory handles require platform flags; SQLite still provides FULL durability.
    Ok(())
}
fn valid_hash(hash: &str) -> bool {
    hash.len() == 64
        && hash
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}
pub fn canonical_source_mime(mime: &str) -> Option<&str> {
    match mime {
        "image/jpg" => Some("image/jpeg"),
        "image/vnd.microsoft.icon" => Some("image/x-icon"),
        "image/png" | "image/jpeg" | "image/tiff" | "image/webp" | "image/gif"
        | "image/svg+xml" | "image/bmp" | "image/avif" | "image/x-icon" => Some(mime),
        _ => None,
    }
}
fn sniff_source_mime(b: &[u8]) -> Option<&'static str> {
    if b.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if b.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if [b"II*\0", b"MM\0*", b"II+\0", b"MM\0+"]
        .iter()
        .any(|m| b.starts_with(*m))
    {
        Some("image/tiff")
    } else if b.starts_with(b"RIFF") && b.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else if b.starts_with(b"GIF87a") || b.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if b.starts_with(b"BM") {
        Some("image/bmp")
    } else if b.get(4..8) == Some(b"ftyp") && b.windows(4).any(|w| w == b"avif" || w == b"avis") {
        Some("image/avif")
    } else if b.starts_with(b"\0\0\x01\0") {
        Some("image/x-icon")
    } else {
        let text = String::from_utf8_lossy(b);
        let text = text.trim_start_matches('\u{feff}').trim_start();
        if (text.starts_with("<svg") || text.starts_with("<?xml") || text.starts_with("<!--"))
            && text.contains("<svg")
        {
            Some("image/svg+xml")
        } else {
            None
        }
    }
}
impl ResourceStore {
    pub fn commit_project_source(
        &self,
        blob: PreparedBlob,
        mime: String,
        owner: &ResourceRoot,
    ) -> Result<StoredProjectSource> {
        owner.validate()?;
        let mime = canonical_source_mime(&mime)
            .ok_or_else(|| error("invalid_request"))?
            .to_owned();
        let mut buffer = vec![0; COPY_BUFFER_BYTES];
        let n = File::open(&blob.path)
            .map_err(|_| error("asset_missing"))?
            .read(&mut buffer)
            .map_err(|_| error("asset_corrupt"))?;
        if sniff_source_mime(&buffer[..n.min(4096)]) != Some(mime.as_str()) {
            return Err(error("asset_corrupt"));
        }
        let mut connection = self.connection.lock().unwrap();
        let previous: Option<String> = connection
            .query_row(
                "SELECT mime FROM project_sources WHERE hash=?1",
                [&blob.hash],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| error("storage_unavailable"))?;
        if previous.is_some_and(|old| old != mime) {
            return Err(error("asset_corrupt"));
        }
        Self::admit_bytes(&connection, &blob)?;
        self.publish(&blob)?;
        let source = StoredProjectSource {
            hash: blob.hash.clone(),
            byte_length: blob.bytes,
            mime,
        };
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO blobs VALUES(?1,?2,'original')",
            params![blob.hash, blob.bytes as i64],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO project_sources VALUES(?1,?2)",
            params![blob.hash, source.mime],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO blob_roots VALUES(?1,?2,?3)",
            params![owner.kind, owner.id, blob.hash],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(source)
    }
    pub fn lease_project_sources(
        self: &Arc<Self>,
        hashes: &[String],
    ) -> Result<(Vec<StoredProjectSource>, Arc<ResourceReadLease>)> {
        if hashes.len() > 4096 || hashes.iter().any(|h| !valid_hash(h)) {
            return Err(error("invalid_reference"));
        }
        let connection = self.connection.lock().unwrap();
        let mut sources = Vec::new();
        for hash in hashes {
            let source:Option<StoredProjectSource>=connection.query_row("SELECT b.bytes,s.mime FROM project_sources s JOIN blobs b ON b.hash=s.hash WHERE s.hash=?1",[hash],|r|Ok(StoredProjectSource{hash:hash.clone(),byte_length:r.get::<_,i64>(0)? as u64,mime:r.get(1)?})).optional().map_err(|_|error("storage_unavailable"))?;
            sources.push(source.ok_or_else(|| error("asset_missing"))?);
        }
        let mut readers = self.readers.lock().unwrap();
        for hash in hashes {
            *readers.entry(hash.clone()).or_default() += 1;
        }
        Ok((
            sources,
            Arc::new(ResourceReadLease {
                store: self.clone(),
                hashes: hashes.to_vec(),
            }),
        ))
    }
    /// Container restore consumes an entry reader directly. A fixed buffer and
    /// declared length bound both allocation and disk growth before publication.
    pub fn prepare_reader(
        &self,
        input: &mut impl Read,
        expected: u64,
        cancel: &AtomicBool,
    ) -> Result<PreparedBlob> {
        if expected == 0 || expected > INPUT_LIMIT {
            return Err(error("input_budget"));
        }
        let stage = tempfile::Builder::new()
            .prefix("container-")
            .tempdir_in(self.root.join("staging"))
            .map_err(|_| error("storage_unavailable"))?;
        let path = stage.path().join("content.partial");
        let mut output = File::create(&path).map_err(|_| error("storage_unavailable"))?;
        let mut buffer = vec![0; COPY_BUFFER_BYTES];
        let mut bytes = 0u64;
        let mut hash = Sha256::new();
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(error("cancelled"));
            }
            let count = input
                .read(&mut buffer)
                .map_err(|_| error("asset_corrupt"))?;
            if count == 0 {
                break;
            }
            bytes = bytes
                .checked_add(count as u64)
                .ok_or_else(|| error("input_budget"))?;
            if bytes > expected {
                return Err(error("asset_corrupt"));
            }
            output
                .write_all(&buffer[..count])
                .map_err(|_| error("storage_unavailable"))?;
            hash.update(&buffer[..count]);
        }
        if bytes != expected {
            return Err(error("asset_corrupt"));
        }
        output
            .sync_all()
            .map_err(|_| error("storage_unavailable"))?;
        Ok(PreparedBlob {
            hash: format!("{:x}", hash.finalize()),
            bytes,
            path,
            _stage: stage,
        })
    }
    /// Only indexed working diffs can enter a container. The database/reader
    /// lock order is shared with GC, so resolving and leasing cannot race it.
    pub fn lease_working_diffs(
        self: &Arc<Self>,
        hashes: &[String],
    ) -> Result<(Vec<(String, u64)>, Arc<ResourceReadLease>)> {
        if hashes.len() > 4096 || hashes.iter().any(|h| !valid_hash(h)) {
            return Err(error("invalid_reference"));
        }
        let connection = self.connection.lock().unwrap();
        let mut blobs = Vec::new();
        for hash in hashes {
            let bytes:Option<i64>=connection.query_row("SELECT bytes FROM blobs WHERE hash=?1 AND hash IN (SELECT hash FROM working_diffs)",[hash],|r|r.get(0)).optional().map_err(|_|error("storage_unavailable"))?;
            blobs.push((
                hash.clone(),
                bytes.ok_or_else(|| error("asset_missing"))? as u64,
            ));
        }
        let mut readers = self.readers.lock().unwrap();
        for hash in hashes {
            *readers.entry(hash.clone()).or_default() += 1;
        }
        Ok((
            blobs,
            Arc::new(ResourceReadLease {
                store: self.clone(),
                hashes: hashes.to_vec(),
            }),
        ))
    }
    pub fn open(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(&root).map_err(|_| error("storage_unavailable"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700))
                .map_err(|_| error("storage_unavailable"))?;
        }
        let exclusive = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("store.lock"))
            .map_err(|_| error("storage_unavailable"))?;
        exclusive.try_lock().map_err(|_| error("storage_busy"))?;
        fs::create_dir_all(root.join("blobs")).map_err(|_| error("storage_unavailable"))?;
        fs::create_dir_all(root.join("staging")).map_err(|_| error("storage_unavailable"))?;
        // Only the exclusive owner can do startup cleanup. Committed blobs are never
        // inferred dead from missing process leases or a missing external source.
        for entry in fs::read_dir(root.join("staging")).map_err(|_| error("storage_unavailable"))? {
            let path = entry.map_err(|_| error("storage_unavailable"))?.path();
            if path.is_dir() {
                fs::remove_dir_all(path)
            } else {
                fs::remove_file(path)
            }
            .map_err(|_| error("storage_unavailable"))?;
        }
        let connection = Connection::open(root.join("index.sqlite3"))
            .map_err(|_| error("storage_unavailable"))?;
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS blobs(hash TEXT PRIMARY KEY, bytes INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('original','profile','workingDiff')));
          CREATE TABLE IF NOT EXISTS project_sources(hash TEXT PRIMARY KEY REFERENCES blobs(hash) ON DELETE CASCADE,mime TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS working_diffs(hash TEXT PRIMARY KEY REFERENCES blobs(hash) ON DELETE CASCADE);
          INSERT OR IGNORE INTO working_diffs SELECT hash FROM blobs WHERE kind='workingDiff';
          CREATE TABLE IF NOT EXISTS assets(id TEXT NOT NULL, revision INTEGER NOT NULL, original TEXT NOT NULL REFERENCES blobs(hash), profile TEXT REFERENCES blobs(hash), descriptor TEXT NOT NULL, PRIMARY KEY(id,revision));
          CREATE TABLE IF NOT EXISTS roots(kind TEXT NOT NULL, id TEXT NOT NULL, asset TEXT NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(kind,id,asset,revision), FOREIGN KEY(asset,revision) REFERENCES assets(id,revision));
          CREATE TABLE IF NOT EXISTS blob_roots(kind TEXT NOT NULL, id TEXT NOT NULL, hash TEXT NOT NULL REFERENCES blobs(hash), PRIMARY KEY(kind,id,hash));")
          .map_err(|_|error("storage_unavailable"))?;
        // The exclusive process lock and recovered WAL make these files provably
        // uncommitted, unlike committed content whose owner is currently offline.
        let indexed: HashSet<String> = {
            let mut q = connection
                .prepare("SELECT hash FROM blobs")
                .map_err(|_| error("storage_unavailable"))?;
            q.query_map([], |r| r.get(0))
                .map_err(|_| error("storage_unavailable"))?
                .collect::<rusqlite::Result<_>>()
                .map_err(|_| error("storage_unavailable"))?
        };
        for entry in fs::read_dir(root.join("blobs")).map_err(|_| error("storage_unavailable"))? {
            let entry = entry.map_err(|_| error("storage_unavailable"))?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if valid_hash(&name) && !indexed.contains(&name) {
                fs::remove_file(entry.path()).map_err(|_| error("storage_unavailable"))?;
            }
        }
        sync_dir(&root)?;
        Ok(Self {
            root,
            connection: Mutex::new(connection),
            readers: Mutex::new(HashMap::new()),
            _exclusive: exclusive,
        })
    }
    /// Independent private staging; full SHA is the first cross-import identity.
    pub fn prepare(
        &self,
        source: &Path,
        cancel: &AtomicBool,
        timeout: Duration,
        mut validate: impl FnMut() -> Result<()>,
    ) -> Result<PreparedBlob> {
        validate()?;
        let stage = tempfile::Builder::new()
            .prefix("import-")
            .tempdir_in(self.root.join("staging"))
            .map_err(|_| error("storage_unavailable"))?;
        let path = stage.path().join("content.partial");
        let mut input = File::open(source).map_err(|_| error("source_changed"))?;
        let expected = input.metadata().map_err(|_| error("source_changed"))?.len();
        if expected == 0 || expected > INPUT_LIMIT {
            return Err(error("input_budget"));
        }
        let mut output = File::create(&path).map_err(|_| error("storage_unavailable"))?;
        let mut hash = Sha256::new();
        let mut buffer = vec![0u8; COPY_BUFFER_BYTES];
        let mut bytes = 0;
        let start = Instant::now();
        loop {
            if cancel.load(Ordering::SeqCst) {
                return Err(error("cancelled"));
            }
            if start.elapsed() > timeout {
                return Err(error("timed_out"));
            }
            validate()?;
            let count = input
                .read(&mut buffer)
                .map_err(|_| error("source_changed"))?;
            if count == 0 {
                break;
            }
            bytes += count as u64;
            if bytes > expected {
                return Err(error("source_changed"));
            }
            output
                .write_all(&buffer[..count])
                .map_err(|_| error("storage_unavailable"))?;
            hash.update(&buffer[..count]);
        }
        validate()?;
        if bytes != expected
            || input.metadata().map_err(|_| error("source_changed"))?.len() != expected
        {
            return Err(error("source_changed"));
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(error("cancelled"));
        }
        output
            .sync_all()
            .map_err(|_| error("storage_unavailable"))?;
        Ok(PreparedBlob {
            hash: format!("{:x}", hash.finalize()),
            bytes,
            path,
            _stage: stage,
        })
    }
    fn publish(&self, blob: &PreparedBlob) -> Result<PathBuf> {
        let target = self.root.join("blobs").join(&blob.hash);
        if target.exists() {
            // Verify bytes before trusting an existing content address (including
            // crash or disk corruption); never deduplicate by filename/mtime.
            self.verify_blob(&blob.hash, blob.bytes)?;
        } else {
            fs::rename(&blob.path, &target).map_err(|_| error("storage_unavailable"))?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&target, fs::Permissions::from_mode(0o400))
                    .map_err(|_| error("storage_unavailable"))?;
            }
            File::open(&target)
                .and_then(|f| f.sync_all())
                .map_err(|_| error("storage_unavailable"))?;
            sync_dir(&self.root.join("blobs"))?;
        }
        Ok(target)
    }
    pub fn commit_original(
        &self,
        reference: RasterReference,
        metadata: Metadata,
        original: PreparedBlob,
        profile: Option<PreparedBlob>,
        owner: ResourceRoot,
        cancel: &AtomicBool,
    ) -> Result<StoredAsset> {
        owner.validate()?;
        if reference.asset_id.len() != 48
            || !reference.asset_id.bytes().all(|b| b.is_ascii_hexdigit())
            || reference.revision == 0
            || reference.revision > i64::MAX as u64
        {
            return Err(error("invalid_reference"));
        }
        if metadata.profile_hash != profile.as_ref().map(|p| p.hash.clone()) {
            return Err(error("profile_mismatch"));
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(error("cancelled"));
        }
        let mut connection = self.connection.lock().unwrap();
        let existing: Option<String> = connection
            .query_row(
                "SELECT descriptor FROM assets WHERE id=?1 AND revision=?2",
                params![reference.asset_id, reference.revision as i64],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| error("storage_unavailable"))?;
        if let Some(json) = existing {
            let existing: StoredAsset =
                serde_json::from_str(&json).map_err(|_| error("asset_corrupt"))?;
            if existing.original_hash != original.hash
                || serde_json::to_string(&existing.metadata).ok()
                    != serde_json::to_string(&metadata).ok()
            {
                return Err(error("revision_stale"));
            }
            self.verify_blob(&original.hash, original.bytes)?;
            if cancel.load(Ordering::SeqCst) {
                return Err(error("cancelled"));
            }
            connection
                .execute(
                    "INSERT OR IGNORE INTO roots VALUES(?1,?2,?3,?4)",
                    params![
                        owner.kind,
                        owner.id,
                        reference.asset_id,
                        reference.revision as i64
                    ],
                )
                .map_err(|_| error("storage_unavailable"))?;
            return Ok(existing);
        }
        Self::admit_bytes(&connection, &original)?;
        self.publish(&original)?;
        if let Some(ref p) = profile {
            self.publish(p)?;
        }
        if cancel.load(Ordering::SeqCst) {
            return Err(error("cancelled"));
        }
        let asset = StoredAsset {
            reference,
            original_hash: original.hash.clone(),
            byte_length: original.bytes,
            metadata,
            profile_hash: profile.as_ref().map(|p| p.hash.clone()),
        };
        let json = serde_json::to_string(&asset).map_err(|_| error("invalid_reference"))?;
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        let write = || -> rusqlite::Result<()> {
            tx.execute(
                "INSERT OR IGNORE INTO blobs VALUES(?1,?2,'original')",
                params![original.hash, original.bytes as i64],
            )?;
            if let Some(ref p) = profile {
                tx.execute(
                    "INSERT OR IGNORE INTO blobs VALUES(?1,?2,'profile')",
                    params![p.hash, p.bytes as i64],
                )?;
            }
            tx.execute(
                "INSERT INTO assets VALUES(?1,?2,?3,?4,?5)",
                params![
                    asset.reference.asset_id,
                    asset.reference.revision as i64,
                    asset.original_hash,
                    asset.profile_hash,
                    json
                ],
            )?;
            tx.execute(
                "INSERT INTO roots VALUES(?1,?2,?3,?4)",
                params![
                    owner.kind,
                    owner.id,
                    asset.reference.asset_id,
                    asset.reference.revision as i64
                ],
            )?;
            Ok(())
        };
        write().map_err(|_| error("storage_unavailable"))?;
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(asset)
    }
    pub fn resolve(&self, reference: &RasterReference) -> Result<StoredAsset> {
        let connection = self.connection.lock().unwrap();
        let json: Option<String> = connection
            .query_row(
                "SELECT descriptor FROM assets WHERE id=?1 AND revision=?2",
                params![reference.asset_id, reference.revision as i64],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| error("storage_unavailable"))?;
        serde_json::from_str(&json.ok_or_else(|| error("asset_missing"))?)
            .map_err(|_| error("asset_corrupt"))
    }
    pub fn lease_asset(
        self: &Arc<Self>,
        reference: &RasterReference,
    ) -> Result<(StoredAsset, Arc<ResourceReadLease>)> {
        // Same lock as GC/root commits; no resolve->lease deletion gap.
        let connection = self.connection.lock().unwrap();
        let json: Option<String> = connection
            .query_row(
                "SELECT descriptor FROM assets WHERE id=?1 AND revision=?2",
                params![reference.asset_id, reference.revision as i64],
                |r| r.get(0),
            )
            .optional()
            .map_err(|_| error("storage_unavailable"))?;
        let stored: StoredAsset =
            serde_json::from_str(&json.ok_or_else(|| error("asset_missing"))?)
                .map_err(|_| error("asset_corrupt"))?;
        let mut hashes = vec![stored.original_hash.clone()];
        if let Some(ref hash) = stored.profile_hash {
            hashes.push(hash.clone());
        }
        let mut readers = self.readers.lock().unwrap();
        for hash in &hashes {
            *readers.entry(hash.clone()).or_default() += 1;
        }
        Ok((
            stored,
            Arc::new(ResourceReadLease {
                store: self.clone(),
                hashes,
            }),
        ))
    }
    pub fn blob_path(&self, hash: &str) -> Result<PathBuf> {
        if !valid_hash(hash) {
            return Err(error("invalid_reference"));
        }
        let path = self.root.join("blobs").join(hash);
        if !path.is_file() {
            return Err(error("asset_missing"));
        }
        Ok(path)
    }
    pub fn verify_blob(&self, hash: &str, expected: u64) -> Result<()> {
        let mut file = File::open(self.blob_path(hash)?).map_err(|_| error("asset_missing"))?;
        if file.metadata().map_err(|_| error("asset_missing"))?.len() != expected {
            return Err(error("asset_corrupt"));
        }
        let mut sha = Sha256::new();
        let mut buffer = vec![0; COPY_BUFFER_BYTES];
        loop {
            let n = file.read(&mut buffer).map_err(|_| error("asset_corrupt"))?;
            if n == 0 {
                break;
            }
            sha.update(&buffer[..n]);
        }
        if format!("{:x}", sha.finalize()) != hash {
            return Err(error("asset_corrupt"));
        }
        Ok(())
    }
    /// Replacing a root is one durable transaction: never release old refs first.
    pub fn replace_root(&self, owner: &ResourceRoot, references: &[RasterReference]) -> Result<()> {
        self.replace_roots(&[(owner.clone(), references.to_vec())])
    }
    /// Document/undo/redo move together so GC never sees a transfer gap.
    pub fn replace_roots(&self, roots: &[(ResourceRoot, Vec<RasterReference>)]) -> Result<()> {
        if roots.len() > 128 || roots.iter().map(|(_, refs)| refs.len()).sum::<usize>() > 100000 {
            return Err(error("reference_budget"));
        }
        for (owner, _) in roots {
            owner.validate()?;
        }
        let mut connection = self.connection.lock().unwrap();
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        for (owner, references) in roots {
            tx.execute(
                "DELETE FROM roots WHERE kind=?1 AND id=?2",
                params![owner.kind, owner.id],
            )
            .map_err(|_| error("storage_unavailable"))?;
            for r in references {
                tx.execute(
                    "INSERT OR IGNORE INTO roots VALUES(?1,?2,?3,?4)",
                    params![owner.kind, owner.id, r.asset_id, r.revision as i64],
                )
                .map_err(|_| error("asset_missing"))?;
            }
        }
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(())
    }
    /// Claim one newly imported asset by union, preserving every prior owner ref.
    pub fn claim_import(&self, owner: &ResourceRoot, reference: &RasterReference) -> Result<()> {
        owner.validate()?;
        let mut connection = self.connection.lock().unwrap();
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "DELETE FROM roots WHERE kind='transaction' AND id=?1 AND asset=?2 AND revision=?3",
            params![
                format!("import:{}", reference.asset_id),
                reference.asset_id,
                reference.revision as i64
            ],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO roots VALUES(?1,?2,?3,?4)",
            params![
                owner.kind,
                owner.id,
                reference.asset_id,
                reference.revision as i64
            ],
        )
        .map_err(|_| error("asset_missing"))?;
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(())
    }
    /// Working diffs use the same durability barrier and explicit ownership;
    /// they are never part of the reconstructible display-cache LRU.
    pub fn commit_working_diff(&self, blob: PreparedBlob, owner: &ResourceRoot) -> Result<String> {
        owner.validate()?;
        let mut connection = self.connection.lock().unwrap();
        Self::admit_bytes(&connection, &blob)?;
        self.publish(&blob)?;
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO blobs VALUES(?1,?2,'workingDiff')",
            params![blob.hash, blob.bytes as i64],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO working_diffs VALUES(?1)",
            [&blob.hash],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "INSERT OR IGNORE INTO blob_roots VALUES(?1,?2,?3)",
            params![owner.kind, owner.id, blob.hash],
        )
        .map_err(|_| error("storage_unavailable"))?;
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(blob.hash)
    }
    fn admit_bytes(connection: &Connection, blob: &PreparedBlob) -> Result<()> {
        let used: i64 = connection
            .query_row("SELECT COALESCE(SUM(bytes),0) FROM blobs", [], |r| r.get(0))
            .map_err(|_| error("storage_unavailable"))?;
        let existing: bool = connection
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM blobs WHERE hash=?1)",
                [&blob.hash],
                |r| r.get(0),
            )
            .map_err(|_| error("storage_unavailable"))?;
        if !existing
            && used
                .checked_add(blob.bytes as i64)
                .is_none_or(|n| n > STORE_LIMIT - 1024 * 1024)
        {
            return Err(error("storage_budget"));
        }
        Ok(())
    }
    pub fn replace_blob_root(&self, owner: &ResourceRoot, hashes: &[String]) -> Result<()> {
        owner.validate()?;
        if hashes.len() > 100000 || hashes.iter().any(|h| !valid_hash(h)) {
            return Err(error("invalid_reference"));
        }
        let mut connection = self.connection.lock().unwrap();
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        tx.execute(
            "DELETE FROM blob_roots WHERE kind=?1 AND id=?2",
            params![owner.kind, owner.id],
        )
        .map_err(|_| error("storage_unavailable"))?;
        for hash in hashes {
            tx.execute(
                "INSERT OR IGNORE INTO blob_roots VALUES(?1,?2,?3)",
                params![owner.kind, owner.id, hash],
            )
            .map_err(|_| error("asset_missing"))?;
        }
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        Ok(())
    }
    /// Explicit GC only. Persistent roots survive crashes and store reopening.
    /// Files are retained as orphans if interrupted after index commit; startup
    /// never deletes committed files merely because a process lease expired.
    pub fn collect_unrooted(&self) -> Result<usize> {
        let mut connection = self.connection.lock().unwrap();
        let tx = connection
            .transaction()
            .map_err(|_| error("storage_unavailable"))?;
        let readers = self.readers.lock().unwrap();
        tx.execute_batch("CREATE TEMP TABLE IF NOT EXISTS live_resource_reads(hash TEXT PRIMARY KEY); DELETE FROM live_resource_reads;").map_err(|_|error("storage_unavailable"))?;
        for hash in readers.keys() {
            tx.execute("INSERT INTO live_resource_reads VALUES(?1)", [hash])
                .map_err(|_| error("storage_unavailable"))?;
        }
        tx.execute("DELETE FROM assets WHERE NOT EXISTS(SELECT 1 FROM roots WHERE roots.asset=assets.id AND roots.revision=assets.revision) AND NOT EXISTS(SELECT 1 FROM live_resource_reads WHERE hash=assets.original OR hash=assets.profile)",[]).map_err(|_|error("storage_unavailable"))?;
        let hashes: Vec<String> = {
            let mut query=tx.prepare("SELECT hash FROM blobs WHERE NOT EXISTS(SELECT 1 FROM assets WHERE original=hash OR profile=hash) AND NOT EXISTS(SELECT 1 FROM blob_roots WHERE blob_roots.hash=blobs.hash) AND NOT EXISTS(SELECT 1 FROM live_resource_reads WHERE live_resource_reads.hash=blobs.hash)").map_err(|_|error("storage_unavailable"))?;
            query
                .query_map([], |r| r.get(0))
                .map_err(|_| error("storage_unavailable"))?
                .collect::<rusqlite::Result<_>>()
                .map_err(|_| error("storage_unavailable"))?
        };
        for hash in &hashes {
            tx.execute("DELETE FROM blobs WHERE hash=?1", [hash])
                .map_err(|_| error("storage_unavailable"))?;
        }
        tx.commit().map_err(|_| error("storage_unavailable"))?;
        for hash in &hashes {
            fs::remove_file(self.root.join("blobs").join(hash))
                .map_err(|_| error("storage_unavailable"))?;
        }
        Ok(hashes.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn metadata() -> Metadata {
        Metadata {
            width: 10,
            height: 10,
            bands: 3,
            sample_type: "u8".into(),
            orientation: 1,
            pages: 1,
            format: "png".into(),
            editing_supported: true,
            profile_hash: None,
        }
    }
    fn owner(kind: &str) -> ResourceRoot {
        ResourceRoot {
            kind: kind.into(),
            id: "test-document".into(),
        }
    }
    fn put(store: &ResourceStore, source: &Path, id: &str) -> StoredAsset {
        let cancel = AtomicBool::new(false);
        let blob = store
            .prepare(source, &cancel, Duration::from_secs(30), || Ok(()))
            .unwrap();
        store
            .commit_original(
                RasterReference {
                    asset_id: id.repeat(48),
                    revision: 1,
                },
                metadata(),
                blob,
                None,
                owner("document"),
                &cancel,
            )
            .unwrap()
    }
    #[test]
    fn original_survives_rename_delete_and_store_restart_with_exact_sha() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("external");
        let bytes = b"immutable image bytes";
        fs::write(&source, bytes).unwrap();
        let root = d.path().join("resources");
        let store = ResourceStore::open(root.clone()).unwrap();
        let a = put(&store, &source, "a");
        fs::rename(&source, d.path().join("renamed")).unwrap();
        fs::remove_file(d.path().join("renamed")).unwrap();
        drop(store);
        let store = ResourceStore::open(root).unwrap();
        let restored = store.resolve(&a.reference).unwrap();
        assert_eq!(
            restored.original_hash,
            format!("{:x}", Sha256::digest(bytes))
        );
        store
            .verify_blob(&restored.original_hash, bytes.len() as u64)
            .unwrap();
        assert_eq!(
            fs::read(store.blob_path(&restored.original_hash).unwrap()).unwrap(),
            bytes
        );
    }
    #[test]
    fn cancellation_during_bounded_copy_publishes_nothing_and_removes_stage() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        let mut file = File::create(&source).unwrap();
        for _ in 0..20 {
            file.write_all(&vec![7; COPY_BUFFER_BYTES]).unwrap();
        }
        drop(file);
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let cancel = AtomicBool::new(false);
        let mut checks = 0;
        let result = store.prepare(&source, &cancel, Duration::from_secs(30), || {
            checks += 1;
            if checks == 4 {
                cancel.store(true, Ordering::SeqCst);
            }
            Ok(())
        });
        assert_eq!(result.err().unwrap().code, "cancelled");
        assert!(checks < 20);
        assert_eq!(fs::read_dir(store.root.join("staging")).unwrap().count(), 0);
        assert_eq!(fs::read_dir(store.root.join("blobs")).unwrap().count(), 0);
    }
    #[test]
    fn source_mutation_is_rejected_before_publication() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        fs::write(&source, vec![2; COPY_BUFFER_BYTES * 4]).unwrap();
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let mut checks = 0;
        let result = store.prepare(
            &source,
            &AtomicBool::new(false),
            Duration::from_secs(30),
            || {
                checks += 1;
                if checks == 3 {
                    fs::write(&source, b"changed").unwrap();
                    return Err(error("source_changed"));
                }
                Ok(())
            },
        );
        assert_eq!(result.err().unwrap().code, "source_changed");
        assert_eq!(fs::read_dir(store.root.join("staging")).unwrap().count(), 0);
    }
    #[test]
    fn startup_cleans_only_uncommitted_staging_and_unindexed_blobs() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("resources");
        let source = d.path().join("source");
        fs::write(&source, b"preserved").unwrap();
        let store = ResourceStore::open(root.clone()).unwrap();
        let asset = put(&store, &source, "a");
        let incomplete = store.root.join("staging/dead-import");
        fs::create_dir(&incomplete).unwrap();
        fs::write(incomplete.join("partial"), b"partial").unwrap();
        fs::write(
            store.root.join("blobs").join("0".repeat(64)),
            b"unindexed after crash",
        )
        .unwrap();
        assert!(
            ResourceStore::open(root.clone()).is_err(),
            "another process must not clean a live import"
        );
        drop(store);
        let store = ResourceStore::open(root).unwrap();
        assert_eq!(fs::read_dir(store.root.join("staging")).unwrap().count(), 0);
        assert!(store.blob_path(&asset.original_hash).is_ok());
        assert!(!store.root.join("blobs").join("0".repeat(64)).exists());
    }
    #[test]
    fn roots_survive_restart_and_failed_replacement_preserves_old_owner() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("resources");
        let source = d.path().join("source");
        fs::write(&source, b"history").unwrap();
        let store = ResourceStore::open(root.clone()).unwrap();
        let a = put(&store, &source, "a");
        for kind in ["undo", "redo", "recovery", "transaction", "project"] {
            store
                .replace_root(&owner(kind), std::slice::from_ref(&a.reference))
                .unwrap();
        }
        store.replace_root(&owner("document"), &[]).unwrap();
        let invalid = RasterReference {
            asset_id: "b".repeat(48),
            revision: 1,
        };
        assert!(store.replace_root(&owner("recovery"), &[invalid]).is_err());
        drop(store);
        let store = ResourceStore::open(root).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 0);
        assert!(store.resolve(&a.reference).is_ok());
        for kind in ["undo", "redo", "transaction", "project"] {
            store.replace_root(&owner(kind), &[]).unwrap();
        }
        assert_eq!(
            store.collect_unrooted().unwrap(),
            0,
            "failed replacement must retain recovery root"
        );
        store.replace_root(&owner("recovery"), &[]).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 1);
        assert!(store.resolve(&a.reference).is_err());
    }
    #[test]
    fn content_address_collision_is_verified_and_corruption_reported() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        fs::write(&source, b"original").unwrap();
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let a = put(&store, &source, "a");
        let path = store.blob_path(&a.original_hash).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        }
        fs::write(&path, b"corrupt!").unwrap();
        assert_eq!(
            store
                .verify_blob(&a.original_hash, a.byte_length)
                .unwrap_err()
                .code,
            "asset_corrupt"
        );
        let blob = store
            .prepare(
                &source,
                &AtomicBool::new(false),
                Duration::from_secs(30),
                || Ok(()),
            )
            .unwrap();
        assert_eq!(
            store
                .commit_original(
                    RasterReference {
                        asset_id: "b".repeat(48),
                        revision: 1
                    },
                    metadata(),
                    blob,
                    None,
                    owner("document"),
                    &AtomicBool::new(false)
                )
                .unwrap_err()
                .code,
            "asset_corrupt"
        );
    }
    #[test]
    fn durable_working_diff_is_not_reaped_with_unrooted_original() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("diff");
        fs::write(&source, b"pixel edit difference").unwrap();
        let root = d.path().join("resources");
        let store = ResourceStore::open(root.clone()).unwrap();
        let blob = store
            .prepare(
                &source,
                &AtomicBool::new(false),
                Duration::from_secs(30),
                || Ok(()),
            )
            .unwrap();
        let hash = store.commit_working_diff(blob, &owner("recovery")).unwrap();
        drop(store);
        let store = ResourceStore::open(root).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 0);
        assert!(store.blob_path(&hash).is_ok());
        store.replace_blob_root(&owner("recovery"), &[]).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 1);
    }

    #[test]
    fn claiming_two_imports_unions_document_root_and_survives_gc() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        fs::write(&source, b"first").unwrap();
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let a = put(&store, &source, "a");
        fs::write(&source, b"second").unwrap();
        let b = put(&store, &source, "b");
        store.replace_root(&owner("document"), &[]).unwrap();
        for a in [&a, &b] {
            store
                .replace_root(
                    &ResourceRoot {
                        kind: "transaction".into(),
                        id: format!("import:{}", a.reference.asset_id),
                    },
                    std::slice::from_ref(&a.reference),
                )
                .unwrap();
        }
        for a in [&a, &b] {
            store
                .claim_import(&owner("document"), &a.reference)
                .unwrap();
        }
        assert_eq!(store.collect_unrooted().unwrap(), 0);
        assert!(store.resolve(&a.reference).is_ok());
        assert!(store.resolve(&b.reference).is_ok());
        store.verify_blob(&a.original_hash, a.byte_length).unwrap();
        store.verify_blob(&b.original_hash, b.byte_length).unwrap();
    }
    #[test]
    fn repeated_original_commit_installs_additional_owner() {
        let d = tempfile::tempdir().unwrap();
        let source = d.path().join("source");
        fs::write(&source, b"identity").unwrap();
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let a = put(&store, &source, "a");
        let blob = store
            .prepare(
                &source,
                &AtomicBool::new(false),
                Duration::from_secs(5),
                || Ok(()),
            )
            .unwrap();
        store
            .commit_original(
                a.reference.clone(),
                metadata(),
                blob,
                None,
                owner("recovery"),
                &AtomicBool::new(false),
            )
            .unwrap();
        store.replace_root(&owner("document"), &[]).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 0);
        assert!(store.resolve(&a.reference).is_ok());
    }
    #[test]
    #[ignore = "optional external >200MB fixture; run explicitly with --ignored"]
    fn real_200mb_fixture_streams_through_fixed_size_buffers() {
        let source = Path::new("/tmp/draivio-large-images/200mb-gray.tiff");
        assert!(fs::metadata(source).unwrap().len() > 200_000_000);
        let d = tempfile::tempdir().unwrap();
        let store = ResourceStore::open(d.path().join("resources")).unwrap();
        let mut checkpoints = 0;
        let blob = store
            .prepare(
                source,
                &AtomicBool::new(false),
                Duration::from_secs(120),
                || {
                    checkpoints += 1;
                    Ok(())
                },
            )
            .unwrap();
        assert!(checkpoints >= blob.bytes as usize / COPY_BUFFER_BYTES);
        let bytes = blob.bytes;
        let hash = blob.hash.clone();
        let asset = store
            .commit_original(
                RasterReference {
                    asset_id: "c".repeat(48),
                    revision: 1,
                },
                metadata(),
                blob,
                None,
                owner("recovery"),
                &AtomicBool::new(false),
            )
            .unwrap();
        assert_eq!(asset.original_hash, hash);
        store.verify_blob(&hash, bytes).unwrap();
    }
}
