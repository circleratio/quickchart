use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const MAX_RECENT_FILES: usize = 10;
const RECENT_FILES_FILENAME: &str = "recent_files.json";

#[derive(Debug, Serialize, Deserialize, Default)]
struct RecentFiles {
    paths: Vec<String>,
}

fn recent_files_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(RECENT_FILES_FILENAME))
}

pub fn get_recent_files(app: &tauri::AppHandle) -> Result<Vec<String>, AppError> {
    let path = recent_files_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let data: RecentFiles = serde_json::from_str(&content).unwrap_or_default();
    Ok(data.paths)
}

pub fn add_recent_file(app: &tauri::AppHandle, file_path: &str) -> Result<(), AppError> {
    let path = recent_files_path(app)?;
    let mut paths = get_recent_files(app)?;
    paths.retain(|p| p != file_path);
    paths.insert(0, file_path.to_string());
    paths.truncate(MAX_RECENT_FILES);
    fs::write(&path, serde_json::to_string_pretty(&RecentFiles { paths })?)?;
    Ok(())
}
