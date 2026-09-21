//! Phase 0 spike: generate an EMF via raw Win32 GDI calls (windows-rs), save it to a file,
//! then play it back onto an in-memory bitmap and dump that as PNG so we can visually
//! confirm the drawing commands rendered correctly without opening PowerPoint.
#[cfg(windows)]
fn main() {
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Gdi::{
        BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CLIP_DEFAULT_PRECIS, CloseEnhMetaFile,
        CreateCompatibleBitmap, CreateCompatibleDC, CreateEnhMetaFileW, CreateFontW, CreatePen,
        CreateSolidBrush, DEFAULT_CHARSET, DEFAULT_PITCH, DEFAULT_QUALITY, DIB_RGB_COLORS,
        DeleteDC, DeleteObject, Ellipse, FF_DONTCARE, FW_NORMAL, GetDC, GetDIBits,
        GetEnhMetaFileHeader, OUT_DEFAULT_PRECIS, PS_SOLID, PlayEnhMetaFile, Rectangle, ReleaseDC,
        SelectObject, SetBkMode, SetTextColor, TRANSPARENT, TextOutW,
    };
    use windows::core::PCWSTR;

    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(std::iter::once(0)).collect()
    }

    unsafe {
        // 1. Record an EMF: a filled rectangle, an ellipse outline, and Japanese text.
        // Pass lpRect = None so GDI derives the picture frame from the reference DC's
        // actual resolution and the recorded extent, instead of us guessing a .01mm size
        // that doesn't match the pixel-space coordinates used below (that mismatch caused
        // a scaling artifact on the first attempt of this spike).
        let ref_dc = GetDC(None);
        let emf_dc = CreateEnhMetaFileW(Some(ref_dc), PCWSTR::null(), None, PCWSTR::null());
        ReleaseDC(None, ref_dc);
        assert!(!emf_dc.is_invalid(), "CreateEnhMetaFileW failed");

        let brush = CreateSolidBrush(windows::Win32::Foundation::COLORREF(0x00F5EEEA)); // light fill (BGR)
        let old_brush = SelectObject(emf_dc, brush.into());
        let pen = CreatePen(PS_SOLID, 8, windows::Win32::Foundation::COLORREF(0x005F3A1F)); // dark stroke (BGR)
        let old_pen = SelectObject(emf_dc, pen.into());

        Rectangle(emf_dc, 100, 100, 1900, 1100).expect("Rectangle failed");
        Ellipse(emf_dc, 2100, 100, 3900, 1100).expect("Ellipse failed");

        // The stock font selected into a fresh DC has no Japanese glyphs (renders as
        // tofu boxes), so an explicit Japanese-capable font must be created and selected
        // before drawing any text shape.
        let font_name = wide("Yu Gothic");
        let mut logfont_name = [0u16; 32];
        logfont_name[..font_name.len()].copy_from_slice(&font_name);
        let font = CreateFontW(
            -32,
            0,
            0,
            0,
            FW_NORMAL.0 as i32,
            0,
            0,
            0,
            DEFAULT_CHARSET,
            OUT_DEFAULT_PRECIS,
            CLIP_DEFAULT_PRECIS,
            DEFAULT_QUALITY,
            (DEFAULT_PITCH.0 | FF_DONTCARE.0) as u32,
            PCWSTR(logfont_name.as_ptr()),
        );
        let old_font = SelectObject(emf_dc, font.into());

        SetBkMode(emf_dc, TRANSPARENT);
        SetTextColor(emf_dc, windows::Win32::Foundation::COLORREF(0x005F3A1F));
        let text = wide("コンサル図解 EMFテスト");
        let _ = TextOutW(emf_dc, 150, 1400, &text[..text.len() - 1]);

        SelectObject(emf_dc, old_font);
        let _ = DeleteObject(font.into());

        SelectObject(emf_dc, old_brush);
        SelectObject(emf_dc, old_pen);
        let _ = DeleteObject(brush.into());
        let _ = DeleteObject(pen.into());

        let hemf = CloseEnhMetaFile(emf_dc);
        assert!(!hemf.is_invalid(), "CloseEnhMetaFile failed");

        // 2. Save to a .emf file next to the PNG dump (for manual PowerPoint paste-test).
        let out_dir = std::env::var("SPIKE_OUT_DIR").unwrap_or_else(|_| ".".into());
        let emf_path = format!("{out_dir}\\emf_spike_output.emf");
        let emf_path_w = wide(&emf_path);
        let hemf_file = windows::Win32::Graphics::Gdi::CopyEnhMetaFileW(
            hemf,
            PCWSTR(emf_path_w.as_ptr()),
        );
        assert!(!hemf_file.is_invalid(), "CopyEnhMetaFileW failed");
        println!("saved EMF: {emf_path}");

        // 3. Sanity-check the header round-trips (bounds/description readable).
        let mut header = std::mem::zeroed::<windows::Win32::Graphics::Gdi::ENHMETAHEADER>();
        let header_size = GetEnhMetaFileHeader(
            hemf,
            std::mem::size_of::<windows::Win32::Graphics::Gdi::ENHMETAHEADER>() as u32,
            Some(&mut header as *mut _),
        );
        println!("header bytes read: {header_size}, frame: {:?}", header.rclFrame);

        // 4. Play the EMF back onto a DIB section so we can visually verify via PNG.
        let width: i32 = 480;
        let height: i32 = 288;
        let screen_dc = GetDC(None);
        let mem_dc = CreateCompatibleDC(Some(screen_dc));
        let bitmap = CreateCompatibleBitmap(screen_dc, width, height);
        let old_bmp = SelectObject(mem_dc, bitmap.into());

        // white background
        let bg_brush = CreateSolidBrush(windows::Win32::Foundation::COLORREF(0x00FFFFFF));
        let full_rect = RECT { left: 0, top: 0, right: width, bottom: height };
        windows::Win32::Graphics::Gdi::FillRect(mem_dc, &full_rect, bg_brush);
        let _ = DeleteObject(bg_brush.into());

        let play_rect = RECT { left: 0, top: 0, right: width, bottom: height };
        let played = PlayEnhMetaFile(mem_dc, hemf_file, &play_rect);
        println!("PlayEnhMetaFile ok: {}", played.as_bool());

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // negative = top-down DIB
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut buf = vec![0u8; (width * height * 4) as usize];
        let scanlines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            height as u32,
            Some(buf.as_mut_ptr() as *mut _),
            &mut bmi,
            DIB_RGB_COLORS,
        );
        println!("GetDIBits scanlines: {scanlines}");

        // BGRA (opaque) -> RGBA for tiny_skia
        let mut rgba = vec![0u8; buf.len()];
        for px in 0..(width * height) as usize {
            let b = buf[px * 4];
            let g = buf[px * 4 + 1];
            let r = buf[px * 4 + 2];
            rgba[px * 4] = r;
            rgba[px * 4 + 1] = g;
            rgba[px * 4 + 2] = b;
            rgba[px * 4 + 3] = 255;
        }
        let pixmap = resvg::tiny_skia::Pixmap::from_vec(
            rgba,
            resvg::tiny_skia::IntSize::from_wh(width as u32, height as u32).unwrap(),
        )
        .expect("pixmap from raw bytes failed");
        let png_path = format!("{out_dir}\\emf_spike_rendered.png");
        pixmap.save_png(&png_path).expect("save png failed");
        println!("saved rendered PNG: {png_path}");

        SelectObject(mem_dc, old_bmp);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(mem_dc);
        ReleaseDC(None, screen_dc);
        let _ = windows::Win32::Graphics::Gdi::DeleteEnhMetaFile(Some(hemf_file));

        // 5. Clipboard transfer: a *third* copy of the EMF is needed, because once handed
        // to the clipboard via SetClipboardData, the OS owns the handle and it must not be
        // freed/reused by us (unlike hemf_file above, which we deleted right after use).
        let hemf_clip = windows::Win32::Graphics::Gdi::CopyEnhMetaFileW(hemf, PCWSTR::null());
        assert!(!hemf_clip.is_invalid(), "CopyEnhMetaFileW (clipboard copy) failed");
        let opened = windows::Win32::System::DataExchange::OpenClipboard(None);
        println!("OpenClipboard ok: {}", opened.is_ok());
        if opened.is_ok() {
            let _ = windows::Win32::System::DataExchange::EmptyClipboard();
            let set = windows::Win32::System::DataExchange::SetClipboardData(
                14u32, /* CF_ENHMETAFILE */
                Some(windows::Win32::Foundation::HANDLE(hemf_clip.0 as *mut _)),
            );
            println!("SetClipboardData ok: {}", set.is_ok());
            let _ = windows::Win32::System::DataExchange::CloseClipboard();
            println!("EMF is now on the clipboard - manually Ctrl+V into PowerPoint to verify editability.");
        }

        let _ = windows::Win32::Graphics::Gdi::DeleteEnhMetaFile(Some(hemf));
    }
}

#[cfg(not(windows))]
fn main() {
    eprintln!("this spike is Windows-only (GDI)");
}
