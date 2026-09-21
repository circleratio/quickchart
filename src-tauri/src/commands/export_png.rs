use crate::commands::project::path_to_string;
use crate::error::AppError;
use resvg::tiny_skia;
use resvg::usvg;
use tauri_plugin_dialog::DialogExt;

// Shows its own save dialog rather than taking a caller-supplied `path`
// (see the same note in commands/project.rs's export_svg).
#[tauri::command]
pub async fn export_png(app: tauri::AppHandle, svg_text: String, scale: f32) -> Result<String, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("PNG", &["png"])
        .set_file_name("export.png")
        .blocking_save_file()
        .ok_or(AppError::DialogCancelled)?;
    let path = path_to_string(picked)?;

    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_system_fonts();
    let opt = usvg::Options {
        fontdb: std::sync::Arc::new(fontdb),
        ..Default::default()
    };

    let tree = usvg::Tree::from_str(&svg_text, &opt).map_err(|e| AppError::Other(format!("SVG parse error: {e}")))?;
    let size = tree.size();
    let scale = if scale > 0.0 { scale } else { 1.0 };
    let width = ((size.width() * scale).round() as u32).max(1);
    let height = ((size.height() * scale).round() as u32).max(1);

    let mut pixmap =
        tiny_skia::Pixmap::new(width, height).ok_or_else(|| AppError::Other("failed to allocate pixmap".into()))?;
    let transform = tiny_skia::Transform::from_scale(scale, scale);
    resvg::render(&tree, transform, &mut pixmap.as_mut());

    pixmap
        .save_png(&path)
        .map_err(|e| AppError::Other(format!("PNG save error: {e}")))?;
    Ok(path)
}
