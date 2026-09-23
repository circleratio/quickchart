use serde::Deserialize;
use std::collections::HashMap;

#[derive(Debug, Clone, Deserialize)]
pub struct PointDto {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StyleDto {
    pub fill: String,
    pub stroke: String,
    pub stroke_width: f64,
    #[serde(default)]
    pub stroke_dasharray: Option<String>,
    #[serde(default)]
    pub font_family: Option<String>,
    #[serde(default)]
    pub font_size: Option<f64>,
    #[serde(default)]
    pub text_color: Option<String>,
}

// Mirrors the frontend's Shape union (src/core/model/shape.ts). Deserialized
// from the plain Document JSON the frontend sends - see project_file.rs for
// why Rust otherwise treats Document as opaque; EMF drawing is the one place
// that actually needs to understand shape geometry.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShapeDto {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub style: StyleDto,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub align: Option<String>,
    #[serde(default)]
    pub from_shape_id: Option<String>,
    #[serde(default)]
    pub from_anchor: Option<String>,
    #[serde(default)]
    pub to_shape_id: Option<String>,
    #[serde(default)]
    pub to_anchor: Option<String>,
    #[serde(default)]
    pub points: Option<Vec<PointDto>>,
    #[serde(default)]
    pub corner_radius: Option<f64>,
}

pub type Rgb = (u8, u8, u8);

// "#rrggbb" -> RGB; anything unparseable falls back to black rather than
// failing the whole export over one bad color value.
pub fn parse_hex_color(s: &str) -> Rgb {
    let hex = s.trim_start_matches('#');
    if hex.len() != 6 {
        return (0, 0, 0);
    }
    let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(0);
    let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(0);
    let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(0);
    (r, g, b)
}

