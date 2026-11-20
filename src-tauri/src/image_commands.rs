//! Tauri transport. Path capabilities originate only from the OS picker.
use crate::{
    image_assets::{AssetError, ImageAssets, Resource},
    image_protocol,
};
use serde::Serialize;
use tauri::Manager;
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TransportResource {
    #[serde(flatten)]
    resource: Resource,
    resource_url: String,
}
fn transport_resource(
    window: &tauri::WebviewWindow,
    resource: Resource,
) -> Result<serde_json::Value, AssetError> {
    // Ask Tauri for the platform's real scheme origin (WebView2 uses http[s]).
    let origin = window
        .convert_file_src("origin", Some("draivio-image"))
        .map_err(|_| AssetError::new("protocol_unavailable"))?;
    let origin = origin
        .strip_suffix("/origin")
        .ok_or_else(|| AssetError::new("protocol_unavailable"))?;
    let resource_url = format!(
        "{origin}/{}/{}?revision={}",
        resource.session, resource.resource_id, resource.revision
    );
    serde_json::to_value(TransportResource {
        resource,
        resource_url,
    })
    .map_err(|_| AssetError::new("worker_protocol"))
}
fn asset_transport(
    window: &tauri::WebviewWindow,
    asset: crate::image_assets::Asset,
) -> Result<serde_json::Value, AssetError> {
    let profile = asset.profile.clone();
    let mut value = serde_json::to_value(asset).map_err(|_| AssetError::new("worker_protocol"))?;
    if let Some(p) = profile {
        value["profile"] = transport_resource(window, p)?;
    }
    Ok(value)
}
fn job_transport(
    window: &tauri::WebviewWindow,
    job: crate::image_assets::Job,
) -> Result<serde_json::Value, AssetError> {
    let resource = job.resource.clone();
    let mut value = serde_json::to_value(job).map_err(|_| AssetError::new("worker_protocol"))?;
    if let Some(r) = resource {
        value["resource"] = transport_resource(window, r)?;
    }
    Ok(value)
}
pub fn worker_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    #[cfg(debug_assertions)]
    if let Some(value) = std::env::var_os("DRAIVIO_IMAGE_WORKER") {
        let path = std::path::PathBuf::from(value);
        return path
            .is_absolute()
            .then(|| path.canonicalize().ok())
            .flatten()
            .filter(|p| p.is_file());
    }
    let name = if cfg!(windows) {
        "draivio-image-worker.exe"
    } else {
        "draivio-image-worker"
    };
    app.path()
        .resource_dir()
        .ok()
        .map(|p| p.join("image-worker").join(name))
        .filter(|p| p.is_file())
}
#[tauri::command]
pub async fn image_asset_pick(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImageAssets>,
) -> Result<Option<serde_json::Value>, AssetError> {
    let service = state.inner().clone();
    let generation = service.generation();
    let asset = tauri::async_runtime::spawn_blocking(move || {
        let Some(path) = rfd::FileDialog::new()
            .add_filter("Images", &["jpg", "jpeg", "png", "tif", "tiff"])
            .pick_file()
        else {
            return Ok(None);
        };
        service.import_for_generation(path, generation).map(Some)
    })
    .await
    .map_err(|_| AssetError::new("worker_crashed"))??;
    asset.map(|a| asset_transport(&window, a)).transpose()
}
#[tauri::command]
pub async fn image_asset_snapshot(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImageAssets>,
    asset_id: String,
    revision: u64,
    lease: String,
) -> Result<serde_json::Value, AssetError> {
    let a = state.asset(&asset_id, revision, &lease)?;
    asset_transport(&window, a)
}
#[tauri::command]
pub fn image_asset_start(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImageAssets>,
    asset_id: String,
    revision: u64,
    lease: String,
    operation: String,
    max_edge: u32,
    timeout_ms: u64,
) -> Result<serde_json::Value, AssetError> {
    job_transport(
        &window,
        state.start(
            &asset_id, revision, &lease, &operation, max_edge, timeout_ms,
        )?,
    )
}
#[tauri::command]
pub fn image_asset_job(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImageAssets>,
    asset_id: String,
    revision: u64,
    lease: String,
    job_id: String,
) -> Result<serde_json::Value, AssetError> {
    // Terminal source_changed errors remain observable after revision invalidation.
    let job = state.job(&job_id)?;
    if job.asset_id != asset_id || job.revision != revision {
        return Err(AssetError::new("revision_stale"));
    }
    if job.phase == "ready" || job.phase == "running" || job.phase == "queued" {
        state.asset(&asset_id, revision, &lease)?;
    } else {
        state.authorize_job(&asset_id, &lease)?;
    }
    job_transport(&window, job)
}
#[tauri::command]
pub fn image_asset_cancel(
    state: tauri::State<'_, ImageAssets>,
    asset_id: String,
    revision: u64,
    lease: String,
    job_id: String,
) -> Result<(), AssetError> {
    state.authorize_job(&asset_id, &lease)?;
    let job = state.job(&job_id)?;
    if job.asset_id != asset_id || job.revision != revision {
        return Err(AssetError::new("revision_stale"));
    }
    state.cancel(&job_id)
}
#[tauri::command]
pub fn image_asset_dispose(
    state: tauri::State<'_, ImageAssets>,
    asset_id: String,
    lease: String,
) -> Result<(), AssetError> {
    state.dispose(&asset_id, &lease)
}
pub fn protocol<R: tauri::Runtime>(
    context: tauri::UriSchemeContext<'_, R>,
    request: tauri::http::Request<Vec<u8>>,
    responder: tauri::UriSchemeResponder,
) {
    let service = context.app_handle().state::<ImageAssets>().inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let origin = request
            .headers()
            .get("Origin")
            .and_then(|v| v.to_str().ok());
        let allowed = origin.is_none_or(|s| {
            [
                "tauri://localhost",
                "http://tauri.localhost",
                "https://tauri.localhost",
                "http://localhost:5173",
            ]
            .contains(&s)
        });
        let result = if !allowed {
            Err(AssetError::new("origin_denied"))
        } else if request.method() != tauri::http::Method::GET || !request.body().is_empty() {
            Err(AssetError::new("invalid_method"))
        } else {
            image_protocol::read_resource(
                &service,
                &request.uri().to_string(),
                request.headers().get("Range").and_then(|v| v.to_str().ok()),
            )
        };
        let mut response = tauri::http::Response::builder()
            .header("X-Content-Type-Options", "nosniff")
            .header("Cache-Control", "private, no-store")
            .header("Vary", "Origin")
            .header(
                "Access-Control-Expose-Headers",
                "Content-Length, Content-Range, Accept-Ranges",
            );
        if allowed {
            if let Some(origin) = origin {
                response = response.header("Access-Control-Allow-Origin", origin);
            }
        }
        match result {
            Ok(r) => {
                response = response
                    .status(r.status)
                    .header("Content-Type", r.mime)
                    .header("Content-Length", r.bytes.len())
                    .header("Accept-Ranges", "bytes");
                if r.partial {
                    response = response.header(
                        "Content-Range",
                        format!(
                            "bytes {}-{}/{}",
                            r.start,
                            r.start + r.bytes.len() as u64 - 1,
                            r.total
                        ),
                    );
                }
                responder.respond(response.body(r.bytes).unwrap());
            }
            Err(e) => {
                let status = match e.code.as_str() {
                    "origin_denied" => 403,
                    "request_budget" | "invalid_range" => 416,
                    "busy" => 429,
                    "invalid_method" => 405,
                    _ => 404,
                };
                responder.respond(
                    response
                        .status(status)
                        .header("Content-Type", "application/json")
                        .body(serde_json::to_vec(&e).unwrap())
                        .unwrap(),
                );
            }
        }
    });
}

