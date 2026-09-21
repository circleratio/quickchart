use crate::error::AppError;
use std::fs;

/// The `.qct` project file's content is the frontend's `Document` JSON
/// as-is (see doc/spec.md §3.3). The Rust backend treats it as an opaque
/// value - it doesn't need to understand shape internals to save/load a
/// project, only to round-trip the JSON. Schema migration (formatVersion)
/// is handled on the frontend (core/io/projectFile.ts).
pub fn read_document(path: &str) -> Result<serde_json::Value, AppError> {
    let content = fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&content)?;
    Ok(value)
}

pub fn write_document(path: &str, document: &serde_json::Value) -> Result<(), AppError> {
    let content = serde_json::to_string_pretty(document)?;
    fs::write(path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn round_trips_a_document_through_a_file() {
        let dir = std::env::temp_dir().join(format!("quickchart-test-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("roundtrip.qct");
        let path_str = path.to_str().unwrap();

        let original = json!({
            "formatVersion": 1,
            "shapes": {
                "abc": { "id": "abc", "type": "rect", "x": 1.5, "y": 2.0, "width": 100, "height": 50 }
            },
            "layers": [{ "id": "default", "name": "Layer 1", "visible": true, "locked": false, "shapeIds": ["abc"] }],
            "structuredBlocks": [],
            "colorThemeId": "neutral-blue"
        });

        write_document(path_str, &original).expect("write should succeed");
        let restored = read_document(path_str).expect("read should succeed");

        assert_eq!(original, restored);

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn read_document_surfaces_an_io_error_for_a_missing_file() {
        let result = read_document("Z:\\this\\path\\should\\not\\exist.qct");
        assert!(result.is_err());
    }
}
