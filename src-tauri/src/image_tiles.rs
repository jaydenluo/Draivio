//! Lossless raster tile and LOD cache primitives.
//!
//! The cache is deliberately independent from display resources: it stores RGBA8
//! source pixels in a staging directory and publishes the directory with one
//! atomic rename only after its index and every tile have been written.
use serde::{Deserialize, Serialize};
use std::{fs, io::{self, Write}, path::{Path, PathBuf}};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileBounds { pub x: u32, pub y: u32, pub width: u32, pub height: u32 }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileLevel { pub level: u32, pub width: u32, pub height: u32 }

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TileIndex {
    pub width: u32, pub height: u32, pub tile_size: u32, pub bands: u8,
    pub sample_type: String, pub levels: Vec<TileLevel>, pub ready: bool,
}
impl TileIndex {
    pub fn new(width: u32, height: u32, tile_size: u32, levels: u32) -> Self {
        let levels = (0..levels.max(1)).map(|level| {
            let (width, height) = level_dimensions(width, height, level);
            TileLevel { level, width, height }
        }).collect();
        Self { width, height, tile_size, bands: 4, sample_type: "u8".into(), levels, ready: false }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct TileCacheKey { pub asset_id: String, pub revision: u64, pub cache_version: u32 }

#[derive(Debug)]
pub enum TileError { Io(io::Error), InvalidBounds, Quota, Corrupt, Unsupported }
impl From<io::Error> for TileError { fn from(e: io::Error) -> Self { Self::Io(e) } }
pub type TileResult<T> = Result<T, TileError>;

pub fn level_dimensions(width: u32, height: u32, level: u32) -> (u32, u32) {
    let divisor = 1u64.checked_shl(level.min(31)).unwrap_or(u64::MAX);
    (((u64::from(width) + divisor - 1) / divisor) as u32,
     ((u64::from(height) + divisor - 1) / divisor) as u32)
}

pub fn checked_tile_bounds(width: u32, height: u32, level: u32, tile_x: u32, tile_y: u32, tile_size: u32) -> TileResult<TileBounds> {
    if tile_size == 0 { return Err(TileError::InvalidBounds); }
    let (lw, lh) = level_dimensions(width, height, level);
    let x = tile_x.checked_mul(tile_size).ok_or(TileError::InvalidBounds)?;
    let y = tile_y.checked_mul(tile_size).ok_or(TileError::InvalidBounds)?;
    if x >= lw || y >= lh { return Err(TileError::InvalidBounds); }
    Ok(TileBounds { x, y, width: tile_size.min(lw - x), height: tile_size.min(lh - y) })
}

pub struct TileCache { root: PathBuf, quota: u64 }
impl TileCache {
    pub fn new(root: PathBuf, quota: u64) -> TileResult<Self> { fs::create_dir_all(&root)?; Ok(Self { root, quota }) }
    fn name(key: &TileCacheKey) -> String { format!("{}-r{}-v{}", key.asset_id, key.revision, key.cache_version) }
    fn final_dir(&self, key: &TileCacheKey) -> PathBuf { self.root.join(Self::name(key)) }
    pub fn begin(&self, key: TileCacheKey) -> TileResult<StagingCache> {
        let dir = self.root.join(format!(".{}.staging-{}", Self::name(&key), std::process::id()));
        if dir.exists() { fs::remove_dir_all(&dir)?; }
        fs::create_dir_all(dir.join("tiles"))?;
        Ok(StagingCache { dir, final_dir: self.final_dir(&key), quota: self.quota, bytes: 0, index: None })
    }
    pub fn is_ready(&self, key: &TileCacheKey) -> bool {
        let p = self.final_dir(key).join("index.json");
        fs::read(p).ok().and_then(|b| serde_json::from_slice::<TileIndex>(&b).ok()).is_some_and(|i| i.ready)
    }
    pub fn read_tile(&self, key: &TileCacheKey, level: u32, x: u32, y: u32) -> TileResult<Vec<u8>> {
        if !self.is_ready(key) { return Err(TileError::Corrupt); }
        let path = self.final_dir(key).join("tiles").join(format!("{level}-{x}-{y}.rgba"));
        let bytes = fs::read(path).map_err(TileError::Io)?;
        if bytes.is_empty() { return Err(TileError::Corrupt); }
        Ok(bytes)
    }
}

pub struct StagingCache { dir: PathBuf, final_dir: PathBuf, quota: u64, bytes: u64, index: Option<TileIndex> }
impl StagingCache {
    pub fn write_index(&mut self, mut index: TileIndex) -> TileResult<()> {
        index.ready = false;
        fs::write(self.dir.join("index.json"), serde_json::to_vec(&index).map_err(|_| TileError::Corrupt)?)?;
        self.index = Some(index); Ok(())
    }
    pub fn write_tile(&mut self, level: u32, x: u32, y: u32, bytes: &[u8]) -> TileResult<()> {
        let index = self.index.as_ref().ok_or(TileError::Corrupt)?;
        let l = index.levels.iter().find(|l| l.level == level).ok_or(TileError::InvalidBounds)?;
        checked_tile_bounds(index.width, index.height, level, x, y, index.tile_size)?;
        let next = self.bytes.saturating_add(bytes.len() as u64);
        if next > self.quota { return Err(TileError::Quota); }
        let path = self.dir.join("tiles").join(format!("{level}-{x}-{y}.rgba"));
        let mut file = fs::File::create(path)?; file.write_all(bytes)?; file.sync_all()?;
        self.bytes = next; let _ = l; Ok(())
    }
    pub fn publish(mut self) -> TileResult<()> {
        let mut index = self.index.take().ok_or(TileError::Corrupt)?;
        index.ready = true;
        let data = serde_json::to_vec(&index).map_err(|_| TileError::Corrupt)?;
        let mut f = fs::File::create(self.dir.join("index.json"))?; f.write_all(&data)?; f.sync_all()?;
        if self.final_dir.exists() { fs::remove_dir_all(&self.final_dir)?; }
        fs::rename(&self.dir, &self.final_dir)?;
        Ok(())
    }
}
impl Drop for StagingCache { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.dir); } }

