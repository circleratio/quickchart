use super::shape_draw::{BoxCommand, DrawCommand, LineCommand, PolygonCommand, Rgb, TextCommand};
use crate::error::AppError;
use windows::Win32::Foundation::COLORREF;
use windows::Win32::Graphics::Gdi::{
    CLIP_DEFAULT_PRECIS, CreateEnhMetaFileW, CreateFontW, CreatePen, CreateSolidBrush, DEFAULT_CHARSET,
    DEFAULT_PITCH, DEFAULT_QUALITY, DeleteObject, Ellipse, FF_DONTCARE, FW_NORMAL, GM_ADVANCED, GetDC,
    ModifyWorldTransform, MWT_IDENTITY, OUT_DEFAULT_PRECIS, PS_DASH, PS_SOLID, Rectangle, ReleaseDC, RoundRect, SelectObject,
    SetBkMode, SetGraphicsMode, SetTextAlign, SetTextColor, SetWorldTransform, TA_CENTER, TA_LEFT, TA_RIGHT,
    TA_TOP, TRANSPARENT, TextOutW, XFORM,
};
use windows::core::PCWSTR;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn colorref(rgb: Rgb) -> COLORREF {
    // GDI's COLORREF is 0x00BBGGRR (little-endian order from our RGB tuple).
    COLORREF(rgb.0 as u32 | ((rgb.1 as u32) << 8) | ((rgb.2 as u32) << 16))
}

/// Records `commands` into a new in-memory enhanced metafile and returns its
/// handle (caller owns it - copy it to a file/the clipboard, then
/// DeleteEnhMetaFile it). This is the `unsafe`/GDI half that
/// emf/shape_draw.rs's build_draw_commands() deliberately stays free of, so
/// that logic can be unit tested (doc/spec.md §13).
pub fn record_emf(commands: &[DrawCommand]) -> Result<windows::Win32::Graphics::Gdi::HENHMETAFILE, AppError> {
    unsafe {
        let ref_dc = GetDC(None);
        let emf_dc = CreateEnhMetaFileW(Some(ref_dc), PCWSTR::null(), None, PCWSTR::null());
        ReleaseDC(None, ref_dc);
        if emf_dc.is_invalid() {
            return Err(AppError::Other("CreateEnhMetaFileW failed".into()));
        }

        SetGraphicsMode(emf_dc, GM_ADVANCED);
        SetBkMode(emf_dc, TRANSPARENT);

        for command in commands {
            match command {
                DrawCommand::Rect(b) => draw_box(emf_dc, b, false),
                DrawCommand::Ellipse(b) => draw_box(emf_dc, b, true),
                DrawCommand::Line(l) => draw_line(emf_dc, l),
                DrawCommand::Text(t) => draw_text(emf_dc, t),
                DrawCommand::Polygon(p) => draw_polygon(emf_dc, p),
            }
        }

        let hemf = windows::Win32::Graphics::Gdi::CloseEnhMetaFile(emf_dc);
        if hemf.is_invalid() {
            return Err(AppError::Other("CloseEnhMetaFile failed".into()));
        }
        Ok(hemf)
    }
}

unsafe fn with_rotation<F: FnOnce()>(hdc: windows::Win32::Graphics::Gdi::HDC, cx: f64, cy: f64, rotation_deg: f64, f: F) {
    if rotation_deg == 0.0 {
        f();
        return;
    }
    let rad = (rotation_deg as f32).to_radians();
    let (cx, cy) = (cx as f32, cy as f32);
    let cos = rad.cos();
    let sin = rad.sin();
    // Rotate around (cx, cy): translate to origin, rotate, translate back.
    let xform = XFORM {
        eM11: cos,
        eM12: sin,
        eM21: -sin,
        eM22: cos,
        eDx: cx - cx * cos + cy * sin,
        eDy: cy - cx * sin - cy * cos,
    };
    let _ = SetWorldTransform(hdc, &xform);
    f();
    let _ = ModifyWorldTransform(hdc, None, MWT_IDENTITY);
}

unsafe fn draw_box(hdc: windows::Win32::Graphics::Gdi::HDC, b: &BoxCommand, ellipse: bool) {
    let brush = CreateSolidBrush(colorref(b.fill));
    let old_brush = SelectObject(hdc, brush.into());
    let pen_style = if b.dashed { PS_DASH } else { PS_SOLID };
    let pen = CreatePen(pen_style, b.stroke_width.max(1.0) as i32, colorref(b.stroke));
    let old_pen = SelectObject(hdc, pen.into());

    let cx = b.x + b.width / 2.0;
    let cy = b.y + b.height / 2.0;
    with_rotation(hdc, cx, cy, b.rotation, || {
        let (left, top, right, bottom) = (b.x as i32, b.y as i32, (b.x + b.width) as i32, (b.y + b.height) as i32);
        if ellipse {
            let _ = Ellipse(hdc, left, top, right, bottom);
        } else if b.corner_radius > 0.0 {
            // RoundRect takes the corner ellipse's width/height, i.e. twice the radius.
            let diameter = (b.corner_radius * 2.0) as i32;
            let _ = RoundRect(hdc, left, top, right, bottom, diameter, diameter);
        } else {
            let _ = Rectangle(hdc, left, top, right, bottom);
        }
    });

    SelectObject(hdc, old_brush);
    SelectObject(hdc, old_pen);
    let _ = DeleteObject(brush.into());
    let _ = DeleteObject(pen.into());
}

