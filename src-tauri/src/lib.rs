mod service_connections;
mod network;
mod project_files;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(project_files::ProjectFiles::default())
    .invoke_handler(tauri::generate_handler![project_files::open_project_file, project_files::save_project_file, service_connections::load_service_connections, service_connections::save_service_connections, service_connections::test_service_connection, service_connections::fetch_service_models, service_connections::generate_openai_images])
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