#[derive(Debug, Clone, PartialEq)]
pub struct BoxCommand {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub fill: Rgb,
    pub stroke: Rgb,
    pub stroke_width: f64,
    pub dashed: bool,
    // Rounded-corner radius (rects only; 0 = square corners, and always 0 for
    // ellipses). Clamped to half the shorter side, same as SVG's rx.
    pub corner_radius: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct LineCommand {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub stroke: Rgb,
    pub stroke_width: f64,
    pub dashed: bool,
    pub arrow_head: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct PolygonCommand {
    pub points: Vec<(f64, f64)>,
    // Rotation center, kept separate from the (already-absolute) points above
    // so with_rotation (writer.rs) can rotate around the shape's own
    // bounding-box center the same way draw_box does - mirrors ShapeRenderer.tsx's
    // rotationTransform, which likewise rotates around x+width/2, y+height/2
    // regardless of shape type.
    pub cx: f64,
    pub cy: f64,
    pub rotation: f64,
    pub fill: Rgb,
    pub stroke: Rgb,
    pub stroke_width: f64,
    pub dashed: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextCommand {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub rotation: f64,
    pub content: String,
    pub font_family: String,
    pub font_size: f64,
    pub color: Rgb,
    pub align: String, // "left" | "center" | "right"
}

// One drawing operation, independent of any actual GDI call - this is the
// layer doc/spec.md §13 asks to unit test (Shape -> command list), keeping
// the untestable `unsafe` GDI calls themselves in emf/writer.rs.
#[derive(Debug, Clone, PartialEq)]
pub enum DrawCommand {
    Rect(BoxCommand),
    Ellipse(BoxCommand),
    Line(LineCommand),
    Text(TextCommand),
    Polygon(PolygonCommand),
}

fn anchor_position(shape: &ShapeDto, anchor: &str) -> (f64, f64) {
    let cx = shape.x + shape.width / 2.0;
    let cy = shape.y + shape.height / 2.0;
    let (local_x, local_y) = match anchor {
        "top" => (0.0, -shape.height / 2.0),
        "bottom" => (0.0, shape.height / 2.0),
        "left" => (-shape.width / 2.0, 0.0),
        "right" => (shape.width / 2.0, 0.0),
        _ => (0.0, 0.0), // "center"
    };
    let rad = shape.rotation.to_radians();
    let rx = local_x * rad.cos() - local_y * rad.sin();
    let ry = local_x * rad.sin() + local_y * rad.cos();
    (cx + rx, cy + ry)
}

// Mirrors ConnectorRenderer.tsx's resolveEndpoint(): live anchor position on
// the attached shape if set, otherwise the connector's own stored point.
fn resolve_endpoint(shape: &ShapeDto, which: &str, shapes_by_id: &HashMap<String, ShapeDto>) -> (f64, f64) {
    let (target_id, anchor) = if which == "from" {
        (&shape.from_shape_id, &shape.from_anchor)
    } else {
        (&shape.to_shape_id, &shape.to_anchor)
    };
    if let (Some(id), Some(a)) = (target_id, anchor) {
        if let Some(target) = shapes_by_id.get(id) {
            return anchor_position(target, a);
        }
    }
    let idx = if which == "from" { 0 } else { 1 };
    shape
        .points
        .as_ref()
        .and_then(|pts| pts.get(idx))
        .map(|p| (p.x, p.y))
        .unwrap_or((shape.x, shape.y))
}

fn box_command(shape: &ShapeDto) -> BoxCommand {
    BoxCommand {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
        fill: parse_hex_color(&shape.style.fill),
        stroke: parse_hex_color(&shape.style.stroke),
        stroke_width: shape.style.stroke_width,
        dashed: shape.style.stroke_dasharray.is_some(),
        corner_radius: 0.0,
    }
}

fn rect_command(shape: &ShapeDto) -> BoxCommand {
    let max_radius = shape.width.abs().min(shape.height.abs()) / 2.0;
    BoxCommand {
        corner_radius: shape.corner_radius.unwrap_or(0.0).clamp(0.0, max_radius),
        ..box_command(shape)
    }
}

/// Converts a Shape list (already sorted by zIndex by the caller/frontend)
/// into an ordered list of draw commands. Pure and GDI-free - see tests below.
pub fn build_draw_commands(shapes: &[ShapeDto]) -> Vec<DrawCommand> {
    let shapes_by_id: HashMap<String, ShapeDto> = shapes.iter().map(|s| (s.id.clone(), s.clone())).collect();
    let mut commands = Vec::with_capacity(shapes.len());

    for shape in shapes {
        match shape.kind.as_str() {
            "rect" => commands.push(DrawCommand::Rect(rect_command(shape))),
            "ellipse" => commands.push(DrawCommand::Ellipse(box_command(shape))),
            "line" => commands.push(DrawCommand::Line(LineCommand {
                x1: shape.x,
                y1: shape.y,
                x2: shape.x + shape.width,
                y2: shape.y + shape.height,
                stroke: parse_hex_color(&shape.style.stroke),
                stroke_width: shape.style.stroke_width.max(2.0),
                dashed: shape.style.stroke_dasharray.is_some(),
                arrow_head: false,
            })),
            "connector" | "arrow" => {
                let (x1, y1) = resolve_endpoint(shape, "from", &shapes_by_id);
                let (x2, y2) = resolve_endpoint(shape, "to", &shapes_by_id);
                commands.push(DrawCommand::Line(LineCommand {
                    x1,
                    y1,
                    x2,
                    y2,
                    stroke: parse_hex_color(&shape.style.stroke),
                    stroke_width: shape.style.stroke_width.max(2.0),
                    dashed: shape.style.stroke_dasharray.is_some(),
                    arrow_head: shape.kind == "arrow",
                }));
            }
            // pyramidChart's pyramid-slice bands (src/core/model/shape.ts's
            // PolygonShape) store `points` as fractions (0..1) of the shape's
            // own bounding box, same reasoning as ShapeRenderer.tsx's
            // polygonPoints() - resolved to absolute coordinates here, once,
            // rather than carrying the fraction/box split into DrawCommand.
            "polygon" => {
                if let Some(points) = &shape.points {
                    let abs_points = points
                        .iter()
                        .map(|p| (shape.x + p.x * shape.width, shape.y + p.y * shape.height))
                        .collect();
                    commands.push(DrawCommand::Polygon(PolygonCommand {
                        points: abs_points,
                        cx: shape.x + shape.width / 2.0,
                        cy: shape.y + shape.height / 2.0,
                        rotation: shape.rotation,
                        fill: parse_hex_color(&shape.style.fill),
                        stroke: parse_hex_color(&shape.style.stroke),
                        stroke_width: shape.style.stroke_width,
                        dashed: shape.style.stroke_dasharray.is_some(),
                    }));
                }
            }
            "text" => commands.push(DrawCommand::Text(TextCommand {
                x: shape.x,
                y: shape.y,
                width: shape.width,
                height: shape.height,
                rotation: shape.rotation,
                content: shape.content.clone().unwrap_or_default(),
                font_family: shape.style.font_family.clone().unwrap_or_else(|| "Yu Gothic".to_string()),
                font_size: shape.style.font_size.unwrap_or(16.0),
                color: parse_hex_color(shape.style.text_color.as_deref().unwrap_or("#000000")),
                align: shape.align.clone().unwrap_or_else(|| "left".to_string()),
            })),
            _ => {}
        }
    }

    commands
}

#[cfg(test)]
mod tests {
    use super::*;

    fn style(fill: &str, stroke: &str) -> StyleDto {
        StyleDto {
            fill: fill.to_string(),
            stroke: stroke.to_string(),
            stroke_width: 2.0,
            stroke_dasharray: None,
            font_family: None,
            font_size: None,
            text_color: None,
        }
    }

    fn base_shape(id: &str, kind: &str, x: f64, y: f64, w: f64, h: f64) -> ShapeDto {
        ShapeDto {
            id: id.to_string(),
            kind: kind.to_string(),
            x,
            y,
            width: w,
            height: h,
            rotation: 0.0,
            style: style("#eef2f7", "#1f3a5f"),
            content: None,
            align: None,
            from_shape_id: None,
            from_anchor: None,
            to_shape_id: None,
            to_anchor: None,
            points: None,
            corner_radius: None,
        }
    }

    #[test]
    fn parses_hex_colors() {
        assert_eq!(parse_hex_color("#ff0080"), (0xff, 0x00, 0x80));
        assert_eq!(parse_hex_color("112233"), (0x11, 0x22, 0x33));
    }

    #[test]
    fn falls_back_to_black_for_invalid_colors() {
        assert_eq!(parse_hex_color("not-a-color"), (0, 0, 0));
        assert_eq!(parse_hex_color("#zzzzzz"), (0, 0, 0));
    }

    #[test]
    fn converts_a_rect_to_a_box_command_with_parsed_colors() {
        let shape = base_shape("a", "rect", 10.0, 20.0, 100.0, 50.0);
        let commands = build_draw_commands(&[shape]);
        assert_eq!(commands.len(), 1);
        match &commands[0] {
            DrawCommand::Rect(b) => {
                assert_eq!((b.x, b.y, b.width, b.height), (10.0, 20.0, 100.0, 50.0));
                assert_eq!(b.fill, (0xee, 0xf2, 0xf7));
                assert_eq!(b.stroke, (0x1f, 0x3a, 0x5f));
            }
            other => panic!("expected Rect, got {other:?}"),
        }
    }

    #[test]
    fn keeps_a_rect_square_cornered_without_a_corner_radius() {
        let shape = base_shape("a", "rect", 0.0, 0.0, 100.0, 50.0);
        match &build_draw_commands(&[shape])[0] {
            DrawCommand::Rect(b) => assert_eq!(b.corner_radius, 0.0),
            other => panic!("expected Rect, got {other:?}"),
        }
    }

    #[test]
    fn carries_a_rect_corner_radius_clamped_to_half_the_shorter_side() {
        let mut shape = base_shape("a", "rect", 0.0, 0.0, 100.0, 50.0);
        shape.corner_radius = Some(8.0);
        match &build_draw_commands(&[shape.clone()])[0] {
            DrawCommand::Rect(b) => assert_eq!(b.corner_radius, 8.0),
            other => panic!("expected Rect, got {other:?}"),
        }

        shape.corner_radius = Some(40.0);
        match &build_draw_commands(&[shape])[0] {
            DrawCommand::Rect(b) => assert_eq!(b.corner_radius, 25.0),
            other => panic!("expected Rect, got {other:?}"),
        }
    }

    #[test]
    fn converts_a_plain_line_from_its_bounding_box_diagonal() {
        let shape = base_shape("l", "line", 0.0, 0.0, 100.0, 40.0);
        let commands = build_draw_commands(&[shape]);
        match &commands[0] {
            DrawCommand::Line(l) => {
                assert_eq!((l.x1, l.y1, l.x2, l.y2), (0.0, 0.0, 100.0, 40.0));
                assert!(!l.arrow_head);
            }
            other => panic!("expected Line, got {other:?}"),
        }
    }

    #[test]
    fn resolves_a_connector_between_two_attached_shapes_by_anchor() {
        let mut from = base_shape("from", "rect", 0.0, 0.0, 100.0, 100.0);
        from.style = style("#fff", "#000");
        let to = base_shape("to", "rect", 300.0, 0.0, 100.0, 100.0);

        let mut connector = base_shape("c", "connector", 0.0, 0.0, 0.0, 0.0);
        connector.from_shape_id = Some("from".to_string());
        connector.from_anchor = Some("right".to_string());
        connector.to_shape_id = Some("to".to_string());
        connector.to_anchor = Some("left".to_string());

        let commands = build_draw_commands(&[from, to, connector]);
        let line = commands
            .iter()
            .find_map(|c| match c {
                DrawCommand::Line(l) if l.stroke_width >= 2.0 && l.x1 == 100.0 => Some(l),
                _ => None,
            })
            .expect("connector line not found");
        assert_eq!((line.x1, line.y1), (100.0, 50.0)); // right side of `from`
        assert_eq!((line.x2, line.y2), (300.0, 50.0)); // left side of `to`
    }

    #[test]
    fn falls_back_to_a_free_point_when_a_connector_endpoint_has_no_attached_shape() {
        let mut connector = base_shape("c", "arrow", 0.0, 0.0, 0.0, 0.0);
        connector.points = Some(vec![PointDto { x: 5.0, y: 5.0 }, PointDto { x: 50.0, y: 60.0 }]);

        let commands = build_draw_commands(&[connector]);
        match &commands[0] {
            DrawCommand::Line(l) => {
                assert_eq!((l.x1, l.y1, l.x2, l.y2), (5.0, 5.0, 50.0, 60.0));
                assert!(l.arrow_head);
            }
            other => panic!("expected Line, got {other:?}"),
        }
    }

    #[test]
    fn converts_a_text_shape_with_defaults_for_missing_style_fields() {
        let mut shape = base_shape("t", "text", 0.0, 0.0, 100.0, 30.0);
        shape.content = Some("こんにちは".to_string());
        shape.align = Some("center".to_string());
        let commands = build_draw_commands(&[shape]);
        match &commands[0] {
            DrawCommand::Text(t) => {
                assert_eq!(t.content, "こんにちは");
                assert_eq!(t.align, "center");
                assert_eq!(t.color, (0, 0, 0)); // default when textColor absent
            }
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[test]
    fn converts_a_polygon_shapes_fraction_points_to_absolute_coordinates() {
        let mut shape = base_shape("p", "polygon", 10.0, 20.0, 100.0, 50.0);
        // A triangle: apex at the top-center, base spanning the full width.
        shape.points = Some(vec![
            PointDto { x: 0.5, y: 0.0 },
            PointDto { x: 1.0, y: 1.0 },
            PointDto { x: 0.0, y: 1.0 },
        ]);
        let commands = build_draw_commands(&[shape]);
        match &commands[0] {
            DrawCommand::Polygon(p) => {
                assert_eq!(p.points, vec![(60.0, 20.0), (110.0, 70.0), (10.0, 70.0)]);
                assert_eq!((p.cx, p.cy), (60.0, 45.0));
            }
            other => panic!("expected Polygon, got {other:?}"),
        }
    }

    #[test]
    fn drops_a_polygon_shape_with_no_points_instead_of_erroring() {
        let shape = base_shape("p", "polygon", 0.0, 0.0, 10.0, 10.0);
        assert_eq!(build_draw_commands(&[shape]), vec![]);
    }

    #[test]
    fn ignores_unknown_shape_kinds_instead_of_erroring() {
        let shape = base_shape("x", "future-shape-type", 0.0, 0.0, 10.0, 10.0);
        assert_eq!(build_draw_commands(&[shape]), vec![]);
    }
}
