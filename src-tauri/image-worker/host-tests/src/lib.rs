#[path="../../../src/image_assets.rs"]
pub mod image_assets;
#[path="../../../src/image_protocol.rs"]
pub mod image_protocol;
#[path="../../../src/image_resource_store.rs"]
pub mod image_resource_store;
#[path="../../../src/project_container.rs"]
pub mod project_container;
#[path="../../../src/image_tiles.rs"]
pub mod image_tiles;

#[cfg(test)]
mod tile_contract_tests {
    use super::image_tiles::*;

    #[test]
    fn level_dimensions_use_ceil_for_odd_edges() {
        assert_eq!(level_dimensions(5, 3, 0), (5, 3));
        assert_eq!(level_dimensions(5, 3, 1), (3, 2));
        assert_eq!(level_dimensions(5, 3, 2), (2, 1));
    }

    #[test]
    fn tile_bounds_clip_at_level_edges() {
        let b = checked_tile_bounds(5, 3, 0, 1, 0, 4).unwrap();
        assert_eq!(b, TileBounds { x: 4, y: 0, width: 1, height: 3 });
        assert!(checked_tile_bounds(5, 3, 0, 2, 0, 4).is_err());
    }

    #[test]
    fn cache_publish_is_atomic_and_rejects_incomplete_index() {
        let root = tempfile::tempdir().unwrap();
        let cache = TileCache::new(root.path().to_path_buf(), 1024 * 1024).unwrap();
        let key = TileCacheKey { asset_id: "a".into(), revision: 1, cache_version: 1 };
        let mut staging = cache.begin(key.clone()).unwrap();
        staging.write_index(TileIndex::new(5, 3, 4, 1)).unwrap();
        assert!(!cache.is_ready(&key));
        staging.publish().unwrap();
        assert!(cache.is_ready(&key));
    }

    #[test]
    fn cancelled_staging_is_removed_and_corrupt_cache_is_hidden() {
        let root = tempfile::tempdir().unwrap();
        let cache = TileCache::new(root.path().to_path_buf(), 1024).unwrap();
        let key = TileCacheKey { asset_id: "cancel".into(), revision: 1, cache_version: 1 };
        let mut staging = cache.begin(key.clone()).unwrap();
        staging.write_index(TileIndex::new(2, 2, 2, 1)).unwrap();
        drop(staging);
        assert!(!cache.is_ready(&key));
        let mut staging = cache.begin(key.clone()).unwrap();
        staging.write_index(TileIndex::new(2, 2, 2, 1)).unwrap();
        staging.write_tile(0, 0, 0, &[1, 2, 3, 4]).unwrap();
        staging.publish().unwrap();
        let tile = cache.read_tile(&key, 0, 0, 0).unwrap();
        assert_eq!(tile, vec![1, 2, 3, 4]);
        std::fs::remove_file(root.path().join("cancel-r1-v1/tiles/0-0-0.rgba")).unwrap();
        assert!(cache.read_tile(&key, 0, 0, 0).is_err());
    }

    #[test]
    fn prepare_reads_source_once_and_preserves_rgba_edge_pixels() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("fixture.png");
        let mut image = image::RgbaImage::new(5, 3);
        for (i, pixel) in image.pixels_mut().enumerate() { *pixel = image::Rgba([i as u8, 7, 9, 255]); }
        image.save(&source).unwrap();
        let cache = TileCache::new(root.path().join("cache"), 1024 * 1024).unwrap();
        let key = TileCacheKey { asset_id: "fixture".into(), revision: 1, cache_version: 1 };
        let index = prepare_rgba_cache(&source, &cache, key.clone(), 4, 2).unwrap();
        assert_eq!(index.levels.iter().map(|l| (l.width, l.height)).collect::<Vec<_>>(), vec![(5,3),(3,2)]);
        let edge = cache.read_tile(&key, 0, 1, 0).unwrap();
        assert_eq!(&edge[0..4], &[4, 7, 9, 255]);
    }
}
