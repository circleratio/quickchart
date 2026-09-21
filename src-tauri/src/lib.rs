mod clipboard;
mod commands;
// pub so Phase 10's debug examples (src-tauri/examples/) can reach
// build_draw_commands()/record_emf() directly - the rest of the crate stays
// private.
pub mod emf;
mod error;
mod project_file;
mod recent_files;
mod user_templates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::project_open,
            commands::project::project_open_path,
            commands::project::project_save,
            commands::project::project_save_as,
            commands::project::get_recent_files,
            commands::project::export_svg,
            commands::export_png::export_png,
            commands::export_emf::export_emf_to_file,
            commands::export_emf::export_emf_to_clipboard,
            commands::user_templates::get_user_templates,
            commands::user_templates::save_user_template,
            commands::user_templates::delete_user_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