unsafe fn draw_polygon(hdc: windows::Win32::Graphics::Gdi::HDC, p: &PolygonCommand) {
    let brush = CreateSolidBrush(colorref(p.fill));
    let old_brush = SelectObject(hdc, brush.into());
    let pen_style = if p.dashed { PS_DASH } else { PS_SOLID };
    let pen = CreatePen(pen_style, p.stroke_width.max(1.0) as i32, colorref(p.stroke));
    let old_pen = SelectObject(hdc, pen.into());

    with_rotation(hdc, p.cx, p.cy, p.rotation, || {
        let points: Vec<windows::Win32::Foundation::POINT> = p
            .points
            .iter()
            .map(|&(x, y)| windows::Win32::Foundation::POINT { x: x as i32, y: y as i32 })
            .collect();
        let _ = windows::Win32::Graphics::Gdi::Polygon(hdc, &points);
    });

    SelectObject(hdc, old_brush);
    SelectObject(hdc, old_pen);
    let _ = DeleteObject(brush.into());
    let _ = DeleteObject(pen.into());
}

unsafe fn draw_line(hdc: windows::Win32::Graphics::Gdi::HDC, l: &LineCommand) {
    let pen_style = if l.dashed { PS_DASH } else { PS_SOLID };
    let pen = CreatePen(pen_style, l.stroke_width.max(1.0) as i32, colorref(l.stroke));
    let old_pen = SelectObject(hdc, pen.into());

    let _ = windows::Win32::Graphics::Gdi::MoveToEx(hdc, l.x1 as i32, l.y1 as i32, None);
    let _ = windows::Win32::Graphics::Gdi::LineTo(hdc, l.x2 as i32, l.y2 as i32);

    if l.arrow_head {
        draw_arrow_head(hdc, l);
    }

    SelectObject(hdc, old_pen);
    let _ = DeleteObject(pen.into());
}

unsafe fn draw_arrow_head(hdc: windows::Win32::Graphics::Gdi::HDC, l: &LineCommand) {
    let angle = (l.y2 - l.y1).atan2(l.x2 - l.x1);
    let size = (l.stroke_width * 4.0).max(10.0);
    let spread = 0.5_f64; // radians off the shaft direction

    let back = |offset: f64| {
        let a = angle + std::f64::consts::PI + offset;
        (
            (l.x2 + size * a.cos()) as i32,
            (l.y2 + size * a.sin()) as i32,
        )
    };
    let (bx1, by1) = back(spread);
    let (bx2, by2) = back(-spread);

    let brush = CreateSolidBrush(colorref(l.stroke));
    let old_brush = SelectObject(hdc, brush.into());
    let points = [
        windows::Win32::Foundation::POINT { x: l.x2 as i32, y: l.y2 as i32 },
        windows::Win32::Foundation::POINT { x: bx1, y: by1 },
        windows::Win32::Foundation::POINT { x: bx2, y: by2 },
    ];
    let _ = windows::Win32::Graphics::Gdi::Polygon(hdc, &points);
    SelectObject(hdc, old_brush);
    let _ = DeleteObject(brush.into());
}

unsafe fn draw_text(hdc: windows::Win32::Graphics::Gdi::HDC, t: &TextCommand) {
    // The DC's stock font has no Japanese glyphs (Phase 0 spike finding) - a
    // font matching the shape's own family must be selected explicitly.
    let font_name = wide(&t.font_family);
    let mut logfont_name = [0u16; 32];
    let len = font_name.len().min(32);
    logfont_name[..len].copy_from_slice(&font_name[..len]);

    let font = CreateFontW(
        -(t.font_size.max(1.0) as i32),
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
    let old_font = SelectObject(hdc, font.into());
    SetTextColor(hdc, colorref(t.color));
    SetTextAlign(
        hdc,
        TA_TOP
            | match t.align.as_str() {
                "center" => TA_CENTER,
                "right" => TA_RIGHT,
                _ => TA_LEFT,
            },
    );

    let cx = t.x + t.width / 2.0;
    let cy = t.y + t.height / 2.0;
    with_rotation(hdc, cx, cy, t.rotation, || {
        let text = wide(&t.content);
        let text = &text[..text.len().saturating_sub(1)];
        // Approximate vertical centering within the box (exact centering
        // would need GetTextMetrics for the font's real ascent/descent).
        // Horizontal position follows `align` via SetTextAlign above,
        // matching ShapeRenderer.tsx's textAnchorX/textAnchor.
        let y = (t.y + t.height / 2.0 - t.font_size / 2.0) as i32;
        let x = match t.align.as_str() {
            "center" => (t.x + t.width / 2.0) as i32,
            "right" => (t.x + t.width) as i32,
            _ => t.x as i32,
        };
        let _ = TextOutW(hdc, x, y, text);
    });

    SelectObject(hdc, old_font);
    let _ = DeleteObject(font.into());
}
