use crate::clipboard;
use crate::commands::project::path_to_string;
use crate::emf::shape_draw::{ShapeDto, build_draw_commands};
use crate::emf::writer::record_emf;
use crate::error::AppError;
use tauri_plugin_dialog::DialogExt;
use windows::Win32::Graphics::Gdi::{CopyEnhMetaFileW, DeleteEnhMetaFile};
use windows::core::PCWSTR;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

// Shows its own save dialog rather than taking a caller-supplied `path`
// (see the same note in commands/project.rs's export_svg).
#[tauri::command]
pub async fn export_emf_to_file(app: tauri::AppHandle, shapes: Vec<ShapeDto>) -> Result<String, AppError> {
    let picked = app
        .dialog()
        .file()
        .add_filter("EMF", &["emf"])
        .set_file_name("export.emf")
        .blocking_save_file()
        .ok_or(AppError::DialogCancelled)?;
    let path_str = path_to_string(picked)?;

    let commands = build_draw_commands(&shapes);
    let hemf = record_emf(&commands)?;
    unsafe {
        let path_w = wide(&path_str);
        let copy = CopyEnhMetaFileW(hemf, PCWSTR(path_w.as_ptr()));
        let _ = DeleteEnhMetaFile(Some(hemf));
        if copy.is_invalid() {
            return Err(AppError::Other("CopyEnhMetaFileW (file) failed".into()));
        }
        let _ = DeleteEnhMetaFile(Some(copy));
    }
    Ok(path_str)
}

// No automatic PNG fallback on failure (doc/spec.md §8.3 describes one) - an
// MVP scope trim given the low-level Win32 clipboard/DIB work it would need
// with limited ability to verify it without a human at the keyboard. On
// failure the frontend points the user at PNG file export instead; noted in
// spec.md.
#[tauri::command]
pub fn export_emf_to_clipboard(shapes: Vec<ShapeDto>) -> Result<(), AppError> {
    let commands = build_draw_commands(&shapes);
    let hemf = record_emf(&commands)?;
    unsafe {
        let clip_copy = CopyEnhMetaFileW(hemf, PCWSTR::null());
        let _ = DeleteEnhMetaFile(Some(hemf));
        if clip_copy.is_invalid() {
            return Err(AppError::Other("CopyEnhMetaFileW (clipboard) failed".into()));
        }
        clipboard::set_clipboard_emf(clip_copy)?;
    }
    Ok(())
}
