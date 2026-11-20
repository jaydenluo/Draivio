use crate::image_resource_store::{
    PreparedBlob, RasterReference, ResourceReadLease, ResourceRoot, ResourceStore,
};
// Host-owned image capabilities. Native filenames never enter frontend responses.
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime},
};
const INPUT_LIMIT: u64 = 16 * 1024 * 1024 * 1024;
const OUTPUT_LIMIT: u64 = 8 * 1024 * 1024 * 1024;
const TOTAL_LIMIT: u64 = 64 * 1024 * 1024 * 1024;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetError {
    pub code: String,
    pub message: String,
}
impl AssetError {
    pub fn new(code: &str) -> Self {
        Self {
            code: code.into(),
            message: match code {
                "runtime_unavailable" => "Native image runtime is unavailable",
                "source_changed" => "Source changed; select the image again",
                "unsupported_precision" => {
                    "This image cannot be edited at RGBA8 precision without explicit conversion"
                }
                _ => "Image service rejected the operation",
            }
            .into(),
        }
    }
}
type Result<T> = std::result::Result<T, AssetError>;
fn err(code: &str) -> AssetError {
    AssetError::new(code)
}
fn token() -> Result<String> {
    let mut bytes = [0u8; 24];
    getrandom::fill(&mut bytes).map_err(|_| err("runtime_unavailable"))?;
    Ok(bytes.iter().map(|b| format!("{b:02x}")).collect())
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Metadata {
    pub width: u32,
    pub height: u32,
    pub bands: u8,
    pub sample_type: String,
    pub orientation: u8,
    pub pages: u32,
    pub format: String,
    pub editing_supported: bool,
    pub profile_hash: Option<String>,
}
impl Metadata {
    pub(crate) fn validate(&self) -> Result<()> {
        if self.width == 0
            || self.height == 0
            || u64::from(self.width) * u64::from(self.height) > 1_000_000_000
            || self.pages != 1
            || !(1..=8).contains(&self.orientation)
            || !(1..=4).contains(&self.bands)
            || !["u8", "u16", "f32", "unsupported"].contains(&self.sample_type.as_str())
            || !["jpeg", "png", "tiff"].contains(&self.format.as_str())
            || self
                .profile_hash
                .as_ref()
                .is_some_and(|v| v.len() != 64 || !v.bytes().all(|b| b.is_ascii_hexdigit()))
        {
            return Err(err("metadata_budget"));
        }
        Ok(())
    }
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub protocol_version: u8,
    pub asset_id: String,
    pub session: String,
    pub revision: u64,
    pub lease: String,
    pub metadata: Metadata,
    pub content_hash: Option<String>,
    pub profile: Option<Resource>,
    pub raster_ref: Option<RasterReference>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resource {
    pub resource_id: String,
    pub session: String,
    pub asset_id: String,
    pub revision: u64,
    pub mime: String,
    pub bytes: u64,
    pub role: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub coordinate_space: Option<String>,
    pub display_transform_hash: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub protocol_version: u8,
    pub job_id: String,
    pub asset_id: String,
    pub revision: u64,
    pub phase: String,
    pub resource: Option<Resource>,
    pub content_hash: Option<String>,
    pub error: Option<AssetError>,
}
#[derive(Clone, PartialEq, Eq)]
struct Signature {
    len: u64,
    modified: SystemTime,
    #[cfg(unix)]
    ino: u64,
    #[cfg(unix)]
    dev: u64,
    #[cfg(unix)]
    ctime: i64,
    #[cfg(unix)]
    ctime_ns: i64,
}
fn signature(path: &Path) -> Result<Signature> {
    signature_metadata(fs::metadata(path).map_err(|_| err("source_changed"))?)
}
fn signature_metadata(m: fs::Metadata) -> Result<Signature> {
    if !m.is_file() || m.len() == 0 || m.len() > INPUT_LIMIT {
        return Err(err("input_budget"));
    }
    #[cfg(unix)]
    use std::os::unix::fs::MetadataExt;
    Ok(Signature {
        len: m.len(),
        modified: m.modified().map_err(|_| err("source_changed"))?,
        #[cfg(unix)]
        ino: m.ino(),
        #[cfg(unix)]
        dev: m.dev(),
        #[cfg(unix)]
        ctime: m.ctime(),
        #[cfg(unix)]
        ctime_ns: m.ctime_nsec(),
    })
}
struct Record {
    asset: Asset,
    source: PathBuf,
    source_handle: Arc<File>,
    signature: Signature,
    dir: Arc<tempfile::TempDir>,
    valid: bool,
    _durable: Option<Arc<ResourceReadLease>>,
}
pub struct ResourceFileLease {
    _directory: Arc<tempfile::TempDir>,
    _durable: Option<Arc<ResourceReadLease>>,
}
struct Published {
    resource: Resource,
    path: PathBuf,
    _dir: Arc<tempfile::TempDir>,
    accessed: Instant,
}
struct Running {
    job: Job,
    kind: String,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
struct State {
    assets: HashMap<String, Record>,
    imports: HashMap<String, Arc<AtomicBool>>,
    jobs: HashMap<String, Running>,
    resources: HashMap<String, Published>,
    used: u64,
}
struct Inner {
    root: tempfile::TempDir,
    worker: Option<PathBuf>,
    store: Arc<ResourceStore>,
    state: Mutex<State>,
    active: AtomicUsize,
    generation: AtomicU64,
}
#[derive(Clone)]
pub struct ImageAssets(Arc<Inner>);
struct Admission(Arc<Inner>);
impl Drop for Admission {
    fn drop(&mut self) {
        self.0.active.fetch_sub(1, Ordering::SeqCst);
    }
}
struct ImportGuard {
    inner: Arc<Inner>,
    id: String,
}
impl Drop for ImportGuard {
    fn drop(&mut self) {
        self.inner.state.lock().unwrap().imports.remove(&self.id);
    }
}
impl ImageAssets {
    pub(crate) fn project_store(&self) -> Arc<ResourceStore> {
        self.0.store.clone()
    }
    /// Bounded compatibility migration only. Native project resources never use
    /// this endpoint for large originals; all input bytes are supplied explicitly.
    pub(crate) fn register_project_inline(
        &self,
        source: &str,
        owner: &str,
    ) -> Result<crate::image_resource_store::StoredProjectSource> {
        if !owner.starts_with("save:") || owner.len() > 128 || source.len() > 24 * 1024 * 1024 {
            return Err(err("input_budget"));
        }
        let (header, payload) = source
            .split_once(',')
            .ok_or_else(|| err("invalid_request"))?;
        let mime = header
            .strip_prefix("data:")
            .and_then(|s| s.strip_suffix(";base64"))
            .ok_or_else(|| err("invalid_request"))?;
        if ![
            "image/png",
            "image/jpeg",
            "image/tiff",
            "image/webp",
            "image/gif",
            "image/svg+xml",
            "image/bmp",
            "image/avif",
            "image/x-icon",
            "image/vnd.microsoft.icon",
        ]
        .contains(&mime)
        {
            return Err(err("invalid_request"));
        }
        let mut input = base64::read::DecoderReader::new(
            payload.as_bytes(),
            &base64::engine::general_purpose::STANDARD,
        );
        let mut file = tempfile::NamedTempFile::new().map_err(|_| err("storage_unavailable"))?;
        let mut buffer = vec![0; 256 * 1024];
        let mut count = 0;
        loop {
            let n = input
                .read(&mut buffer)
                .map_err(|_| err("invalid_request"))?;
            if n == 0 {
                break;
            }
            count += n;
            if count > 16 * 1024 * 1024 {
                return Err(err("input_budget"));
            }
            std::io::Write::write_all(&mut file, &buffer[..n])
                .map_err(|_| err("storage_unavailable"))?;
        }
        let blob = self.0.store.prepare(
            file.path(),
            &AtomicBool::new(false),
            Duration::from_secs(60),
            || Ok(()),
        )?;
        self.0.store.commit_project_source(
            blob,
            mime.into(),
            &ResourceRoot {
                kind: "project".into(),
                id: owner.into(),
            },
        )
    }
    /// Container headers are untrusted. Re-probe staged original bytes before
    /// installing their metadata into a fresh durable store.
    pub(crate) fn verify_project_asset(
        &self,
        asset: &crate::image_resource_store::StoredAsset,
        path: &Path,
        cancel: &AtomicBool,
    ) -> Result<()> {
        let _admission = self.admit()?;
        let dir = tempfile::Builder::new()
            .prefix("project-probe-")
            .tempdir_in(self.0.root.path())
            .map_err(|_| err("storage_unavailable"))?;
        let profile = dir.path().join("profile");
        let bytes = execute(
            &self.worker()?,
            &[
                "probe".into(),
                path.as_os_str().into(),
                profile.as_os_str().into(),
            ],
            cancel,
            Duration::from_secs(30),
            None,
        )?;
        let metadata: Metadata =
            serde_json::from_slice(&bytes).map_err(|_| err("worker_protocol"))?;
        metadata.validate()?;
        if serde_json::to_value(&metadata).ok() != serde_json::to_value(&asset.metadata).ok() {
            return Err(err("asset_corrupt"));
        }
        Ok(())
    }
    fn admit(&self) -> Result<Admission> {
        if self.0.active.fetch_add(1, Ordering::SeqCst) >= 4 {
            self.0.active.fetch_sub(1, Ordering::SeqCst);
            return Err(err("busy"));
        }
        Ok(Admission(self.0.clone()))
    }
    pub fn new(worker: Option<PathBuf>) -> Result<Self> {
        let root = tempfile::Builder::new()
            .prefix("draivio-images-")
            .tempdir()
            .map_err(|_| err("storage_unavailable"))?;
        let store = Arc::new(ResourceStore::open(root.path().join("resources"))?);
        Self::with_root(worker, root, store)
    }
    pub fn with_store(worker: Option<PathBuf>, store: Arc<ResourceStore>) -> Result<Self> {
        let root = tempfile::Builder::new()
            .prefix("draivio-images-")
            .tempdir()
            .map_err(|_| err("storage_unavailable"))?;
        Self::with_root(worker, root, store)
    }
    fn with_root(
        worker: Option<PathBuf>,
        root: tempfile::TempDir,
        store: Arc<ResourceStore>,
    ) -> Result<Self> {
        Ok(Self(Arc::new(Inner {
            root,
            worker,
            store,
            state: Mutex::new(State::default()),
            active: AtomicUsize::new(0),
            generation: AtomicU64::new(0),
        })))
    }
    pub fn replace_root(&self, owner: &ResourceRoot, references: &[RasterReference]) -> Result<()> {
        self.0.store.replace_root(owner, references)
    }
    pub fn replace_roots(&self, roots: &[(ResourceRoot, Vec<RasterReference>)]) -> Result<()> {
        self.0.store.replace_roots(roots)
    }
    pub fn claim_import(&self, owner: &ResourceRoot, reference: &RasterReference) -> Result<()> {
        self.0.store.claim_import(owner, reference)
    }
    /// Resolve stable identity to a fresh runtime capability after restart.
    pub fn reopen(&self, reference: &RasterReference) -> Result<Asset> {
        self.reopen_for_generation(reference, self.generation())
    }
    pub fn reopen_for_generation(
        &self,
        reference: &RasterReference,
        generation: u64,
    ) -> Result<Asset> {
        let _admission = self.admit()?;
        let (stored, durable) = self.0.store.lease_asset(reference)?;
        let path = self.0.store.blob_path(&stored.original_hash)?;
        // Full integrity verification runs on the blocking command worker, never
        // on the first external-source preview path.
        self.0
            .store
            .verify_blob(&stored.original_hash, stored.byte_length)?;
        let dir = Arc::new(
            tempfile::Builder::new()
                .prefix("reopen-")
                .tempdir_in(self.0.root.path())
                .map_err(|_| err("storage_unavailable"))?,
        );
        let mut asset = Asset {
            protocol_version: 1,
            asset_id: token()?,
            session: token()?,
            revision: reference.revision,
            lease: token()?,
            metadata: stored.metadata,
            content_hash: Some(stored.original_hash),
            profile: None,
            raster_ref: Some(reference.clone()),
        };
        let source_handle = Arc::new(File::open(&path).map_err(|_| err("asset_missing"))?);
        let sig = signature(&path)?;
        let mut state = self.0.state.lock().unwrap();
        if state.assets.len() >= 16 {
            return Err(err("asset_budget"));
        }
        if self.generation() != generation {
            return Err(err("cancelled"));
        }
        if let Some(hash) = stored.profile_hash {
            let path = self.0.store.blob_path(&hash)?;
            let bytes = fs::metadata(&path).map_err(|_| err("asset_missing"))?.len();
            if bytes > 1024 * 1024 {
                return Err(err("asset_corrupt"));
            }
            self.0.store.verify_blob(&hash, bytes)?;
            let resource = make_resource(&asset, "profile", "application/vnd.iccprofile", bytes)?;
            state.used += bytes;
            state.resources.insert(
                resource.resource_id.clone(),
                Published {
                    resource: resource.clone(),
                    path,
                    _dir: dir.clone(),
                    accessed: Instant::now(),
                },
            );
            asset.profile = Some(resource);
        }
        state.assets.insert(
            asset.asset_id.clone(),
            Record {
                asset: asset.clone(),
                source: path,
                source_handle,
                signature: sig,
                dir,
                valid: true,
                _durable: Some(durable),
            },
        );
        Ok(asset)
    }
    /// LRU-budget boundary only touches reconstructible resources. Original,
    /// ICC and working-diff files belong exclusively to the durable store.
    pub fn evict_display_cache(&self, target_bytes: u64) -> u64 {
        let mut state = self.0.state.lock().unwrap();
        let mut ids: Vec<_> = state
            .resources
            .iter()
            .filter(|(_, r)| r.resource.role == "preview" || r.resource.role == "cache")
            .map(|(id, r)| (r.accessed, id.clone()))
            .collect();
        ids.sort();
        for (_, id) in ids {
            if state.used <= target_bytes {
                break;
            }
            if let Some(r) = state.resources.get(&id) {
                if fs::remove_file(&r.path).is_err() {
                    continue;
                }
            }
            if let Some(r) = state.resources.remove(&id) {
                state.used = state.used.saturating_sub(r.resource.bytes);
            }
        }
        state.used
    }
    fn worker(&self) -> Result<PathBuf> {
        self.0
            .worker
            .clone()
            .filter(|p| p.is_absolute() && p.is_file())
            .ok_or_else(|| err("runtime_unavailable"))
    }
    pub fn generation(&self) -> u64 {
        self.0.generation.load(Ordering::SeqCst)
    }
    pub fn import(&self, path: PathBuf) -> Result<Asset> {
        self.import_for_generation(path, self.generation())
    }
    pub fn import_for_generation(&self, path: PathBuf, generation: u64) -> Result<Asset> {
        let _admission = self.admit()?;
        let cancel = Arc::new(AtomicBool::new(false));
        let import_id = token()?;
        {
            let mut state = self.0.state.lock().unwrap();
            if self.generation() != generation {
                return Err(err("cancelled"));
            }
            if state.assets.len() + state.imports.len() >= 16 {
                return Err(err("asset_budget"));
            }
            state.imports.insert(import_id.clone(), cancel.clone());
        }
        let _import = ImportGuard {
            inner: self.0.clone(),
            id: import_id,
        };
        let worker = self.worker()?;
        let path = path.canonicalize().map_err(|_| err("input_unavailable"))?;
        let sig = signature(&path)?;
        let source_handle = Arc::new(File::open(&path).map_err(|_| err("input_unavailable"))?);
        if signature_metadata(
            source_handle
                .metadata()
                .map_err(|_| err("source_changed"))?,
        )? != sig
        {
            return Err(err("source_changed"));
        }
        let version = execute(
            &worker,
            &["capabilities".into()],
            &cancel,
            Duration::from_secs(5),
            None,
        )?;
        let v: serde_json::Value =
            serde_json::from_slice(&version).map_err(|_| err("runtime_unavailable"))?;
        if v["protocolVersion"] != 1
            || v["workingSampleType"] != "u8"
            || v["decodersAvailable"] != true
            || !v["runtimeVersion"]
                .as_str()
                .is_some_and(|s| s.starts_with("8."))
        {
            return Err(err("runtime_unavailable"));
        }
        let session = token()?;
        let dir = Arc::new(
            tempfile::Builder::new()
                .prefix(&session)
                .tempdir_in(self.0.root.path())
                .map_err(|_| err("storage_unavailable"))?,
        );
        let profile_path = dir.path().join("profile.partial");
        let raw = execute(
            &worker,
            &[
                "probe".into(),
                path.as_os_str().into(),
                profile_path.as_os_str().into(),
            ],
            &cancel,
            Duration::from_secs(15),
            Some((&path, &sig)),
        )?;
        if signature(&path)? != sig {
            return Err(err("source_changed"));
        }
        let metadata: Metadata =
            serde_json::from_slice(&raw).map_err(|_| err("worker_protocol"))?;
        metadata.validate()?;
        let mut asset = Asset {
            protocol_version: 1,
            asset_id: token()?,
            session,
            revision: 1,
            lease: token()?,
            metadata,
            content_hash: None,
            profile: None,
            raster_ref: None,
        };
        let mut state = self.0.state.lock().unwrap();
        if self.generation() != generation || cancel.load(Ordering::SeqCst) {
            return Err(err("cancelled"));
        }
        if state.assets.len() >= 16 {
            return Err(err("asset_budget"));
        }
        if let Some(ref hash) = asset.metadata.profile_hash {
            let b = fs::read(&profile_path).map_err(|_| err("worker_protocol"))?;
            if b.len() > 1024 * 1024 || format!("{:x}", Sha256::digest(&b)) != *hash {
                return Err(err("worker_protocol"));
            }
            let resource = make_resource(
                &asset,
                "profile",
                "application/vnd.iccprofile",
                b.len() as u64,
            )?;
            let target = dir.path().join(&resource.resource_id);
            fs::rename(profile_path, &target).map_err(|_| err("storage_unavailable"))?;
            state.used += resource.bytes;
            state.resources.insert(
                resource.resource_id.clone(),
                Published {
                    resource: resource.clone(),
                    path: target,
                    _dir: dir.clone(),
                    accessed: Instant::now(),
                },
            );
            asset.profile = Some(resource);
        }
        state.assets.insert(
            asset.asset_id.clone(),
            Record {
                asset: asset.clone(),
                source: path,
                source_handle,
                signature: sig,
                dir,
                valid: true,
                _durable: None,
            },
        );
        Ok(asset)
    }
    pub fn asset(&self, id: &str, revision: u64, lease: &str) -> Result<Asset> {
        let mut state = self.0.state.lock().unwrap();
        let record = state
            .assets
            .get_mut(id)
            .ok_or_else(|| err("lease_expired"))?;
        validate(record, revision, lease)?;
        Ok(record.asset.clone())
    }
    pub fn start(
        &self,
        id: &str,
        revision: u64,
        lease: &str,
        op: &str,
        edge: u32,
        timeout_ms: u64,
    ) -> Result<Job> {
        if !["preview", "cache", "original"].contains(&op)
            || timeout_ms == 0
            || timeout_ms > 120000
            || (op == "preview" && (edge == 0 || edge > 4096))
        {
            return Err(err("invalid_request"));
        }
        self.worker()?;
        let admission = self.admit()?;
        let mut state = self.0.state.lock().unwrap();
        if state.jobs.len() >= 4096
            || state
                .jobs
                .values()
                .filter(|j| j.job.phase == "running" || j.job.phase == "queued")
                .count()
                >= 4
        {
            return Err(err("busy"));
        }
        if op != "preview"
            && state.jobs.values().any(|j| {
                (j.job.phase == "running" || j.job.phase == "queued") && j.job.asset_id == id
            })
        {
            return Err(err("busy"));
        }
        let backgrounds = state.jobs.values().filter(|j| {
            (j.job.phase == "running" || j.job.phase == "queued") && j.kind != "preview"
        });
        if op != "preview" && backgrounds.into_iter().any(|j| j.kind == op) {
            return Err(err("busy"));
        }
        let record = state
            .assets
            .get_mut(id)
            .ok_or_else(|| err("lease_expired"))?;
        validate(record, revision, lease)?;
        if op != "original" && !record.asset.metadata.editing_supported {
            return Err(err("unsupported_precision"));
        }
        let durable_read = record._durable.clone();
        let source = record.source.clone();
        let sig = record.signature.clone();
        let asset = record.asset.clone();
        let dir = record.dir.clone();
        let job = Job {
            protocol_version: 1,
            job_id: token()?,
            asset_id: id.into(),
            revision,
            phase: "queued".into(),
            resource: None,
            content_hash: None,
            error: None,
        };
        let cancelled = Arc::new(AtomicBool::new(false));
        state.jobs.insert(
            job.job_id.clone(),
            Running {
                job: job.clone(),
                kind: op.into(),
                cancel: cancelled.clone(),
            },
        );
        drop(state);
        let service = self.clone();
        let op = op.to_owned();
        let j = job.clone();
        thread::spawn(move || {
            let _durable_read = durable_read;
            let _admission = admission;
            service.run_job(j, asset, source, sig, dir, op, edge, timeout_ms, cancelled)
        });
        Ok(job)
    }
    pub fn job(&self, id: &str) -> Result<Job> {
        self.0
            .state
            .lock()
            .unwrap()
            .jobs
            .get(id)
            .map(|j| j.job.clone())
            .ok_or_else(|| err("job_unknown"))
    }
    pub fn cancel(&self, id: &str) -> Result<()> {
        let state = self.0.state.lock().unwrap();
        let j = state.jobs.get(id).ok_or_else(|| err("job_unknown"))?;
        j.cancel.store(true, Ordering::SeqCst);
        Ok(())
    }
    pub fn authorize_job(&self, id: &str, lease: &str) -> Result<()> {
        let state = self.0.state.lock().unwrap();
        let r = state.assets.get(id).ok_or_else(|| err("lease_expired"))?;
        if r.asset.lease != lease {
            return Err(err("lease_expired"));
        }
        Ok(())
    }
    pub fn dispose_all(&self) {
        let mut state = self.0.state.lock().unwrap();
        self.0.generation.fetch_add(1, Ordering::SeqCst);
        for cancel in state.imports.values() {
            cancel.store(true, Ordering::SeqCst);
        }
        for j in state.jobs.values() {
            j.cancel.store(true, Ordering::SeqCst)
        }
        state.resources.clear();
        state.assets.clear();
        state
            .jobs
            .retain(|_, j| j.job.phase == "running" || j.job.phase == "queued");
        state.used = 0;
    }
    pub fn dispose(&self, id: &str, lease: &str) -> Result<()> {
        let mut state = self.0.state.lock().unwrap();
        let record = state.assets.get(id).ok_or_else(|| err("lease_expired"))?;
        if record.asset.lease != lease {
            return Err(err("lease_expired"));
        }
        for job in state.jobs.values() {
            if job.job.asset_id == id {
                job.cancel.store(true, Ordering::SeqCst);
            }
        }
        state.assets.remove(id);
        state.jobs.retain(|_, j| {
            j.job.asset_id != id || j.job.phase == "running" || j.job.phase == "queued"
        });
        let ids: Vec<_> = state
            .resources
            .iter()
            .filter(|(_, r)| r.resource.asset_id == id)
            .map(|(id, _)| id.clone())
            .collect();
        for id in ids {
            if let Some(r) = state.resources.remove(&id) {
                state.used = state.used.saturating_sub(r.resource.bytes);
            }
        }
        Ok(())
    }
    fn run_job(
        &self,
        job: Job,
        asset: Asset,
        source: PathBuf,
        sig: Signature,
        dir: Arc<tempfile::TempDir>,
        op: String,
        edge: u32,
        timeout_ms: u64,
        cancel: Arc<AtomicBool>,
    ) {
        {
            self.0
                .state
                .lock()
                .unwrap()
                .jobs
                .get_mut(&job.job_id)
                .unwrap()
                .job
                .phase = "running".into();
        }
        let result = (|| -> Result<(Resource, PathBuf, Option<String>, tempfile::TempDir, Option<PreparedBlob>)> {
            let stage = tempfile::Builder::new()
                .prefix("job-")
                .tempdir_in(dir.path())
                .map_err(|_| err("storage_unavailable"))?;
            let mut partial = stage.path().join("output.partial");
            let mut prepared = None;
            let mut hash = None;
            let mut display_size = None;
            if op == "original" {
                let original=self.0.store.prepare(&source,&cancel,Duration::from_millis(timeout_ms),|| {
                    if signature(&source)?!=sig {return Err(err("source_changed"));} Ok(())
                })?;
                partial=original.path.clone();
                hash=Some(original.hash.clone());
                prepared=Some(original);
            } else {
                let mut args = vec![
                    op.clone().into(),
                    source.as_os_str().into(),
                    partial.as_os_str().into(),
                ];
                if op == "preview" {
                    args.push(edge.to_string().into());
                }
                let response = execute(
                    &self.worker()?,
                    &args,
                    &cancel,
                    Duration::from_millis(timeout_ms),
                    Some((&source, &sig)),
                )?;
                if op == "preview" {
                    #[derive(Deserialize)]
                    struct PreviewSize {
                        width: u32,
                        height: u32,
                    }
                    let size: PreviewSize =
                        serde_json::from_slice(&response).map_err(|_| err("worker_protocol"))?;
                    if size.width == 0
                        || size.height == 0
                        || size.width > edge
                        || size.height > edge
                    {
                        return Err(err("worker_protocol"));
                    }
                    display_size = Some((size.width, size.height));
                }
            }
            if cancel.load(Ordering::SeqCst) {
                return Err(err("cancelled"));
            }
            if signature(&source)? != sig {
                return Err(err("source_changed"));
            }
            let bytes = fs::metadata(&partial)
                .map_err(|_| err("worker_protocol"))?
                .len();
            if bytes == 0
                || bytes
                    > if op == "original" {
                        INPUT_LIMIT
                    } else {
                        OUTPUT_LIMIT
                    }
                || (op == "preview" && bytes > 32 * 1024 * 1024)
            {
                return Err(err("output_budget"));
            }
            File::open(&partial)
                .and_then(|f| f.sync_all())
                .map_err(|_| err("storage_unavailable"))?;
            let mut resource = make_resource(
                &asset,
                &op,
                if op == "preview" {
                    "image/png"
                } else if op == "cache" {
                    "image/tiff"
                } else {
                    "application/octet-stream"
                },
                bytes,
            )?;
            if let Some((width, height)) = display_size {
                resource.width = Some(width);
                resource.height = Some(height);
            }
            Ok((resource, partial, hash, stage, prepared))
        })();
        let mut state = self.0.state.lock().unwrap();
        // Publication is one transaction against the live lease/revision and cancellation.
        let publication = (|| -> Result<(Resource, Option<String>)> {
            let (resource, partial, hash, _stage, prepared) = result?;
            if cancel.load(Ordering::SeqCst) {
                return Err(err("cancelled"));
            }
            let record = state
                .assets
                .get_mut(&asset.asset_id)
                .ok_or_else(|| err("lease_expired"))?;
            validate(record, asset.revision, &asset.lease)?;
            if state
                .used
                .checked_add(resource.bytes)
                .is_none_or(|n| n > TOTAL_LIMIT)
                || state
                    .resources
                    .values()
                    .filter(|r| r.resource.asset_id == asset.asset_id)
                    .count()
                    >= 16
            {
                return Err(err("storage_budget"));
            }
            let target = if let Some(original) = prepared {
                let profile = if let Some(ref p) = asset.profile {
                    let path = &state
                        .resources
                        .get(&p.resource_id)
                        .ok_or_else(|| err("resource_unknown"))?
                        .path;
                    Some(self.0.store.prepare(
                        path,
                        &cancel,
                        Duration::from_millis(timeout_ms),
                        || Ok(()),
                    )?)
                } else {
                    None
                };
                let reference = asset.raster_ref.clone().unwrap_or(RasterReference {
                    asset_id: asset.asset_id.clone(),
                    revision: asset.revision,
                });
                let stored = self.0.store.commit_original(
                    reference.clone(),
                    asset.metadata.clone(),
                    original,
                    profile,
                    ResourceRoot {
                        kind: "transaction".into(),
                        id: format!("import:{}", reference.asset_id),
                    },
                    &cancel,
                )?;
                let (_, durable) = self.0.store.lease_asset(&stored.reference)?;
                let path = self.0.store.blob_path(&stored.original_hash)?;
                let record = state.assets.get_mut(&asset.asset_id).unwrap();
                record.source_handle =
                    Arc::new(File::open(&path).map_err(|_| err("asset_missing"))?);
                record.signature = signature(&path)?;
                record.source = path.clone();
                record.asset.raster_ref = Some(reference);
                record._durable = Some(durable);
                path
            } else {
                let target = dir.path().join(&resource.resource_id);
                fs::rename(partial, &target).map_err(|_| err("storage_unavailable"))?;
                target
            };
            if let Some(ref h) = hash {
                state
                    .assets
                    .get_mut(&asset.asset_id)
                    .unwrap()
                    .asset
                    .content_hash = Some(h.clone());
            }
            state.used += resource.bytes;
            state.resources.insert(
                resource.resource_id.clone(),
                Published {
                    resource: resource.clone(),
                    path: target,
                    _dir: dir,
                    accessed: Instant::now(),
                },
            );
            Ok((resource, hash))
        })();
        if let Err(ref e) = publication {
            if e.code == "source_changed" {
                // A concurrent preview may still use the external source after
                // original publication switched the record to its durable copy.
                // Its failed source check must not invalidate that committed asset.
                let invalidate = state
                    .assets
                    .get(&asset.asset_id)
                    .is_some_and(|r| r.source == source);
                if invalidate {
                    if let Some(r) = state.assets.get_mut(&asset.asset_id) {
                        r.valid = false;
                        r.asset.revision += 1;
                    }
                }
                for j in state.jobs.values().filter(|_| invalidate) {
                    if j.job.asset_id == asset.asset_id {
                        j.cancel.store(true, Ordering::SeqCst)
                    }
                }
            }
        }
        if !state.assets.contains_key(&asset.asset_id) {
            state.jobs.remove(&job.job_id);
            return;
        }
        let target = &mut state.jobs.get_mut(&job.job_id).unwrap().job;
        match publication {
            Ok((r, h)) => {
                target.phase = "ready".into();
                target.resource = Some(r);
                target.content_hash = h
            }
            Err(e) => {
                target.phase = match e.code.as_str() {
                    "cancelled" => "cancelled",
                    "timed_out" => "timed_out",
                    "runtime_unavailable" => "unavailable",
                    _ => "failed",
                }
                .into();
                target.error = Some(e)
            }
        }
    }
    /// A read lease owns the private directory until the protocol read finishes.
    pub fn resource_file(
        &self,
        session: &str,
        id: &str,
        revision: u64,
    ) -> Result<(File, Resource, ResourceFileLease)> {
        let mut state = self.0.state.lock().unwrap();
        let published = state
            .resources
            .get(id)
            .ok_or_else(|| err("resource_unknown"))?;
        let asset_id = published.resource.asset_id.clone();
        let record = state
            .assets
            .get_mut(&asset_id)
            .ok_or_else(|| err("lease_expired"))?;
        let lease = record.asset.lease.clone();
        validate(record, revision, &lease)?;
        if record.asset.session != session {
            return Err(err("lease_expired"));
        }
        let durable = record._durable.clone();
        let published = state.resources.get_mut(id).unwrap();
        published.accessed = Instant::now();
        if published.resource.revision != revision {
            return Err(err("revision_stale"));
        }
        Ok((
            File::open(&published.path).map_err(|_| err("resource_unknown"))?,
            published.resource.clone(),
            ResourceFileLease {
                _directory: published._dir.clone(),
                _durable: durable,
            },
        ))
    }
}
fn validate(record: &mut Record, revision: u64, lease: &str) -> Result<()> {
    if !record.valid || record.asset.lease != lease {
        return Err(err("lease_expired"));
    }
    if record.asset.revision != revision {
        return Err(err("revision_stale"));
    }
    if signature(&record.source).ok().as_ref() != Some(&record.signature)
        || record
            .source_handle
            .metadata()
            .ok()
            .and_then(|m| signature_metadata(m).ok())
            .as_ref()
            != Some(&record.signature)
    {
        record.valid = false;
        record.asset.revision += 1;
        return Err(err("source_changed"));
    }
    Ok(())
}
fn make_resource(asset: &Asset, role: &str, mime: &str, bytes: u64) -> Result<Resource> {
    Ok(Resource {
        resource_id: token()?,
        session: asset.session.clone(),
        asset_id: asset.asset_id.clone(),
        revision: asset.revision,
        mime: mime.into(),
        bytes,
        role: role.into(),
        width: if role == "cache" || role == "original" {
            Some(asset.metadata.width)
        } else {
            None
        },
        height: if role == "cache" || role == "original" {
            Some(asset.metadata.height)
        } else {
            None
        },
        coordinate_space: if role == "profile" {
            None
        } else {
            Some(
                if role == "preview" {
                    "display"
                } else {
                    "source"
                }
                .into(),
            )
        },
        display_transform_hash: if role == "preview" {
            Some(format!(
                "{:x}",
                Sha256::digest(b"li03:v1:embedded-or-srgb:srgb:exif:display-only")
            ))
        } else {
            None
        },
    })
}
fn execute(
    worker: &Path,
    args: &[std::ffi::OsString],
    cancel: &AtomicBool,
    timeout: Duration,
    source: Option<(&Path, &Signature)>,
) -> Result<Vec<u8>> {
    let scratch = tempfile::Builder::new()
        .prefix("draivio-worker-scratch-")
        .tempdir()
        .map_err(|_| err("storage_unavailable"))?;
    let mut child = Command::new(worker)
        .args(args)
        .env("TMPDIR", scratch.path())
        .env("TMP", scratch.path())
        .env("TEMP", scratch.path())
        .env("VIPS_DISC_THRESHOLD", "128m")
        .env("VIPS_CONCURRENCY", "2")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| err("runtime_unavailable"))?;
    let stdout = child.stdout.take().unwrap();
    let oversized = Arc::new(AtomicBool::new(false));
    let flag = oversized.clone();
    let reader = thread::spawn(move || {
        let mut b = Vec::new();
        let r = stdout.take(4097).read_to_end(&mut b);
        if b.len() > 4096 {
            flag.store(true, Ordering::SeqCst)
        }
        (r, b)
    });
    let start = Instant::now();
    let status = loop {
        let failure = if source.is_some_and(|(p, s)| signature(p).ok().as_ref() != Some(s)) {
            Some("source_changed")
        } else if cancel.load(Ordering::SeqCst) {
            Some("cancelled")
        } else if start.elapsed() > timeout {
            Some("timed_out")
        } else if oversized.load(Ordering::SeqCst) {
            Some("worker_protocol")
        } else {
            None
        };
        if let Some(code) = failure {
            let _ = child.kill();
            let _ = child.wait();
            let _ = reader.join();
            return Err(err(code));
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(10)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                let _ = reader.join();
                return Err(err("worker_crashed"));
            }
        }
    };
    let (read, b) = reader.join().map_err(|_| err("worker_protocol"))?;
    read.map_err(|_| err("worker_protocol"))?;
    if b.len() > 4096 {
        return Err(err("worker_protocol"));
    }
    if !status.success() {
        return Err(err(match status.code() {
            Some(64) => "invalid_request",
            Some(65) => "decode_invalid",
            Some(66) => "unsupported_precision",
            Some(67) => "metadata_budget",
            Some(70) => "runtime_unavailable",
            _ => {
                if args.first().is_some_and(|a| a == "capabilities") {
                    "runtime_unavailable"
                } else {
                    "worker_crashed"
                }
            }
        }));
    }
    Ok(b)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn service() -> ImageAssets {
        ImageAssets::new(Some({
            let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
            let p = root.join("image-worker/bin/draivio-image-worker");
            if p.exists() {
                p
            } else {
                root.join("../bin/draivio-image-worker")
                    .canonicalize()
                    .unwrap()
            }
        }))
        .unwrap()
    }
    fn wait_for_store_release(store: &Arc<ResourceStore>) {
        let deadline = Instant::now() + Duration::from_secs(5);
        while Arc::strong_count(store) > 1 && Instant::now() < deadline {
            thread::sleep(Duration::from_millis(1));
        }
        assert_eq!(
            Arc::strong_count(store),
            1,
            "background owners have not shut down"
        );
    }
    fn fixture(name: &str) -> std::path::PathBuf {
        std::path::PathBuf::from("/tmp/draivio-large-images").join(name)
    }
    fn wait(s: &ImageAssets, j: &Job) -> Job {
        for _ in 0..1500 {
            let v = s.job(&j.job_id).unwrap();
            if v.phase != "running" && v.phase != "queued" {
                return v;
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        panic!("job did not finish")
    }
    #[test]
    fn real_import_is_private_and_metadata_small() {
        let s = service();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let b = s.import(fixture("odd-alpha.png")).unwrap();
        assert_ne!(a.asset_id, b.asset_id);
        assert_ne!(a.session, b.session);
        assert!(serde_json::to_vec(&a).unwrap().len() < 4096);
        assert_eq!(a.metadata.sample_type, "u8");
        let p = s
            .start(&a.asset_id, a.revision, &a.lease, "preview", 512, 10000)
            .unwrap();
        let p = wait(&s, &p);
        assert_eq!(p.phase, "ready", "{p:?}");
        let resource = p.resource.unwrap();
        assert_eq!(resource.coordinate_space.as_deref(), Some("display"));
        assert!(resource.width.unwrap() <= 512);
        assert!(resource.height.unwrap() <= 512);
    }
    #[test]
    fn native_source_identity_is_hash_only_after_independent_copy() {
        let s = service();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let j = s
            .start(&a.asset_id, a.revision, &a.lease, "original", 0, 10000)
            .unwrap();
        let j = wait(&s, &j);
        assert_eq!(j.phase, "ready", "{j:?}");
        assert_eq!(j.content_hash.unwrap().len(), 64);
        assert!(
            s.asset(&a.asset_id, a.revision, &a.lease)
                .unwrap()
                .content_hash
                .is_some()
        );
    }
    #[test]
    fn durable_original_survives_external_source_deletion() {
        let s = service();
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("external.png");
        fs::copy(fixture("odd-alpha.png"), &p).unwrap();
        let a = s.import(p.clone()).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        fs::remove_file(p).unwrap();
        let restored = s.asset(&a.asset_id, 1, &a.lease);
        assert!(
            restored.is_ok(),
            "committed original still depends on external source: {restored:?}"
        );
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 512, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
    }
    #[test]
    fn restart_reopens_independent_document_leases_and_lru_keeps_original() {
        let d = tempfile::tempdir().unwrap();
        let store = Arc::new(ResourceStore::open(d.path().join("resources")).unwrap());
        let s = ImageAssets::with_store(Some(service().worker().unwrap()), store.clone()).unwrap();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        let reference = s
            .asset(&a.asset_id, 1, &a.lease)
            .unwrap()
            .raster_ref
            .unwrap();
        drop(s);
        wait_for_store_release(&store);
        drop(store);
        let store = Arc::new(ResourceStore::open(d.path().join("resources")).unwrap());
        let s = ImageAssets::with_store(Some(service().worker().unwrap()), store.clone()).unwrap();
        let a = s.reopen(&reference).unwrap();
        let b = s.reopen(&reference).unwrap();
        assert_ne!(a.asset_id, b.asset_id);
        assert_ne!(a.lease, b.lease);
        s.dispose(&a.asset_id, &a.lease).unwrap();
        assert!(s.asset(&b.asset_id, 1, &b.lease).is_ok());
        let j = s
            .start(&b.asset_id, 1, &b.lease, "preview", 512, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        s.evict_display_cache(0);
        assert!(s.asset(&b.asset_id, 1, &b.lease).is_ok());
        let j = s
            .start(&b.asset_id, 1, &b.lease, "preview", 512, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        store
            .replace_root(
                &ResourceRoot {
                    kind: "transaction".into(),
                    id: format!("import:{}", reference.asset_id),
                },
                &[],
            )
            .unwrap();
        assert_eq!(
            store.collect_unrooted().unwrap(),
            0,
            "live runtime read protects original"
        );
        s.dispose(&b.asset_id, &b.lease).unwrap();
        assert_eq!(store.collect_unrooted().unwrap(), 1);
    }
    #[test]
    fn reopened_original_uses_stable_import_root_and_releases_all_content() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("resources");
        let store = Arc::new(ResourceStore::open(root.clone()).unwrap());
        let s = ImageAssets::with_store(Some(service().worker().unwrap()), store.clone()).unwrap();
        let owner = ResourceRoot {
            kind: "document".into(),
            id: "document-a".into(),
        };
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        let reference = s
            .asset(&a.asset_id, 1, &a.lease)
            .unwrap()
            .raster_ref
            .unwrap();
        s.claim_import(&owner, &reference).unwrap();
        s.dispose(&a.asset_id, &a.lease).unwrap();
        let reopened = s.reopen(&reference).unwrap();
        assert_ne!(reopened.asset_id, reference.asset_id);
        let j = s
            .start(&reopened.asset_id, 1, &reopened.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        s.claim_import(&owner, &reference).unwrap();
        for kind in ["undo", "redo"] {
            s.replace_root(
                &ResourceRoot {
                    kind: kind.into(),
                    id: owner.id.clone(),
                },
                std::slice::from_ref(&reference),
            )
            .unwrap();
        }
        s.replace_roots(&["document", "undo", "redo"].map(|kind| {
            (
                ResourceRoot {
                    kind: kind.into(),
                    id: owner.id.clone(),
                },
                vec![],
            )
        }))
        .unwrap();
        s.dispose(&reopened.asset_id, &reopened.lease).unwrap();
        drop(s);
        wait_for_store_release(&store);
        assert_eq!(
            store.collect_unrooted().unwrap(),
            1,
            "runtime import root must not leak the original"
        );
        assert!(store.resolve(&reference).is_err());
        drop(store);
        let restarted = ResourceStore::open(root.clone()).unwrap();
        assert!(restarted.resolve(&reference).is_err());
        assert_eq!(restarted.collect_unrooted().unwrap(), 0);
        assert_eq!(fs::read_dir(root.join("blobs")).unwrap().count(), 0);
    }
    #[test]
    fn embedded_profile_is_durable_and_has_its_own_runtime_resource_after_restart() {
        let d = tempfile::tempdir().unwrap();
        let root = d.path().join("resources");
        let store = Arc::new(ResourceStore::open(root.clone()).unwrap());
        let worker = service().worker().unwrap();
        let s = ImageAssets::with_store(Some(worker.clone()), store.clone()).unwrap();
        let a = s.import(fixture("baseline-icc-exif.jpg")).unwrap();
        assert!(a.profile.is_some());
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        let reference = s
            .asset(&a.asset_id, 1, &a.lease)
            .unwrap()
            .raster_ref
            .unwrap();
        drop(s);
        wait_for_store_release(&store);
        drop(store);
        let s = ImageAssets::with_store(Some(worker), Arc::new(ResourceStore::open(root).unwrap()))
            .unwrap();
        let a = s.reopen(&reference).unwrap();
        let profile = a.profile.unwrap();
        let (mut f, _, _guard) = s
            .resource_file(&a.session, &profile.resource_id, 1)
            .unwrap();
        let mut bytes = vec![];
        f.read_to_end(&mut bytes).unwrap();
        assert_eq!(
            Some(format!("{:x}", Sha256::digest(bytes))),
            a.metadata.profile_hash
        );
    }
    #[test]
    fn revision_and_lease_gate_every_operation() {
        let s = service();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        assert!(
            s.start(&a.asset_id, 2, &a.lease, "preview", 512, 1000)
                .is_err()
        );
        assert!(
            s.start(&a.asset_id, 1, "fake", "preview", 512, 1000)
                .is_err()
        );
        s.dispose(&a.asset_id, &a.lease).unwrap();
        assert!(s.asset(&a.asset_id, 1, &a.lease).is_err());
    }
    #[test]
    fn real_cancel_and_timeout_never_publish() {
        let s = service();
        let a = s.import(fixture("600mp-rgb.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 4096, 10000)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));
        s.cancel(&j.job_id).unwrap();
        assert_eq!(wait(&s, &j).phase, "cancelled");
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 4096, 1)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "timed_out");
    }
    #[test]
    fn source_mutation_invalidates_revision_and_stale_output() {
        let s = service();
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("image.png");
        std::fs::copy(fixture("600mp-rgb.png"), &p).unwrap();
        let a = s.import(p.clone()).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 4096, 10000)
            .unwrap();
        std::thread::sleep(std::time::Duration::from_millis(100));
        use std::io::Write;
        std::fs::OpenOptions::new()
            .append(true)
            .open(p)
            .unwrap()
            .write_all(b"changed")
            .unwrap();
        let j = wait(&s, &j);
        assert_eq!(j.error.unwrap().code, "source_changed");
        assert!(j.resource.is_none());
        assert!(s.asset(&a.asset_id, 1, &a.lease).is_err());
    }
    #[test]
    fn missing_and_crashed_runtime_are_structured() {
        let s = ImageAssets::new(None).unwrap();
        assert_eq!(
            s.import(fixture("odd-alpha.png")).unwrap_err().code,
            "runtime_unavailable"
        );
        let s = ImageAssets::new(Some("/bin/false".into())).unwrap();
        assert_eq!(
            s.import(fixture("odd-alpha.png")).unwrap_err().code,
            "runtime_unavailable"
        );
    }
    #[cfg(unix)]
    fn shell_worker(body: &str) -> (tempfile::TempDir, PathBuf) {
        use std::os::unix::fs::PermissionsExt;
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("worker");
        fs::write(&p, body).unwrap();
        fs::set_permissions(&p, fs::Permissions::from_mode(0o700)).unwrap();
        (d, p)
    }
    #[cfg(unix)]
    #[test]
    fn mid_job_native_crash_does_not_poison_next_job_or_leave_staging() {
        let real = service().worker().unwrap();
        let (_script, p) = shell_worker(&format!(
            "#!/bin/sh\nif [ \"$1\" = preview ]; then\n '{}' \"$@\" &\n pid=$!\n (sleep 0.1; kill -KILL $pid 2>/dev/null) &\n wait $pid\n exit $?\nfi\nexec '{}' \"$@\"\n",
            real.display(),
            real.display()
        ));
        let s = ImageAssets::new(Some(p)).unwrap();
        let a = s.import(fixture("600mp-rgb.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 4096, 10000)
            .unwrap();
        let j = wait(&s, &j);
        assert_eq!(j.error.unwrap().code, "worker_crashed");
        assert!(j.resource.is_none());
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        let state = s.0.state.lock().unwrap();
        let dir = state.assets.get(&a.asset_id).unwrap().dir.path();
        assert!(
            fs::read_dir(dir)
                .unwrap()
                .all(|e| !e.unwrap().path().is_dir())
        );
    }
    #[test]
    fn published_binary_range_lease_and_revision_are_enforced() {
        let s = service();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "preview", 512, 10000)
            .unwrap();
        let r = wait(&s, &j).resource.unwrap();
        let uri = format!(
            "draivio-image://localhost/{}/{}?revision=1",
            a.session, r.resource_id
        );
        let whole = crate::image_protocol::read_resource(&s, &uri, None).unwrap();
        assert_eq!(&whole.bytes[..8], b"\x89PNG\r\n\x1a\n");
        let part = crate::image_protocol::read_resource(&s, &uri, Some("bytes=0-7")).unwrap();
        assert_eq!(part.status, 206);
        assert_eq!(part.bytes, whole.bytes[..8]);
        assert!(crate::image_protocol::read_resource(&s, &uri, Some("bytes=0-9999999")).is_err());
        assert!(
            crate::image_protocol::read_resource(
                &s,
                &uri.replace(&a.session, &"f".repeat(48)),
                None
            )
            .is_err()
        );
        assert!(
            crate::image_protocol::read_resource(
                &s,
                &uri.replace("revision=1", "revision=2"),
                None
            )
            .is_err()
        );
        let (mut held, _, _guard) = s.resource_file(&a.session, &r.resource_id, 1).unwrap();
        s.dispose(&a.asset_id, &a.lease).unwrap();
        assert!(crate::image_protocol::read_resource(&s, &uri, None).is_err());
        let mut b = vec![];
        held.read_to_end(&mut b).unwrap();
        assert_eq!(b, whole.bytes);
    }
    #[test]
    fn disposing_releases_terminal_job_records() {
        let s = service();
        let a = s.import(fixture("odd-alpha.png")).unwrap();
        let j = s
            .start(&a.asset_id, 1, &a.lease, "original", 0, 10000)
            .unwrap();
        assert_eq!(wait(&s, &j).phase, "ready");
        s.dispose(&a.asset_id, &a.lease).unwrap();
        assert!(s.0.state.lock().unwrap().jobs.is_empty());
    }
    #[cfg(unix)]
    #[test]
    fn imports_share_native_process_admission() {
        let real = service().worker().unwrap();
        let (_script, p) = shell_worker(&format!(
            "#!/bin/sh\nsleep 0.5\nexec '{}' \"$@\"\n",
            real.display()
        ));
        let s = ImageAssets::new(Some(p)).unwrap();
        let jobs: Vec<_> = (0..8)
            .map(|_| {
                let s = s.clone();
                thread::spawn(move || s.import(fixture("odd-alpha.png")))
            })
            .collect();
        let mut busy = 0;
        for j in jobs {
            if let Err(e) = j.join().unwrap() {
                assert_eq!(e.code, "busy");
                busy += 1;
            }
        }
        assert!(busy >= 4);
    }
    #[cfg(unix)]
    #[test]
    fn preserved_mtime_inplace_write_still_invalidates_source() {
        let d = tempfile::tempdir().unwrap();
        let p = d.path().join("image.png");
        fs::copy(fixture("odd-alpha.png"), &p).unwrap();
        let s = service();
        let a = s.import(p.clone()).unwrap();
        let f = fs::OpenOptions::new().write(true).open(&p).unwrap();
        let original = fs::metadata(&p).unwrap().modified().unwrap();
        let bytes = fs::read(&p).unwrap();
        thread::sleep(Duration::from_millis(10));
        use std::os::unix::fs::FileExt;
        f.write_at(&[bytes[bytes.len() - 1] ^ 1], (bytes.len() - 1) as u64)
            .unwrap();
        f.set_modified(original).unwrap();
        assert!(s.asset(&a.asset_id, 1, &a.lease).is_err());
    }
    #[cfg(unix)]
    #[test]
    fn disposing_window_cancels_probe_and_prevents_late_import_publication() {
        let real = service().worker().unwrap();
        let marker_dir = tempfile::tempdir().unwrap();
        let marker = marker_dir.path().join("started");
        let (_script, p) = shell_worker(&format!(
            "#!/bin/sh\nif [ \"$1\" = probe ]; then\n touch '{}'\n exec '{}' preview /tmp/draivio-large-images/600mp-rgb.png \"$3\" 4096\nfi\nexec '{}' \"$@\"\n",
            marker.display(),
            real.display(),
            real.display()
        ));
        let s = ImageAssets::new(Some(p)).unwrap();
        let importing = s.clone();
        let task = thread::spawn(move || importing.import(fixture("odd-alpha.png")));
        // Wait for the real probe handshake, not an assumed start latency.
        // Capabilities itself has a 5s production deadline, so the former 1s
        // polling window could expire before it under parallel native tests.
        let handshake_started = Instant::now();
        while !marker.exists()
            && !task.is_finished()
            && handshake_started.elapsed() < Duration::from_secs(10)
        {
            thread::sleep(Duration::from_millis(10));
        }
        if !marker.exists() {
            let result = task.join().unwrap();
            panic!(
                "probe handshake absent after {:?}; import returned {result:?}",
                handshake_started.elapsed()
            );
        }
        s.dispose_all();
        let result = task.join().unwrap();
        assert_eq!(result.unwrap_err().code, "cancelled");
        let state = s.0.state.lock().unwrap();
        assert!(state.assets.is_empty());
        assert!(state.resources.is_empty());
    }
}
