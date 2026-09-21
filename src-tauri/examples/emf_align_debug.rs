//! Phase 10 debug: renders 3 text shapes (left/center/right) through the real
//! build_draw_commands()/record_emf() pipeline, plays the result back onto a
//! bitmap (same technique as Phase 0's emf_spike.rs), and saves it as PNG so
//! the alignment bug can be inspected directly without PowerPoint.
#[cfg(windows)]
fn main() {
    use quickchart_lib::emf::shape_draw::{ShapeDto, StyleDto, build_draw_commands};
    use quickchart_lib::emf::writer::record_emf;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CreateCompatibleBitmap, CreateCompatibleDC, CreateSolidBrush,
        DIB_RGB_COLORS, DeleteDC, DeleteObject, FillRect, GetDC, GetDIBits, PlayEnhMetaFile, ReleaseDC, SelectObject,
    };

    fn style() -> StyleDto {
        StyleDto {
            fill: "#eef2f7".to_string(),
            stroke: "#1f3a5f".to_string(),
            stroke_width: 1.0,
            stroke_dasharray: None,
            font_family: Some("Yu Gothic".to_string()),
            font_size: Some(24.0),
            text_color: Some("#000000".to_string()),
        }
    }

    fn text_shape(id: &str, y: f64, align: &str) -> ShapeDto {
        ShapeDto {
            id: id.to_string(),
            kind: "text".to_string(),
            x: 20.0,
            y,
            width: 360.0,
            height: 40.0,
            rotation: 0.0,
            style: style(),
            content: Some(format!("align={align}")),
            align: Some(align.to_string()),
            from_shape_id: None,
            from_anchor: None,
            to_shape_id: None,
            to_anchor: None,
            points: None,
        }
    }

    // A guide rect so the x=20..380 span (matching the text shapes' box) is
    // visible, making it easy to see where "left"/"center"/"right" SHOULD
    // land relative to the box.
    fn guide_rect(y: f64) -> ShapeDto {
        ShapeDto {
            id: "guide".to_string(),
            kind: "rect".to_string(),
            x: 20.0,
            y,
            width: 360.0,
            height: 40.0,
            rotation: 0.0,
            style: StyleDto {
                fill: "#ffffff".to_string(),
                stroke: "#cccccc".to_string(),
                stroke_width: 1.0,
                stroke_dasharray: None,
                font_family: None,
                font_size: None,
                text_color: None,
            },
            content: None,
            align: None,
            from_shape_id: None,
            from_anchor: None,
            to_shape_id: None,
            to_anchor: None,
            points: None,
        }
    }

    let shapes = vec![
        guide_rect(10.0),
        text_shape("left", 10.0, "left"),
        guide_rect(60.0),
        text_shape("center", 60.0, "center"),
        guide_rect(110.0),
        text_shape("right", 110.0, "right"),
    ];

    let commands = build_draw_commands(&shapes);
    println!("built {} commands", commands.len());
    let hemf = record_emf(&commands).expect("record_emf failed");

    unsafe {
        let width: i32 = 400;
        let height: i32 = 170;
        let screen_dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let old_bmp = SelectObject(mem_dc, bitmap.into());

        let bg_brush = CreateSolidBrush(windows::Win32::Foundation::COLORREF(0x00FFFFFF));
        let full_rect = RECT { left: 0, top: 0, right: width, bottom: height };
        FillRect(mem_dc, &full_rect, bg_brush);
        let _ = DeleteObject(bg_brush.into());

        let play_rect = RECT { left: 0, top: 0, right: width, bottom: height };
        let played = PlayEnhMetaFile(mem_dc, hemf, &play_rect);
        println!("PlayEnhMetaFile ok: {}", played.as_bool());

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (width * height * 4) as usize];
        GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        let mut rgba = vec![0u8; buf.len()];
        for px in 0..(width * height) as usize {
            rgba[px * 4] = buf[px * 4 + 2];
            rgba[px * 4 + 1] = buf[px * 4 + 1];
            rgba[px * 4 + 2] = buf[px * 4];
            rgba[px * 4 + 3] = 255;
        }
        let pixmap = resvg::tiny_skia::Pixmap::from_vec(
            rgba,
            resvg::tiny_skia::IntSize::from_wh(width as u32, height as u32).unwrap(),
        )
        .expect("pixmap from raw bytes failed");
        let out_dir = std::env::var("SPIKE_OUT_DIR").unwrap_or_else(|_| ".".into());
        let png_path = format!("{out_dir}\\emf_align_debug.png");
        pixmap.save_png(&png_path).expect("save png failed");
        println!("saved: {png_path}");

        SelectObject(mem_dc, old_bmp);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);
        let _ = windows::Win32::Graphics::Gdi::DeleteEnhMetaFile(Some(hemf));
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("this spike is Windows-only (GDI)");
}
