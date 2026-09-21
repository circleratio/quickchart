use crate::error::AppError;
use windows::Win32::Graphics::Gdi::HENHMETAFILE;

const CF_ENHMETAFILE: u32 = 14;

/// Puts an enhanced metafile on the clipboard as CF_ENHMETAFILE (doc/spec.md
/// §8.3). Once handed to the clipboard the OS owns `hemf` - the caller must
/// not delete it afterward (Phase 0 spike finding).
pub fn set_clipboard_emf(hemf: HENHMETAFILE) -> Result<(), AppError> {
    unsafe {
        windows::Win32::System::DataExchange::OpenClipboard(None)
            .map_err(|e| AppError::Other(format!("OpenClipboard failed: {e}")))?;
        let result = (|| -> Result<(), AppError> {
            windows::Win32::System::DataExchange::EmptyClipboard()
                .map_err(|e| AppError::Other(format!("EmptyClipboard failed: {e}")))?;
            windows::Win32::System::DataExchange::SetClipboardData(
                CF_ENHMETAFILE,
                Some(windows::Win32::Foundation::HANDLE(hemf.0 as *mut _)),
            )
            .map_err(|e| AppError::Other(format!("SetClipboardData failed: {e}")))?;
            Ok(())
        })();
        let _ = windows::Win32::System::DataExchange::CloseClipboard();
        result
    }
}
