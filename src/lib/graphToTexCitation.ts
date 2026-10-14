export const GRAPH_TO_TEX = {
  key: 'gross_graphtotex',
  author: 'Ryland Gross',
  title: 'GraphToTeX: Graphs, diagrams, and citations for LaTeX',
  year: 2026,
  url: 'https://graphtotex.com'
};

export function graphToTexStandardLatex(): string {
  return [
    '% No additional packages required. Paste near the end of your document.',
    '% Cite in your text with \\cite{gross_graphtotex}.',
    '\\begin{thebibliography}{9}',
    `\\bibitem{${GRAPH_TO_TEX.key}}`,
    `${GRAPH_TO_TEX.author}.`,
    `\\emph{${GRAPH_TO_TEX.title}} (${GRAPH_TO_TEX.year}).`,
    `\\texttt{${GRAPH_TO_TEX.url}}.`,
    '\\end{thebibliography}'
  ].join('\n');
}

export function graphToTexBibtex(): string {
  return [
    `@misc{${GRAPH_TO_TEX.key},`,
    '  author = {Gross, Ryland},',
    `  title = {GraphToTeX: Graphs, diagrams, and citations for {LaTeX}},`,
    `  year = {${GRAPH_TO_TEX.year}},`,
    `  url = {${GRAPH_TO_TEX.url}},`,
    `  howpublished = {\\texttt{${GRAPH_TO_TEX.url}}}`,
    '}'
  ].join('\n');
}
