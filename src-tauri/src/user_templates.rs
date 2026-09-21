use crate::error::AppError;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

const USER_TEMPLATES_FILENAME: &str = "user_templates.json";

// A UserTemplate (doc/spec.md §3.4) is treated as opaque JSON here, same as
// project_file.rs treats Document - Rust only needs to persist it, not
// understand Shape internals.
#[derive(Debug, Serialize, Deserialize, Default)]
struct UserTemplatesFile {
    templates: Vec<serde_json::Value>,
}

fn user_templates_path(app: &tauri::AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    fs::create_dir_all(&dir)?;
    Ok(dir.join(USER_TEMPLATES_FILENAME))
}

pub fn get_user_templates(app: &tauri::AppHandle) -> Result<Vec<serde_json::Value>, AppError> {
    let path = user_templates_path(app)?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let data: UserTemplatesFile = serde_json::from_str(&content).unwrap_or_default();
    Ok(data.templates)
}

pub fn save_user_template(app: &tauri::AppHandle, template: serde_json::Value) -> Result<(), AppError> {
    let path = user_templates_path(app)?;
    let mut templates = get_user_templates(app)?;
    templates.push(template);
    fs::write(&path, serde_json::to_string_pretty(&UserTemplatesFile { templates })?)?;
    Ok(())
}

pub fn delete_user_template(app: &tauri::AppHandle, id: &str) -> Result<(), AppError> {
    let path = user_templates_path(app)?;
    let mut templates = get_user_templates(app)?;
    templates.retain(|t| t.get("id").and_then(|v| v.as_str()) != Some(id));
    fs::write(&path, serde_json::to_string_pretty(&UserTemplatesFile { templates })?)?;
    Ok(())
}
