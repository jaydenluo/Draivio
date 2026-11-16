mod ocr;
mod cloud_account;
mod cmyk_backend;
mod service_connections;
mod network;
mod project_files;
mod batch_files;
mod models;
mod color_management;
mod image_codecs;
mod raw_decode;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(project_files::ProjectFiles::default())
    .manage(batch_files::BatchFiles::default())
    .manage(models::ModelStore::default())
    .invoke_handler(tauri::generate_handler![cloud_account::cloud_account_request, raw_decode::raw_decode, raw_decode::raw_cancel, ocr::recognize_image_text, cmyk_backend::cmyk_process, image_codecs::image_decode_precision, image_codecs::image_encode_precision, batch_files::batch_pick_inputs, batch_files::batch_pick_output, batch_files::batch_read_input, batch_files::batch_write_output, color_management::transform_rgba_icc, project_files::open_project_file, project_files::save_project_file, service_connections::load_service_connections, service_connections::save_service_connections, service_connections::test_service_connection, service_connections::fetch_service_models, service_connections::generate_openai_images, models::model_status, models::model_download, models::model_pause, models::model_cancel, models::model_delete])
    .setup(|app| {
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
