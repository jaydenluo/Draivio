//! Strict opaque lookup: no URL component is interpreted as a filesystem path.
use crate::image_assets::{AssetError, ImageAssets};
use std::io::{Read, Seek, SeekFrom};
use std::sync::atomic::{AtomicUsize, Ordering};
static READS: AtomicUsize = AtomicUsize::new(0);
struct ReadPermit;
impl Drop for ReadPermit {
    fn drop(&mut self) {
        READS.fetch_sub(1, Ordering::SeqCst);
    }
}
pub fn parse_resource_uri(uri: &str) -> Result<(String, String, u64), AssetError> {
    let tail = uri
        .strip_prefix("draivio-image://localhost/")
        .or_else(|| uri.strip_prefix("http://draivio-image.localhost/"))
        .or_else(|| uri.strip_prefix("https://draivio-image.localhost/"))
        .ok_or_else(|| AssetError::new("invalid_resource_uri"))?;
    if tail.len() > 160 {
        return Err(AssetError::new("invalid_resource_uri"));
    }
    let (path, revision) = tail
        .split_once("?revision=")
        .ok_or_else(|| AssetError::new("invalid_resource_uri"))?;
    if revision.is_empty()
        || revision.starts_with('0')
        || !revision.bytes().all(|b| b.is_ascii_digit())
    {
        return Err(AssetError::new("invalid_resource_uri"));
    }
    let revision = revision
        .parse::<u64>()
        .map_err(|_| AssetError::new("invalid_resource_uri"))?;
    let (session, id) = path
        .split_once('/')
        .ok_or_else(|| AssetError::new("invalid_resource_uri"))?;
    if [session, id].iter().any(|t| {
        t.len() != 48
            || !t
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }) {
        return Err(AssetError::new("invalid_resource_uri"));
    }
    Ok((session.into(), id.into(), revision))
}
pub struct ResourceResponse {
    pub status: u16,
    pub mime: String,
    pub bytes: Vec<u8>,
    pub total: u64,
    pub start: u64,
    pub partial: bool,
}
pub fn read_resource(
    service: &ImageAssets,
    uri: &str,
    range: Option<&str>,
) -> Result<ResourceResponse, AssetError> {
    if READS.fetch_add(1, Ordering::SeqCst) >= 8 {
        READS.fetch_sub(1, Ordering::SeqCst);
        return Err(AssetError::new("busy"));
    }
    let _permit = ReadPermit;
    let (session, id, revision) = parse_resource_uri(uri)?;
    let (mut file, resource, _lease) = service.resource_file(&session, &id, revision)?;
    let (start, end, partial) = if let Some(range) = range {
        let range = range
            .strip_prefix("bytes=")
            .ok_or_else(|| AssetError::new("invalid_range"))?;
        let (a, b) = range
            .split_once('-')
            .ok_or_else(|| AssetError::new("invalid_range"))?;
        if a.is_empty() || b.is_empty() || !a.bytes().chain(b.bytes()).all(|v| v.is_ascii_digit()) {
            return Err(AssetError::new("invalid_range"));
        }
        let a = a
            .parse::<u64>()
            .map_err(|_| AssetError::new("invalid_range"))?;
        let b = b
            .parse::<u64>()
            .map_err(|_| AssetError::new("invalid_range"))?;
        if b < a || b >= resource.bytes {
            return Err(AssetError::new("invalid_range"));
        }
        (a, b, true)
    } else {
        (0, resource.bytes - 1, false)
    };
    let count = end - start + 1;
    if count > 32 * 1024 * 1024 {
        return Err(AssetError::new("request_budget"));
    }
    file.seek(SeekFrom::Start(start))
        .map_err(|_| AssetError::new("resource_unavailable"))?;
    let mut bytes = vec![0u8; count as usize];
    file.read_exact(&mut bytes)
        .map_err(|_| AssetError::new("resource_unavailable"))?;
    Ok(ResourceResponse {
        status: if partial { 206 } else { 200 },
        mime: resource.mime,
        bytes,
        total: resource.bytes,
        start,
        partial,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_uri_traversal_extra_queries_and_origin_confusion() {
        for uri in [
            "draivio-image://localhost/../secret?revision=1",
            "draivio-image://localhost/a/%2e%2e?revision=1",
            "draivio-image://localhost/a/b?revision=1&path=x",
            "draivio-image://evil/a/b?revision=1",
            "draivio-image://localhost/a/b?revision=0",
            "file:///etc/passwd",
        ] {
            assert!(parse_resource_uri(uri).is_err(), "{uri}");
        }
    }
    #[test]
    fn resolves_only_exact_opaque_tokens_and_revision() {
        let a = "a".repeat(48);
        let b = "b".repeat(48);
        let uri = format!("draivio-image://localhost/{a}/{b}?revision=12");
        assert_eq!(
            parse_resource_uri(&uri).unwrap(),
            (a.clone(), b.clone(), 12)
        );
        let uri = format!("http://draivio-image.localhost/{a}/{b}?revision=12");
        assert!(parse_resource_uri(&uri).is_ok());
    }
}
