//! Phase 0 spike: rasterize an SVG containing Japanese text to PNG via resvg,
//! to confirm font embedding / no tofu boxes before building the real export_png command.
use resvg::tiny_skia;
use resvg::usvg;

fn main() {
    let svg = r##"
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="240">
  <rect x="10" y="10" width="460" height="220" fill="#eef2f7" stroke="#1f3a5f" stroke-width="2"/>
  <text x="30" y="70" font-family="Yu Gothic, Meiryo, sans-serif" font-size="28" fill="#1f3a5f">コンサル資料の図解テスト</text>
  <text x="30" y="120" font-family="Yu Gothic, Meiryo, sans-serif" font-size="20" fill="#1f3a5f">ピラミッド・ロジックツリー・マトリクス・ベン図</text>
  <text x="30" y="160" font-family="Yu Gothic, Meiryo, sans-serif" font-size="20" fill="#1f3a5f">0123456789 ABCあいうえお漢字</text>
</svg>
"##;

    let mut fontdb = usvg::fontdb::Database::new();
    fontdb.load_system_fonts();
    println!("loaded {} system fonts", fontdb.len());

    let opt = usvg::Options {
        fontdb: std::sync::Arc::new(fontdb),
        ..Default::default()
    };

    let tree = usvg::Tree::from_str(svg, &opt).expect("failed to parse svg");
    let size = tree.size();
    let mut pixmap = tiny_skia::Pixmap::new(size.width() as u32, size.height() as u32)
        .expect("failed to create pixmap");

    resvg::render(&tree, tiny_skia::Transform::identity(), &mut pixmap.as_mut());

    let out_path = std::env::var("SPIKE_OUT").unwrap_or_else(|_| "png_spike_output.png".into());
    pixmap.save_png(&out_path).expect("failed to save png");
    println!("saved: {out_path}");
}
