# GraphToTeX

GraphToTeX is a static React + TypeScript app that graphs 2D expressions and exports what you see to TikZ.

## Project Note

GraphToTeX was made by Ryland Gross with help from Codex to support homework and math writing workflows.
I plan to add a 3D implementation in a future version.

## Features

- Expression list with add/remove/reorder and per-expression settings.
- Human-readable rendered math preview (KaTeX).
- Interactive 2D canvas graphing with pan/zoom, grid, axes, and ticks.
- Robust parse/eval handling with inline errors per expression.
- TikZ export modal with copy/download.
- Symbolic TikZ export for safe expression classes.
- Automatic coordinate fallback for unsupported/trig expressions.

## Tech

- Vite + React + TypeScript
- `mathjs` for parsing/evaluation
- `katex` for rendered equation preview
- HTML5 canvas rendering

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run dev server:
   ```bash
   npm run dev
   ```
3. Open the local URL shown by Vite.

## Build

```bash
npm run build
```

The production output is in `dist/`.

## TikZ Export Notes

- Export button opens a modal with a paste-ready `tikzpicture` snippet.
- Trig/inverse trig expressions are intentionally exported as sampled coordinates to preserve radian behavior.
- Other safe expressions (polynomial/rational/powers/sqrt/abs/exp/ln/log) are exported symbolically when conversion is valid.
- Large sampled curves are downsampled in export to keep output practical.

Main exporter code:
- `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/src/lib/tikzExport.ts`
- `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/src/lib/tikzExpr.ts`

## Deploy to GitHub Pages

This repo includes an Actions workflow at:
- `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/.github/workflows/deploy.yml`

Steps:

1. Push project to GitHub (default branch `main`).
2. In repo settings, enable **Pages** with source **GitHub Actions**.
3. Workflow will build and deploy on each push to `main`.

`vite.config.ts` already uses:

```ts
base: '/graphtotex/'
```

This is correct for Pages when the repository name is `graphtotex`.

## Custom Domain

A placeholder `CNAME` file is included:
- `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/CNAME`

Replace its content with your actual domain (for example `graph.example.com`), then configure DNS records in your domain provider and GitHub Pages settings.

## Mobile

Layout collapses to single-column on smaller screens with the graph still fully interactive.

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
  url = {https://github.com/rylandgross/graphtotex},
  note = {Built with Codex assistance}
}
```

You can also use `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/CITATION.cff` or `/Users/rylandgross/Documents/MyStuff/Archive/graphtotex/citation/graph-to-tex.bib`.
