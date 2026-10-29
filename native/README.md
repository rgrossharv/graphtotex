# GraphToTeX PDF → LaTeX

A Rust CLI and shared WebAssembly layout engine. The website uses PDF.js for
extraction and this Rust core for reconstruction. The CLI uses pdf-extract/lopdf,
so font and parser support can differ between the two frontends.

The CLI also accepts DOCX, EPUB, ODT, HTML, Markdown, and UTF-8 text directly:
`graphtotex-pdf notes.docx -o notes-latex`. These formats use the same structured
converter as the browser, without a PDF intermediate. Google Docs can be exported
to DOCX first. Supported OMML/MathML equations become TeX fractions, roots, scripts,
matrices, and operators. Font obfuscation alone does not prevent EPUB conversion;
DRM-protected content is rejected. Legacy DOC and RTF are not supported.

Review warnings in `report.json`: numbering restarts, custom list labels, table
merges, footnotes, some equation constructs, and unsupported images can lose
structure or content. Markdown TeX expressions are treated as text. Direct output
may use `longtable` and `graphicx`; keep exported `assets/` with the TeX file.

## Use a downloaded binary

Extract the archive. On macOS/Linux run `chmod +x graphtotex-pdf` if your extractor
did not preserve executable permissions, then:

```sh
./graphtotex-pdf paper.pdf -o paper-latex --mode auto
./graphtotex-pdf paper.pdf -o selected --pages 1-3,5 --mode editable
./graphtotex-pdf scan.pdf -o scan-latex --mode visual
cd paper-latex
lualatex document.tex
```

On Windows use `graphtotex-pdf.exe`. Set the `PDFTOTEX_PASSWORD` environment variable
for password-protected files. The output directory must be new or empty.
`document.tex` contains the reconstruction; `source.pdf` is included only when
needed to preserve pages. Encrypted input is decrypted for the output copy.
`report.json` records per-page conversion notes. Keep all output files together,
or upload the folder to Overleaf and select LuaLaTeX. Unicode uses fontspec;
scripts such as CJK/Arabic may need suitable fonts and language packages.

## Modes and limitations

- **auto** reconstructs extractable text, infers headings and simple column order,
  and conservatively embeds pages containing drawings, images, rotated text, or
  unsupported glyphs. Extraction failures preserve the original page.
- **editable** emits selectable text only. Images/drawings are omitted; textless
  pages are represented by comments. Review math, tables, and reading order.
- **visual** wraps original pages with pdfpages, bypassing text reconstruction.
  It preserves appearance but does not make page content editable.

Original macros, labels, bibliography structure, math syntax, and document
structure cannot in general be recovered from PDF drawing instructions. This
tool does not contain OCR or an equation-recognition model. Corrupt PDFs, unknown
encryption, missing fonts, and resource exhaustion can still prevent conversion.
Editable reconstruction of literally any PDF is not possible.

## Build the CLI from source

Install current stable Rust and run from this archive's root:

```sh
cargo build --manifest-path native/Cargo.toml --locked --release -p graphtotex-pdf
cargo test --manifest-path native/Cargo.toml --locked
./native/target/release/graphtotex-pdf --help
```

The output binary is self-contained; TeX is needed only to compile its output.
macOS binaries built locally are unsigned. Linux builds use the runner's glibc.

## Build the website engine (full repository)

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.105 --locked
npm ci
npm run build:wasm
npm run build:cli
npm run build
```

`build:wasm` builds optimized Rust and matching JS bindings. `build:cli` packages
the current platform binary. `build` copies PDF.js CMaps/fonts, packages Rust
source and the download manifest, and builds the website. CI builds platform
archives before publishing. Generated files under public/vendor/pdf-to-tex,
public/vendor/pdfjs, and public/downloads are ignored and recreated by these commands.

## Performance and memory

The core sorts spans in O(n log n), with bounded line lookup. Conversion runs
page by page without rasterizing ordinary input. Browser parsing, WASM, and ZIP
creation run outside the UI thread; cancellation terminates the worker. PDF.js
owns a nested parser worker. Visual mode skips text extraction and copies the
PDF without recompressing it. Password-protected preserved pages are rendered
in the browser because PDF.js does not export decrypted PDFs, bounded to 3000
pixels per side. That rendering uses PDF.js's non-DOM filter adapter, so SVG
transfer filters are not applied to those rasterized protected pages.

After a production build, `npx playwright install chromium` and
`npm run test:pdf:browser` run the browser checks, including drag/drop, ZIP
assets, protected PDFs, cancellation, and narrow-screen layout.

The browser accepts up to 250 MB. Input PDF, accumulated TeX, and ZIP remain in
memory, so peak memory scales with file size. The native parser also loads the
PDF in memory. Large files may need a smaller page range or more memory. There
is no universal speed guarantee.

Dependencies retain their licenses: PDF.js (Apache-2.0), pdf-extract (MIT), lopdf
(MIT), wasm-bindgen (MIT/Apache-2.0), serde (MIT/Apache-2.0), fflate (MIT).
