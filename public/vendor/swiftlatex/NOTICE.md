The PdfTeX WebAssembly runtime and JavaScript glue in this directory are from
SwiftLaTeX release v20022022 (20-02-2022.zip):
https://github.com/SwiftLaTeX/SwiftLaTeX/releases/tag/v20022022

Upstream source: https://github.com/SwiftLaTeX/SwiftLaTeX/tree/master/pdftex.wasm
Copyright SwiftLab and the respective pdfTeX, TeX Live, and Emscripten authors.
See LICENSE and the upstream source for the component licenses.

Local change: the JavaScript glue reports package download progress to its
parent worker client. The TeX compiler itself is unmodified.

TeX packages are fetched on demand from https://texlive.texlyre.org/ and are
subject to their respective TeX Live licenses. Document compilation stays in
the browser.
