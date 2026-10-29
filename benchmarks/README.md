# Document conversion benchmark

This benchmark measures conversion quality as well as speed. Its main corpus
contains 205 publicly accessible math TeX/PDF pairs from eight GitHub repositories,
covering 2,946 PDF pages. The files include course notes, problem sets, solutions,
Chinese teaching materials, and Persian logic exercises. Third-party DOCX, EPUB,
ODT, HTML, and RTF fixtures come from Pandoc and W3C; one public Google Doc is
exported directly to DOCX for an additional test. RTF is a negative compatibility
test, not an advertised supported input.

The corpus is intentionally a regression dataset, not a statistically representative
sample of all math publications. One repository contributes most documents, while
long English lecture notes contribute many pages. See repository-level results
before generalizing a pooled median. No document was selected based on its score.

## Reproduce

```sh
python3 -m venv .tools/bench-venv
.tools/bench-venv/bin/pip install -r benchmarks/requirements.txt
python3 benchmarks/collect.py --max-pairs 300
npm run build:wasm
npm run build:cli
npm run build
.tools/bench-venv/bin/python benchmarks/run.py --fresh --workers 3
PLAYWRIGHT_BROWSERS_PATH="$PWD/.tools/browser-binaries" node benchmarks/browser.mjs
.tools/bench-venv/bin/python benchmarks/render.py
.tools/bench-venv/bin/python benchmarks/summarize.py
```

Install Playwright's Chromium first (`npx playwright install chromium`), or point
`PLAYWRIGHT_BROWSERS_PATH` at an existing installation. For rendering, LuaLaTeX and
the packages in the generated output must be installed. `render.py` uses this
checkout's optional `.tools/texmf` tree and does not execute the upstream sources.

`collect.py` caches each repository's exact commit/tree and downloads only selected
PDFs, structured fixtures, and TeX dependencies. By default it reuses those pins.
`dataset.json` records paths, categories, URLs, SHA-256 hashes, and pairing rules.
`repositories.json` records both selected repositories and zero-pair discovery
results. Use `--refresh` if you intend to select newer commits.
No upstream build scripts or TeX documents are executed. Fresh checkouts reuse
the tracked commit pins. Use `--refresh` only to deliberately select new commits;
cached downloads are checked against Git's blob hash before being reused.

The raw corpus, source diffs, converted output, and logs stay in
`.tools/benchmark/`, outside version control and outside the deployed website.
Only manifests, aggregate reports, and row-level numeric results are tracked.
Public availability does not imply a common redistribution license; original
authors' licenses and attribution requirements continue to apply. Google Docs
exports stay local as well.

The optional Google Docs sample is the publicly shared **Precalculus** document
linked from the public Launch course catalog. Its native identity was verified
with the connected Google Drive tools before exporting. It is a syllabus and is
not a strong test of equation support. Do not add private Drive documents to the
public manifests. The website accepts its DOCX export directly, without a PDF
intermediate; the static website does not have authenticated Google Drive access.

## What each number means

- **Conversion success** means the engine produced output. It does not mean that
  the output is accurate, editable, or compilable.
- **TeX token change** is normalized Levenshtein distance, divided by the larger
  token count. Comments and the document preamble are removed, and local
  `input`, `include`, and `subfile` dependencies are expanded within the repository.
  This is a syntax metric, not semantic equivalence. Macros and alternate valid
  TeX spellings can cause large differences. A same-stem PDF and TeX at one
  repository commit are a candidate pair; the upstream PDF was not rebuilt to
  prove synchronization.
- **Text character error rate** compares normalized output text with an independent
  reference. It can exceed 100% when output inserts more characters than the
  reference contains. PDF references come from MuPDF, not the converter's parser.
  Direct-format references come from Pandoc. This includes reading-order and
  mathematical-text differences.
- **Text token F1** is a multiset token overlap measure. It measures retained
  content, without proving reading order or mathematical correctness.
- **Strict equation recall** compares Pandoc-parsed math strings after removing
  whitespace and `left`/`right` sizing. It is computed only when the reference
  parser exposes equations. It does not prove algebraic equivalence. Source macros
  unsupported by Pandoc limit coverage; OMML/MathML fixtures exercise direct math
  conversion separately.
- **Editable versus preserved pages** is always reported. An `includepdf` wrapper
  contributes no editable text and cannot count as successful source recovery.
- **Rendering** compiles only generated TeX and checks one first-three-page sample
  per repository and mode. Ink-pixel F1 penalizes layout changes; it is sensitive
  to font choice and alignment. Compiler success alone cannot prove fidelity, and
  missing-glyph warnings are counted separately.
- **Timing** is measured per CLI invocation or inside the website worker, with
  three concurrent jobs and normal filesystem/browser caching. CLI times include
  process startup and output writes; worker times include initialization and ZIP
  creation. Neither includes dataset downloads or offline scoring. Compare
  platforms and concurrency before drawing speed conclusions.

Timing runs are descriptive measurements on the development machine, without
CPU isolation or controlled host load. Native scoring and browser collection can
run concurrently; do not interpret small timing differences as speed rankings.

For direct formats, the TeX reference is Pandoc's canonical export because these
inputs have no original TeX source. These figures must not be mixed with original
TeX comparison scores. JSON and CSV retain errors and unsupported inputs rather
than silently excluding them.

The Google Docs export is a direct structured conversion. DOCX/EPUB/ODT do not
pass through PDF. Legacy `.doc`, RTF, DRM content, complex merged tables, custom
numbering, floating image placement, and some equation constructs remain limited
or unsupported; output warnings describe these cases.
