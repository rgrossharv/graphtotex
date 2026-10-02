# GraphToTeX

GraphToTeX is an app that graphs 2D and 3D expressions and exports what you see to TikZ. I made this webapp to speed up some of the homework I was doing for Econ1011b at Harvard since I really hate writing out Tikz by hand. I hope you find it useful!

## Commutative diagrams

Open **Diagrams** in the page switch, or link directly to `/#diagrams`.

- Add objects with TeX math labels such as `\mathcal{C}`, `H^n(X)`, or `A \otimes B`. Double-click the canvas to add an object, or choose the Object tool to place several.
- Drag objects into place. Choose **Arrow**, then click a source and a target. Clicking the source again creates a loop. Click an arrow to edit its label, endpoints, arrow tips, line style, bend, and label placement.
- Use ordinary arrows, inclusions, surjections, maps-to arrows, arrows in both directions, equality lines, dashed or dotted maps, curved arrows, and loops. Parallel arrows automatically bend apart.
- Start with a square, triangle, pullback, short exact sequence, parallel functors, or cube. Presets and deletion are undoable.
- Shift-click to select several objects, then move, align, or duplicate the group and its internal arrows. Use grid snapping, pan, zoom, and Fit to arrange larger diagrams.
- Work is saved in this browser. **Save** downloads an editable JSON file; **Open** restores it. **Export TikZ** copies or downloads a picture snippet or a complete LaTeX document.

Diagram exports have **no watermark or frame** and use plain TikZ with named nodes and one `\draw` command per arrow. A typical export is:

```tex
\begin{tikzpicture}[>=Latex, every node/.style={inner sep=2pt}]
  \node (A) at (-2, 0) {$\mathcal{C}$};
  \node (B) at (2, 0) {$\mathcal{D}$};

  \draw[->] (A) to node[midway, auto] {$F$} (B);
\end{tikzpicture}
```

For snippets, add `\usepackage{tikz}` and `\usetikzlibrary{arrows.meta}` to your preamble, plus `\usepackage{amsmath,amssymb}` for AMS math commands. The complete document option includes these dependencies. Custom TeX commands are preserved, even when KaTeX cannot preview them; define those commands in your LaTeX document.

Run locally with `npm ci` and `npm run dev`. Build with `npm run build`.

## AI Acknowledgement

This project was vibecoded (using codex by openai) with follow-up adjustments and human testing for bugs and accuracy.

## Citation

If you used GraphToTeX in homeworks, reports, etc, and you have to cite it for school or just want to (definitely don't have to in my book) use one of the following. 

Plain text:

- Ryland Gross. *GraphToTeX: Interactive graphing calculator with TikZ export*. Built with Codex assistance. GitHub repository: `https://github.com/rgrossharv/graphtotex`.

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
