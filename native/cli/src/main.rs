use graphtotex_pdf_core::{convert_page, document_tex, Mode, Page, Rule, Span};
use pdf_extract::{
    ColorSpace, Document, MediaBox, OutputDev, OutputError, Path as PdfPath, PathOp, Transform,
};
use std::{env, fs, path::PathBuf, process::ExitCode, time::Instant};

const HELP: &str = "GraphToTeX Documents → LaTeX 0.1.0
Usage: graphtotex-pdf INPUT [-o OUTPUT_DIRECTORY] [--mode auto|editable|visual] [--pages 1-3,5]
Input: PDF, DOCX, EPUB, ODT, HTML, Markdown, or UTF-8 text.

  -o, --output DIR   New or empty output directory (default: INPUT-latex)
  --mode MODE       auto: reconstruct text and preserve complex pages (default)
                    editable: reconstruct text and math; visual: preserve original pages
  --pages RANGES     Selected pages, in document order (default: all)
  -h, --help         Show this help
  -V, --version      Show version

Set PDFTOTEX_PASSWORD in the environment for an encrypted PDF.
Compile output/document.tex with LuaLaTeX. Keep source.pdf beside it.
PDFs do not retain original LaTeX; equations and tables need review.
Scans are preserved as PDF pages. OCR is not included.
";

struct Capture {
    page: Page,
    left: f64,
    top: f64,
    font: String,
}
impl Capture {
    fn new(number: u32) -> Self {
        Self {
            page: Page {
                number,
                width: 612.0,
                height: 792.0,
                spans: vec![],
                rules: vec![],
                complex: false,
            },
            left: 0.0,
            top: 792.0,
            font: String::new(),
        }
    }

    fn point(&self, matrix: &Transform, x: f64, y: f64) -> (f64, f64) {
        (matrix.m11 * x + matrix.m21 * y + matrix.m31 - self.left,
         self.top - (matrix.m12 * x + matrix.m22 * y + matrix.m32))
    }

    fn rule(&mut self, a: (f64, f64), b: (f64, f64), thickness: f64) {
        let width = (b.0 - a.0).abs();
        if width >= 2.0 && (a.1 - b.1).abs() <= 0.3 && thickness <= 2.0 {
            self.page.rules.push(Rule { x: a.0.min(b.0), y: (a.1 + b.1) / 2.0,
                width, thickness: thickness.max(0.1) });
        }
    }

