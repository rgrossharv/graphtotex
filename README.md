# GraphToTeX

GraphToTeX is an app that graphs 2D expressions and exports what you see to TikZ.

## Project Note

This project was vibecoded with follow-up adjustments and human testing.
I plan to add a 3D implementation in a future version.

## Features

- Expression list with add/remove/reorder and per-expression settings.
- Readable rendered math preview (KaTeX).
- Interactive 2D canvas graphing with pan/zoom, grid, axes, and ticks.
- Robust parse/eval handling with inline errors per expression.
- TikZ export modal with copy/download.
- Symbolic TikZ export for safe expression classes.
- Automatic coordinate fallback for unsupported/trig expressions.

## TikZ Export Notes

- Export button opens a modal with a paste-ready `tikzpicture` snippet.
- Trig/inverse trig expressions are intentionally exported as sampled coordinates to preserve radian behavior.
- Other safe expressions (polynomial/rational/powers/sqrt/abs/exp/ln/log) are exported symbolically when conversion is valid.
- Large sampled curves are downsampled in export to keep output practical.

## Citation

If you use GraphToTeX in homework, reports, notes, or other writeups, cite it using one of the following.

Plain text:

- Ryland Gross. *GraphToTeX: Interactive graphing calculator with TikZ export*. Built with Codex assistance. GitHub repository: `https://github.com/rylandgross/graphtotex`.

BibTeX:

```bibtex
@software{gross_graphtotex,
  author = {Gross, Ryland},
  title = {GraphToTeX: Interactive graphing calculator with TikZ export},
  year = {2026},
  url = {https://github.com/rgrossharv/graphtotex},
  note = {Built with Codex assistance}
}
```

You can also use `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/CITATION.cff` or `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/citation/graph-to-tex.bib`.

## Copyright

Copyright (c) 2026 Ryland Gross. MIT License
