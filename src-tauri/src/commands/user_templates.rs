use crate::error::AppError;
use crate::user_templates;

#[tauri::command]
pub fn get_user_templates(app: tauri::AppHandle) -> Result<Vec<serde_json::Value>, AppError> {
    user_templates::get_user_templates(&app)
}

// Takes the already-fully-built UserTemplate JSON (id/createdAt generated on
// the frontend, which already needs uuid/Date there) rather than spec.md's
// literal `name, shapes` signature - avoids adding a Rust uuid/time
// dependency purely to duplicate what the frontend does trivially already.
#[tauri::command]
pub fn save_user_template(app: tauri::AppHandle, template: serde_json::Value) -> Result<serde_json::Value, AppError> {
    user_templates::save_user_template(&app, template.clone())?;
    Ok(template)
}

#[tauri::command]
pub fn delete_user_template(app: tauri::AppHandle, id: String) -> Result<(), AppError> {
    user_templates::delete_user_template(&app, &id)
}