    fn capture_rules(&mut self, matrix: &Transform, path: &PdfPath, filled: bool) {
        let mut current = None;
        for op in &path.ops {
            match *op {
                PathOp::MoveTo(x, y) => current = Some(self.point(matrix, x, y)),
                PathOp::LineTo(x, y) => {
                    let next = self.point(matrix, x, y);
                    // Open filled paths have no painted line; stroked paths do.
                    if !filled { if let Some(previous) = current { self.rule(previous, next, 0.5); } }
                    current = Some(next);
                }
                PathOp::Rect(x, y, w, h) => {
                    let a = self.point(matrix, x, y + h / 2.0);
                    let b = self.point(matrix, x + w, y + h / 2.0);
                    self.rule(a, b, h.abs() * matrix.m21.hypot(matrix.m22));
                    current = None;
                }
                _ => current = None,
            }
        }
    }
}
impl OutputDev for Capture {
    fn set_font(&mut self, name: &str) -> Result<(), OutputError> {
        self.font.clear();
        self.font.push_str(name);
        Ok(())
    }
    fn begin_page(
        &mut self,
        _number: u32,
        bbox: &MediaBox,
        _art: Option<(f64, f64, f64, f64)>,
    ) -> Result<(), OutputError> {
        self.page.width = bbox.urx - bbox.llx;
        self.page.height = bbox.ury - bbox.lly;
        self.left = bbox.llx;
        self.top = bbox.ury;
        Ok(())
    }
    fn output_character(
        &mut self,
        matrix: &Transform,
        width: f64,
        _spacing: f64,
        font_size: f64,
        text: &str,
    ) -> Result<(), OutputError> {
        let x = matrix.m31 - self.left;
        let y = self.top - matrix.m32;
        let size = font_size.abs() * matrix.m21.hypot(matrix.m22);
        let width = (width * font_size * matrix.m11).abs();
        let rotated = matrix.m12.abs() > matrix.m11.abs() * 0.1 || matrix.m11 < 0.0;
        if let Some(last) = self.page.spans.last_mut() {
            let gap = x - last.x - last.width;
            if (last.y - y).abs() < 0.1
                && (last.size - size).abs() < 0.1
                && gap.abs() < size * 0.25
                && last.rotated == rotated
                && last.font == self.font
            {
                last.text.push_str(text);
                last.width = x + width - last.x;
                return Ok(());
            }
        }
        self.page.spans.push(Span {
            text: text.into(),
            x,
            y,
            width,
            size,
            rotated,
            font: self.font.clone(),
            italic: self.font.to_ascii_lowercase().contains("italic"),
            bold: self.font.to_ascii_lowercase().contains("bold"),
            ..Span::default()
        });
        Ok(())
    }
    fn end_page(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn begin_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn end_word(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn end_line(&mut self) -> Result<(), OutputError> {
        Ok(())
    }
    fn stroke(
        &mut self,
        matrix: &Transform,
        _: &ColorSpace,
        _: &[f64],
        path: &PdfPath,
    ) -> Result<(), OutputError> {
        self.page.complex = true;
        self.capture_rules(matrix, path, false);
        Ok(())
    }
    fn fill(
        &mut self,
        matrix: &Transform,
        _: &ColorSpace,
        _: &[f64],
        path: &PdfPath,
    ) -> Result<(), OutputError> {
        self.page.complex = true;
        self.capture_rules(matrix, path, true);
        Ok(())
    }
}

fn selection(input: &str, count: u32) -> Result<Vec<u32>, String> {
    if input.trim().is_empty() {
        return Ok((1..=count).collect());
    }
    let mut pages = std::collections::BTreeSet::new();
    for part in input.split(',') {
        let range: Vec<_> = part.trim().split('-').map(str::trim).collect();
        if range.is_empty() || range.len() > 2 {
            return Err("Invalid page range".into());
        }
        let a: u32 = range[0].parse().map_err(|_| "Invalid page number")?;
        let b: u32 = range
            .last()
            .unwrap()
            .parse()
            .map_err(|_| "Invalid page number")?;
        if a < 1 || b < a || b > count {
            return Err(format!(
                "Choose pages from 1 to {count}, in ascending ranges"
            ));
        }
        pages.extend(a..=b);
    }
    Ok(pages.into_iter().collect())
}

fn run() -> Result<(), String> {
    let mut args = env::args_os().skip(1);
    let mut input = None;
    let mut output = None;
    let mut mode = Mode::Auto;
    let mut ranges = String::new();
    while let Some(arg) = args.next() {
        match arg.to_str() {
            Some("-h" | "--help") => {
                print!("{HELP}");
                return Ok(());
            }
            Some("-V" | "--version") => {
                println!("graphtotex-pdf {}", env!("CARGO_PKG_VERSION"));
                return Ok(());
            }
            Some("-o" | "--output") => {
                output = Some(PathBuf::from(
                    args.next().ok_or("--output requires a directory")?,
                ))
            }
            Some("--pages") => {
                ranges = args
                    .next()
                    .ok_or("--pages requires a range")?
                    .to_string_lossy()
                    .into()
            }
            Some("--mode") => {
                mode = match args.next().ok_or("--mode requires a value")?.to_str() {
                    Some("auto") => Mode::Auto,
                    Some("editable") => Mode::Editable,
                    Some("visual") => Mode::Visual,
                    _ => return Err("Mode must be auto, editable, or visual".into()),
                }
            }
            Some(s) if s.starts_with('-') => return Err(format!("Unknown argument: {s}")),
            _ if input.is_none() => input = Some(PathBuf::from(arg)),
            _ => return Err("Only one input document is accepted".into()),
        }
    }
    let input = input.ok_or(HELP)?;
    let output = output.unwrap_or_else(|| {
        input.with_file_name(format!(
            "{}-latex",
            input.file_stem().unwrap_or_default().to_string_lossy()
        ))
    });
    if output.exists()
        && (!output.is_dir()
            || fs::read_dir(&output)
                .map_err(|e| e.to_string())?
                .next()
                .is_some())
    {
        return Err(
            "Output must be a new or empty directory; existing files will not be overwritten"
                .into(),
        );
    }
    let start = Instant::now();
    let format = input
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("pdf")
        .to_ascii_lowercase();
    if format != "pdf" {
        if !ranges.is_empty() {
            return Err(
                "Page ranges apply to PDFs; structured documents use their own reading order."
                    .into(),
            );
        }
        let bytes = fs::read(&input).map_err(|e| e.to_string())?;
        let result = graphtotex_pdf_core::documents::convert_document(&bytes, &format)?;
        fs::create_dir_all(&output).map_err(|e| e.to_string())?;
        for asset in &result.assets {
            let path = output.join(&asset.name);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(path, &asset.data).map_err(|e| e.to_string())?;
        }
        fs::write(output.join("document.tex"), &result.tex).map_err(|e| e.to_string())?;
        let report = serde_json::json!({"format":result.format,"blocks":result.blocks,"equations":result.equations,"warnings":result.warnings,"assets":result.assets.iter().map(|a|&a.name).collect::<Vec<_>>()});
        fs::write(
            output.join("report.json"),
            serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?,
        )
        .map_err(|e| e.to_string())?;
        eprintln!(
            "{} blocks, {} equations in {:.3}s → {}",
            result.blocks,
            result.equations,
            start.elapsed().as_secs_f64(),
            output.display()
        );
        return Ok(());
    }
    // Password must be supplied while loading: encrypted object streams cannot
    // be populated by decrypting an already partially loaded document.
    let mut doc =
        Document::load_with_password(&input, &env::var("PDFTOTEX_PASSWORD").unwrap_or_default())
            .map_err(|e| {
                format!("Could not open PDF: {e}. For protected PDFs, set PDFTOTEX_PASSWORD.")
            })?;
    let encrypted = doc.was_encrypted();
    if doc.is_encrypted() {
        return Err("Set PDFTOTEX_PASSWORD to the correct PDF password.".into());
    }
    let ids = doc.get_pages();
    if ids.is_empty() {
        return Err("The PDF has no pages".into());
    }
    let selected = selection(&ranges, ids.len() as u32)?;
    let mut results = Vec::with_capacity(selected.len());
    for number in selected {
        let mut capture = Capture::new(number);
        if mode != Mode::Visual {
            let extraction = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                pdf_extract::output_doc_page(&doc, &mut capture, number)
            }));
            if !matches!(extraction, Ok(Ok(()))) {
                if mode == Mode::Editable {
                    return Err(format!(
                        "Could not extract page {number}; try --mode auto or visual"
                    ));
                }
                let mut preserved = convert_page(Capture::new(number).page, Mode::Visual)?;
                preserved.warnings = vec!["Extraction failed; original page preserved.".into()];
                results.push(preserved);
                continue;
            }
            if let Ok(content) = doc.get_and_decode_page_content(ids[&number]) {
                capture.page.complex |= content
                    .operations
                    .iter()
                    .any(|op| matches!(op.operator.as_str(), "Do" | "BI" | "sh"));
            }
            // pdf-extract does not apply page-tree Rotate. Preserve rotated pages in auto mode.
            let mut id = ids[&number];
            for _ in 0..64 {
                let Ok(dict) = doc.get_dictionary(id) else {
                    break;
                };
                if let Ok(rotation) = dict.get(b"Rotate").and_then(|v| v.as_i64()) {
                    capture.page.complex |= rotation.rem_euclid(360) != 0;
                    break;
                }
                match dict.get(b"Parent").and_then(|v| v.as_reference()) {
                    Ok(parent) => id = parent,
                    Err(_) => break,
                }
            }
        }
        let mut result = convert_page(capture.page, mode)?;
        if mode == Mode::Visual {
            result.warnings.clear();
        }
        eprintln!(
            "Page {number}: {}",
            if result.preserved {
                "preserved"
            } else {
                "editable"
            }
        );
        results.push(result);
    }
    fs::create_dir_all(&output).map_err(|e| e.to_string())?;
    if results.iter().any(|p| p.preserved) {
        if encrypted {
            doc.save(output.join("source.pdf"))
                .map_err(|e| e.to_string())?;
        } else {
            fs::copy(&input, output.join("source.pdf")).map_err(|e| e.to_string())?;
        }
    }
    fs::write(output.join("document.tex"), document_tex(&results)).map_err(|e| e.to_string())?;
    fs::write(
        output.join("report.json"),
        serde_json::to_vec_pretty(&results).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::write(output.join("README.txt"), "Compile with: lualatex document.tex\nKeep source.pdf beside document.tex when pages are preserved.\nEditable reconstruction is approximate. Review math, tables, columns, and fonts.\nScans need OCR for editable text.\n").map_err(|e|e.to_string())?;
    let preserved = results.iter().filter(|p| p.preserved).count();
    eprintln!(
        "{} pages ({} editable, {} preserved) in {:.3}s → {}",
        results.len(),
        results.len() - preserved,
        preserved,
        start.elapsed().as_secs_f64(),
        output.display()
    );
    Ok(())
}
fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn page_selection() {
        assert_eq!(selection("3,1-2,2", 3).unwrap(), vec![1, 2, 3]);
        assert!(selection("1-999999999", 3).is_err());
        assert!(selection("3-2", 3).is_err());
        assert!(selection("0", 3).is_err());
    }
}