#[tauri::command]
pub async fn image_resource_reopen(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImageAssets>,
    reference: crate::image_resource_store::RasterReference,
) -> Result<serde_json::Value, AssetError> {
    let service = state.inner().clone();
    let generation = service.generation();
    let asset = tauri::async_runtime::spawn_blocking(move || {
        service.reopen_for_generation(&reference, generation)
    })
    .await
    .map_err(|_| AssetError::new("worker_crashed"))??;
    asset_transport(&window, asset)
}
#[tauri::command]
pub async fn image_resource_replace_root(
    state: tauri::State<'_, ImageAssets>,
    owner: crate::image_resource_store::ResourceRoot,
    references: Vec<crate::image_resource_store::RasterReference>,
) -> Result<(), AssetError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.replace_root(&owner, &references))
        .await
        .map_err(|_| AssetError::new("worker_crashed"))?
}

#[derive(serde::Deserialize)]
pub struct RootReplacement {
    owner: crate::image_resource_store::ResourceRoot,
    references: Vec<crate::image_resource_store::RasterReference>,
}
#[tauri::command]
pub async fn image_resource_replace_roots(
    state: tauri::State<'_, ImageAssets>,
    roots: Vec<RootReplacement>,
) -> Result<(), AssetError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        service.replace_roots(
            &roots
                .into_iter()
                .map(|r| (r.owner, r.references))
                .collect::<Vec<_>>(),
        )
    })
    .await
    .map_err(|_| AssetError::new("worker_crashed"))?
}

#[tauri::command]
pub async fn image_resource_claim_import(
    state: tauri::State<'_, ImageAssets>,
    owner: crate::image_resource_store::ResourceRoot,
    reference: crate::image_resource_store::RasterReference,
) -> Result<(), AssetError> {
    let service = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || service.claim_import(&owner, &reference))
        .await
        .map_err(|_| AssetError::new("worker_crashed"))?
}
