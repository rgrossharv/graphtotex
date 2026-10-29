# GraphToTeX

2D and 3D graphing and commutative diagrams with TikZ/TikZ-CD export, plus scientific, calculus, linear algebra, and TeX document tools in Misc. A citation workspace is retained in the source but is not enabled on the website yet.

Run locally with `npm install` and `npm run dev`. Before building, set up Rust and run `npm run build:wasm` (see [native/README.md](native/README.md)). Build with `npm run build`.

Misc includes **PDF → TeX**: drag a PDF onto the tool for local conversion in a worker using PDF.js and a shared Rust/WebAssembly layout engine. Automatic mode reconstructs simple text pages and preserves complex pages from the input PDF. Editable mode extracts text only; visual mode preserves selected original pages. Download `.tex` or a ZIP containing the complete LuaLaTeX project and conversion notes. Scans need OCR for editable text, and original LaTeX, equation syntax, and document structure cannot in general be recovered. The browser supports files up to 250 MB and password entry for protected PDFs.

`npm run build:cli` builds and packages the native Rust CLI for the current platform. The website's CLI download section lists the archives actually present in its build. The deployment workflow builds Linux x64, Windows x64, and macOS Apple Silicon/Intel binaries, plus a Rust source archive. Usage: `graphtotex-pdf input.pdf -o output --mode auto --pages 1-3,5`. See [native/README.md](native/README.md) for builds, output modes, limitations, and memory use. Run `npm run test:pdf` after building WASM and packaging the CLI.

The same tool also converts DOCX, EPUB, ODT, HTML, Markdown, and UTF-8 text directly to TeX, without a PDF intermediate. Export Google Docs as Microsoft Word (.docx), then drop that file into the tool. Direct conversion uses the shared Rust engine in both WASM and the CLI, retaining supported document structure and OMML/MathML equations. Numbering, merged tables, styles, images, and unsupported math constructs may need review. Legacy binary `.doc`, RTF, and DRM-protected EPUB content are unsupported.

A reproducible public benchmark uses paired math sources/PDFs plus document-format fixtures. See [benchmarks/REPORT.md](benchmarks/REPORT.md) for measured results and [benchmarks/README.md](benchmarks/README.md) for methodology, manifests, checksums, and reproduction. Automatic PDF preservation is reported separately from editable source recovery.

The production build prerenders the React interface into real HTML for `/`, `/3d/`, `/diagram/`, and `/misc/`, including a distinct title, description, canonical URL, social metadata, and structured data for each workspace. JavaScript mounts the interactive app as before, so local diagram drafts and responsive behavior are preserved. Canvas fallback text and the diagram description also provide text alternatives without changing the visual layout.

Navigation uses ordinary links and the History API. Existing `/#3d`, `/#diagram`, and `/#2d` bookmarks still open the right workspace and are normalized to its canonical path. Direct URLs, including `/diagram` and `/3d`, work on GitHub Pages through the generated directories (Pages adds the trailing slash). Back/forward navigation works without reloading the app.

Every TikZ export dialog includes a compiled figure preview. The TeX runtime (TikZJax 1.6.0) and fonts load from jsDelivr only when an export opens, and compilation happens in an isolated browser frame. The first preview needs an internet connection; copying and downloading the source still work if the renderer cannot load. The preview uses the generated figure code with its required packages, including PGFPlots and TikZ-CD, and fits the result to a white preview area.

For 2D and 3D exports, choose **Custom axis scales…** in the aspect ratio menu to set the relative length of each axis unit (X/Y, plus Z in 3D). For example, X = 0.5 and Y = 1 squeezes the x axis while preserving the axis ranges. Export scale controls the overall figure size. Each graph mode remembers its own custom axis scales while the app is open.

2D curves use adaptive sampling to resolve curvature and domain boundaries at the canvas resolution. Tangent and other functions with poles are split into separate branches, including when zoomed far out vertically. TikZ exports use the same sampled branches for functions and rational expressions.

The static `/desmos-to-tikz/` guide explains how to recreate equations and export TikZ for LaTeX or Overleaf, including the current limitations on Desmos imports. It is linked from each workspace and included in the sitemap. Its content and links work without JavaScript. The calculator's title, description, and social metadata also describe its Desmos-style graphing and TikZ export.

`/misc/` contains a scientific calculator, calculus I–III operations, and matrix/vector calculations with TeX autocomplete, KaTeX previews, exact results, decimal approximations, and TeX downloads. Cortex Compute Engine parses and evaluates math in a worker loaded only when Calculate is used. Long calculations time out without blocking the interface. Run `npm run test:calculator` to check the supported operations.

The Complex graph tab plots functions of `z = x + iy` using domain coloring: hue represents argument, and brightness bands represent magnitude. It includes examples, zoom and center controls, point evaluation by input or graph click, TeX copying, and PNG download. Computation runs in a cancellable worker. Logarithms, square roots, and fractional powers use their principal branches.

Misc also compiles complete TeX documents to PDF using the bundled SwiftLaTeX pdfLaTeX runtime, with two passes for references and supporting-file uploads. Standard TeX Live 2020 packages load on demand from `https://texlive.texlyre.org/`; this requires a network connection. XeLaTeX-only packages and newer package APIs may require a different compiler. Compilation logs and cancellation are available. HTML export renders the compiled PDF with PDF.js into an offline, standalone HTML presentation. It preserves Beamer themes and math as page images with accessible page text, arrow-key navigation, an all-pages view, fullscreen controls, and print styles; overlays become separate slides. HTML export supports up to 100 pages. Runtime source and license information is in `public/vendor/swiftlatex/NOTICE.md`.

`scripts/prerender.mjs` generates the deployed sitemap from `src/lib/pages.ts` and copies `robots.txt` and `CNAME` into `dist`. Deploy the entire `dist` directory using the existing GitHub Pages workflow. To check the production output locally, run `npm run build`, `npm run test:seo`, and `npm run preview`. The deployment workflow also checks that each page contains crawlable HTML, correct metadata, and valid asset links before publishing.

After deployment, submit `https://graphtotex.com/sitemap.xml` in Google Search Console and inspect the four workspace URLs and the Desmos-to-TikZ guide to request indexing. Search engines control when pages are crawled and indexed.

Built by Ryland Gross with Codex assistance; GPT 6.1 sol also worked on the project.

GraphToTeX is public domain software under the [Unlicense](LICENSE). Bundled dependencies retain their own licenses. Citation metadata: [CITATION.cff](CITATION.cff) and [BibTeX](citation/graph-to-tex.bib).
