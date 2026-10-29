# Local font metadata patch

Source: `pdf-extract` 0.12.1, from the crates.io package by Jeff Muizelaar,
<https://github.com/jrmuizel/pdf-extract>. Upstream declares the MIT license.

This copy adds a default `OutputDev::set_font` callback before each text run,
using the font dictionary's `BaseFont`. That exposes math font boundaries to
GraphToTeX without guessing from glyph positions. Calling it from `show_text`
also handles fonts restored through the PDF graphics-state stack.

The callback is the only behavior change from the published source. The package
manifest omits upstream development dependencies and its release profile. Keep
this small patch when updating the vendored source.