/// Decode once and generate all LODs in memory, writing each tile in scan order.
pub fn prepare_rgba_cache(source: &Path, cache: &TileCache, key: TileCacheKey, tile_size: u32, levels: u32) -> TileResult<TileIndex> {
    prepare_rgba_cache_cancelable(source, cache, key, tile_size, levels, || false)
}

pub fn prepare_rgba_cache_cancelable<F: Fn() -> bool>(source: &Path, cache: &TileCache, key: TileCacheKey, tile_size: u32, levels: u32, cancelled: F) -> TileResult<TileIndex> {
    let base = image::open(source).map_err(|_| TileError::Unsupported)?.to_rgba8();
    let mut stage = cache.begin(key)?;
    let mut index = TileIndex::new(base.width(), base.height(), tile_size, levels);
    stage.write_index(index.clone())?;
    let mut image = base;
    for level in 0..levels.max(1) {
        let (w, h) = level_dimensions(index.width, index.height, level);
        if image.width() != w || image.height() != h { image = image::imageops::resize(&image, w, h, image::imageops::FilterType::Triangle); }
        for ty in 0..h.div_ceil(tile_size) { for tx in 0..w.div_ceil(tile_size) {
            if cancelled() { return Err(TileError::Corrupt); }
            let b = checked_tile_bounds(index.width, index.height, level, tx, ty, tile_size)?;
            let mut bytes = Vec::with_capacity((b.width * b.height * 4) as usize);
            for row in b.y..b.y+b.height { let start = ((row * w + b.x) * 4) as usize; let end = start + (b.width * 4) as usize; bytes.extend_from_slice(&image.as_raw()[start..end]); }
            stage.write_tile(level, tx, ty, &bytes)?;
        }}
    }
    stage.publish()?; index.ready = true; Ok(index)
}
