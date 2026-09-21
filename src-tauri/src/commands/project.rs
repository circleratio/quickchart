use crate::error::AppError;
use crate::{project_file, recent_files};
use serde::Serialize;
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Serialize)]
pub struct OpenResult {
    pub path: String,
    pub document: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct SaveAsResult {
    pub path: String,
}

// Shared by every command that shows a save/open dialog (this file,
// export_png.rs, export_emf.rs) to turn the dialog's FilePath into a plain
// path string.
pub fn path_to_string(path: tauri_plugin_dialog::FilePath) -> Result<String, AppError> {
    path.into_path()
        .map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| AppError::Other(e.to_string()))
}

#[tauri::command]
pub async fn project_open(app: tauri::AppHandle) -> Result<OpenResult, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("quickchart project", &["qct"])
        .blocking_pick_file()
        .ok_or(AppError::DialogCancelled)?;
    let path = path_to_string(picked)?;
    let document = project_file::read_document(&path)?;
    recent_files::add_recent_file(&app, &path)?;
    Ok(OpenResult { path, document })
}

// Opens a project file directly by path, without a dialog - used for the
// recent-files list (doc/spec.md §9), which project_open's table entry
// doesn't cover on its own since that command always prompts.
#[tauri::command]
pub fn project_open_path(app: tauri::AppHandle, path: String) -> Result<OpenResult, AppError> {
    let document = project_file::read_document(&path)?;
    recent_files::add_recent_file(&app, &path)?;
    Ok(OpenResult { path, document })
}

#[tauri::command]
pub fn project_save(path: String, document: serde_json::Value) -> Result<(), AppError> {
    project_file::write_document(&path, &document)
}

#[tauri::command]
pub async fn project_save_as(app: tauri::AppHandle, document: serde_json::Value) -> Result<SaveAsResult, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("quickchart project", &["qct"])
        .set_file_name("untitled.qct")
        .blocking_save_file()
        .ok_or(AppError::DialogCancelled)?;
    let path = path_to_string(picked)?;
    project_file::write_document(&path, &document)?;
    recent_files::add_recent_file(&app, &path)?;
    Ok(SaveAsResult { path })
}

#[tauri::command]
pub fn get_recent_files(app: tauri::AppHandle) -> Result<Vec<String>, AppError> {
    recent_files::get_recent_files(&app)
}

// Shows its own save dialog (like project_save_as) rather than taking a
// caller-supplied `path` per spec.md's original table - avoids needing a
// separate generic "pick a save path" command; noted in spec.md.
#[tauri::command]
pub async fn export_svg(app: tauri::AppHandle, svg_text: String) -> Result<String, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("SVG", &["svg"])
        .set_file_name("export.svg")
        .blocking_save_file()
        .ok_or(AppError::DialogCancelled)?;
    let path = path_to_string(picked)?;
    std::fs::write(&path, svg_text)?;
    Ok(path)
}
