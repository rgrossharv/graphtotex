//! Shared, page-at-a-time layout reconstruction. Coordinates use PDF points,
//! with x increasing right and y increasing down, normalized for page rotation.
use serde::{Deserialize, Serialize};
pub mod documents;
mod math;

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Span {
    pub text: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub size: f64,
    pub bold: bool,
    pub italic: bool,
    pub rotated: bool,
    /// Original font name, when the PDF extractor exposes it.
    pub font: String,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(default)]
pub struct Rule {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub thickness: f64,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct Page {
    pub number: u32,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub spans: Vec<Span>,
    #[serde(default)]
    pub complex: bool,
    #[serde(default)]
    pub rules: Vec<Rule>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Mode {
    #[default]
    Auto,
    Editable,
    Visual,
}

#[derive(Debug, Deserialize, Serialize)]
pub struct PageResult {
    pub number: u32,
    pub tex: String,
    pub characters: usize,
    pub preserved: bool,
    pub warnings: Vec<String>,
}

// Escaping is character-by-character: text that resembles TeX remains data.
pub fn escape_tex(text: &str) -> String {
    let mut out = String::with_capacity(text.len() + text.len() / 8);
    for c in text.chars() {
        out.push_str(match c {
            '\\' => "\\textbackslash{}",
            '{' => "\\{",
            '}' => "\\}",
            '$' => "\\$",
            '&' => "\\&",
            '#' => "\\#",
            '%' => "\\%",
            '_' => "\\_",
            '~' => "\\textasciitilde{}",
            '^' => "\\textasciicircum{}",
            '\u{00ad}' => "",
            '\u{00a0}' => "~",
            '\u{fb00}' => "ff",
            '\u{fb01}' => "fi",
            '\u{fb02}' => "fl",
            '\u{fb03}' => "ffi",
            '\u{fb04}' => "ffl",
            'α' => "\\ensuremath{\\alpha}",
            'β' => "\\ensuremath{\\beta}",
            'γ' => "\\ensuremath{\\gamma}",
            'δ' => "\\ensuremath{\\delta}",
            'θ' => "\\ensuremath{\\theta}",
            'λ' => "\\ensuremath{\\lambda}",
            'μ' => "\\ensuremath{\\mu}",
            'π' => "\\ensuremath{\\pi}",
            'σ' => "\\ensuremath{\\sigma}",
            'φ' => "\\ensuremath{\\phi}",
            'ω' => "\\ensuremath{\\omega}",
            'Σ' => "\\ensuremath{\\Sigma}",
            'Δ' => "\\ensuremath{\\Delta}",
            'Ω' => "\\ensuremath{\\Omega}",
            '∑' => "\\ensuremath{\\sum}",
            '∫' => "\\ensuremath{\\int}",
            '∞' => "\\ensuremath{\\infty}",
            '∂' => "\\ensuremath{\\partial}",
            '√' => "\\ensuremath{\\surd}",
            '∈' => "\\ensuremath{\\in}",
            '≤' => "\\ensuremath{\\leq}",
            '≥' => "\\ensuremath{\\geq}",
            '≠' => "\\ensuremath{\\neq}",
            '≈' => "\\ensuremath{\\approx}",
            '×' => "\\ensuremath{\\times}",
            '÷' => "\\ensuremath{\\div}",
            '−' => "\\ensuremath{-}",
            '²' => "\\textsuperscript{2}",
            '³' => "\\textsuperscript{3}",
            '¹' => "\\textsuperscript{1}",
            _ if c.is_control() && c != '\n' && c != '\t' => "",
            _ => {
                out.push(c);
                continue;
            }
        });
    }
    out
}

struct Line {
    spans: Vec<math::Fragment>,
    y: f64,
    size: f64,
    left: f64,
    right: f64,
}

impl Line {
    fn text(&self) -> (String, bool) {
        math::render_line(&self.spans)
    }
}

/// O(n log n) sorting; line lookup is bounded, avoiding quadratic page scans.
pub fn convert_page(mut page: Page, mode: Mode) -> Result<PageResult, String> {
    if !page.width.is_finite()
        || !page.height.is_finite()
        || page.width <= 0.0
        || page.height <= 0.0
    {
        return Err("Invalid PDF page dimensions".into());
    }
    if page.number == 0 {
        return Err("PDF page numbers start at 1".into());
    }
    page.spans.retain(|s| {
        !s.text.trim().is_empty()
            && s.x.is_finite()
            && s.y.is_finite()
            && s.width.is_finite()
            && s.size.is_finite()
            && s.size > 0.0
    });
    let characters = page.spans.iter().map(|s| s.text.chars().count()).sum();
    let unreadable = page.spans.iter().any(|s| s.text.contains('\u{fffd}'));
    let rotated = page.spans.iter().any(|s| s.rotated);
    let preserve = mode == Mode::Visual
        || (mode == Mode::Auto && (characters == 0 || page.complex || rotated || unreadable));
    let mut warnings = Vec::new();
    if characters == 0 {
        warnings.push("No extractable text. Scans need OCR for editable text.".into());
    }
    if page.complex {
        warnings.push("Figures, vector graphics, or a complex layout were detected.".into());
    }
    if rotated {
        warnings.push("Rotated or vertical text was detected.".into());
    }
    if unreadable {
        warnings.push("Some PDF glyphs have no usable Unicode mapping.".into());
    }
    if preserve {
        return Ok(PageResult { number: page.number, characters, preserved: true, warnings,
            tex: format!("% Page {}: preserved from source.pdf; not editable text.\n\\includepdf[pages={{{}}},fitpaper=true]{{source.pdf}}\n", page.number, page.number) });
    }
    // Character-weighted median avoids a large heading outweighing body text.
    let mut sizes: Vec<(f64, usize)> = page
        .spans
        .iter()
        .map(|s| (s.size, s.text.chars().count()))
        .collect();
    sizes.sort_unstable_by(|a, b| a.0.total_cmp(&b.0));
    let mut weight = 0;
    let body_size = sizes
        .iter()
        .find_map(|(size, count)| {
            weight += count;
            (weight >= characters / 2).then_some(*size)
        })
        .unwrap_or(11.0);
    let (mut fragments, structures) = math::reconstruct(page.spans, &page.rules, body_size);
    if structures > 0 {
        warnings.push(format!("Inferred {structures} mathematical structures from PDF geometry; review recovered equations."));
    }
    fragments
        .sort_by(|a, b| a.y.total_cmp(&b.y).then(a.x.total_cmp(&b.x)));
    let mut lines: Vec<Line> = Vec::new();
    for span in fragments {
        let found = lines
            .iter_mut()
            .rev()
            .take(6)
            .find(|line| (span.y - line.y).abs() < body_size * 0.36);
        if let Some(line) = found {
            line.left = line.left.min(span.x);
            line.right = line.right.max(span.x + span.width);
            line.size = line.size.max(span.size);
            line.spans.push(span);
        } else {
            lines.push(Line {
                y: span.y,
                size: span.size,
                left: span.x,
                right: span.x + span.width,
                spans: vec![span],
            });
        }
    }
    for line in &mut lines {
        line.spans.sort_by(|a, b| a.x.total_cmp(&b.x));
    }
    // Split a clear central gutter into two reading-order columns.
    let middle = page.width / 2.0;
    let split_count = lines
        .iter()
        .filter(|l| {
            l.spans.windows(2).any(|p| {
                p[0].x + p[0].width < middle
                    && p[1].x > middle
                    && p[1].x - p[0].x - p[0].width > body_size * 2.0
            })
        })
        .count();
    if split_count >= 3 {
        let mut left = Vec::new();
        let mut right = Vec::new();
        let mut full = Vec::new();
        for line in lines {
            if let Some(gap) = line.spans.windows(2).position(|p| {
                p[0].x + p[0].width < middle
                    && p[1].x > middle
                    && p[1].x - p[0].x - p[0].width > body_size * 2.0
            }) {
                let mut a = line.spans;
                let b = a.split_off(gap + 1);
                let make = |spans: Vec<math::Fragment>| Line {
                    left: spans[0].x,
                    right: spans.last().map(|s| s.x + s.width).unwrap_or(0.0),
                    y: line.y,
                    size: line.size,
                    spans,
                };
                left.push(make(a));
                right.push(make(b));
            } else if line.right < middle {
                left.push(line);
            } else if line.left > middle {
                right.push(line);
            } else {
                full.push(line);
            }
        }
        // Full-width headings partition column sections (e.g. title, abstract).
        lines = Vec::new();
        let mut left = left.into_iter().peekable();
        let mut right = right.into_iter().peekable();
        for divider in full {
            for column in [&mut left, &mut right] {
                while column.peek().is_some_and(|l| l.y < divider.y) {
                    lines.push(column.next().unwrap());
                }
            }
            lines.push(divider);
        }
        lines.extend(left);
        lines.extend(right);
        warnings.push("Two-column reading order was inferred; review tables and equations.".into());
    }
    let mut tex = format!(
        "% Page {}: editable reconstruction; review reading order and mathematics.\n",
        page.number
    );
    let mut last_y = None;
    for line in lines {
        let (text, is_math) = line.text();
        if text.is_empty() {
            continue;
        }
        if !is_math && line.size >= body_size * 1.3 && text.chars().count() < 200 {
            let command = if line.size >= body_size * 1.65 {
                "section*"
            } else {
                "subsection*"
            };
            tex.push_str(&format!("\n\\{command}{{{text}}}\n\n"));
        } else {
            if last_y.is_some_and(|y: f64| line.y - y > body_size * 1.65 || line.y < y) {
                tex.push('\n');
            }
            tex.push_str(&text);
            tex.push('\n');
        }
        last_y = Some(line.y);
    }
    tex.push_str("\n\\clearpage\n");
    Ok(PageResult {
        number: page.number,
        tex,
        characters,
        preserved: false,
        warnings,
    })
}

pub fn document_tex(pages: &[PageResult]) -> String {
    let mut out = String::from("% Reconstructed by GraphToTeX. Original LaTeX source is not recoverable from PDF.\n% Compile with LuaLaTeX. Keep source.pdf beside this file when pages are preserved.\n\\documentclass[11pt]{article}\n\\usepackage{fontspec}\n\\usepackage{amsmath,amssymb}\n\\usepackage[margin=1in]{geometry}\n\\usepackage{pdfpages}\n\\setlength{\\parindent}{0pt}\n\\setlength{\\parskip}{0.5em}\n\\begin{document}\n");
    for page in pages {
        out.push_str(&page.tex);
    }
    out.push_str("\\end{document}\n");
    out
}

#[cfg(target_arch = "wasm32")]
#[wasm_bindgen::prelude::wasm_bindgen]
pub fn reconstruct_page(json: &str, mode: &str) -> Result<String, String> {
    let page = serde_json::from_str(json).map_err(|e| e.to_string())?;
    let mode = serde_json::from_value(serde_json::Value::String(mode.into()))
        .map_err(|e| e.to_string())?;
    serde_json::to_string(&convert_page(page, mode)?).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn span(text: &str, x: f64, y: f64) -> Span {
        Span {
            text: text.into(),
            x,
            y,
            width: 100.0,
            size: 11.0,
            ..Span::default()
        }
    }
    fn page(spans: Vec<Span>) -> Page {
        Page {
            number: 1,
            width: 600.0,
            height: 800.0,
            spans,
            complex: false,
            rules: Vec::new(),
        }
    }
    #[test]
    fn escapes_untrusted_text() {
        assert_eq!(
            escape_tex("\\input{bad}%$&#_^~"),
            "\\textbackslash{}input\\{bad\\}\\%\\$\\&\\#\\_\\textasciicircum{}\\textasciitilde{}"
        );
    }
    #[test]
    fn sorts_and_joins_fragments() {
        let result = convert_page(
            page(vec![
                span("Second", 40.0, 100.0),
                span("world", 150.0, 40.0),
                span("Hello", 40.0, 40.0),
            ]),
            Mode::Auto,
        )
        .unwrap();
        assert!(!result.preserved);
        assert!(result.tex.contains("Hello world"));
        assert!(result.tex.find("Hello").unwrap() < result.tex.find("Second").unwrap());
    }
    #[test]
    fn preserves_scans_and_complex_pages() {
        assert!(convert_page(page(vec![]), Mode::Auto).unwrap().preserved);
        let mut p = page(vec![span("Caption", 30.0, 30.0)]);
        p.complex = true;
        assert!(convert_page(p, Mode::Auto).unwrap().preserved);
        assert!(
            !convert_page(page(vec![]), Mode::Editable)
                .unwrap()
                .preserved
        );
    }
    #[test]
    fn columns_read_down_before_across() {
        let spans = (0..4)
            .flat_map(|i| {
                [
                    span(&format!("Left{i}"), 40.0, 40.0 + i as f64 * 14.0),
                    span(&format!("Right{i}"), 350.0, 40.0 + i as f64 * 14.0),
                ]
            })
            .collect();
        let result = convert_page(page(spans), Mode::Editable).unwrap();
        assert!(result.tex.find("Left3").unwrap() < result.tex.find("Right0").unwrap());
    }
    #[test]
    fn unicode_math_and_ligatures() {
        assert_eq!(
            escape_tex("ﬁ π ≤ ∞"),
            "fi \\ensuremath{\\pi} \\ensuremath{\\leq} \\ensuremath{\\infty}"
        );
    }
    #[test]
    fn rejects_invalid_pages() {
        let mut p = page(vec![]);
        p.width = f64::NAN;
        assert!(convert_page(p, Mode::Auto).is_err());
    }
}
