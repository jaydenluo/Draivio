mod batch_files;
mod cloud_account;
mod cmyk_backend;
mod color_management;
mod image_assets;
pub mod image_tiles;
mod image_codecs;
mod image_commands;
mod image_protocol;
mod image_resource_store;
mod models;
mod network;
mod ocr;
mod project_container;
mod project_files;
mod raw_decode;
mod result_library;
mod result_library_settings;
mod service_connections;
mod workspace_recovery;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    use tauri::Manager;
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(project_files::ProjectFiles::default())
        .manage(batch_files::BatchFiles::default())
        .manage(models::ModelStore::default())
        .manage(workspace_recovery::RecoveryState::default())
        .register_asynchronous_uri_scheme_protocol("draivio-image", image_commands::protocol)
        .on_window_event(|window, event| {
            use tauri::{Emitter, Manager};
            if matches!(event, tauri::WindowEvent::Destroyed) {
                if let Some(service) = window.try_state::<image_assets::ImageAssets>() {
                    service.dispose_all();
                }
            }
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                if let Some(files) = window.try_state::<project_files::ProjectFiles>() {
                    let tokens: Vec<_> = paths
                        .iter()
                        .filter(|p| {
                            p.extension()
                                .is_some_and(|e| e.eq_ignore_ascii_case("draivio"))
                        })
                        .filter_map(|p| project_files::register(&files, p.clone()).ok())
                        .collect();
                    if !tokens.is_empty() {
                        let _ = window.emit("project-file-drop", tokens);
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            image_commands::image_resource_claim_import,
            image_commands::image_resource_replace_roots,
            image_commands::image_resource_reopen,
            image_commands::image_resource_replace_root,
            image_commands::image_asset_pick,
            image_commands::image_asset_snapshot,
            image_commands::image_asset_start,
            image_commands::image_asset_job,
            image_commands::image_asset_cancel,
            image_commands::image_asset_dispose,
            cloud_account::cloud_account_request,
            cloud_account::cloud_session_read,
            cloud_account::cloud_session_write,
            result_library_settings::result_library_settings,
            result_library_settings::result_library_choose_directory,
            result_library_settings::result_library_reset_directory,
            result_library::result_library_save,
            result_library::result_library_list,
            result_library::result_library_load,
            result_library::result_library_remove,
            result_library::result_library_reveal,
            result_library::result_library_export,
            raw_decode::raw_decode,
            raw_decode::raw_cancel,
            ocr::recognize_image_text,
            cmyk_backend::cmyk_process,
            image_codecs::image_decode_precision,
            image_codecs::image_encode_precision,
            batch_files::batch_pick_inputs,
            batch_files::batch_pick_output,
            batch_files::batch_read_input,
            batch_files::batch_write_output,
            color_management::transform_rgba_icc,
            project_files::open_project_file,
            project_files::open_project_token,
            project_files::save_project_container,
            project_files::release_project_container,
            project_files::register_project_inline,
            project_files::save_project_file,
            service_connections::load_service_connections,
            service_connections::save_service_connections,
            service_connections::test_service_connection,
            service_connections::fetch_service_models,
            service_connections::generate_openai_images,
            models::model_status,
            models::model_download,
            models::model_pause,
            models::model_cancel,
            models::model_delete,
            workspace_recovery::recovery_write,
            workspace_recovery::recovery_list,
            workspace_recovery::recovery_discard
        ])
        .setup(|app| {
            {
                let state = app.state::<workspace_recovery::RecoveryState>();
                workspace_recovery::init(app.handle(), &state).map_err(std::io::Error::other)?;
            }
            {
                use tauri::Manager;
                let root = app.path().app_data_dir()?.join("image-resources-v1");
                let store = std::sync::Arc::new(
                    image_resource_store::ResourceStore::open(root)
                        .map_err(|e| std::io::Error::other(e.message))?,
                );
                let service = image_assets::ImageAssets::with_store(
                    image_commands::worker_path(app.handle()),
                    store,
                )
                .map_err(|e| std::io::Error::other(e.message))?;
                app.manage(service);
            }
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
