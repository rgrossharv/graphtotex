import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { transformWithEsbuild } from 'vite';

const { code } = await transformWithEsbuild(await readFile('src/lib/graphToTexCitation.ts', 'utf8'), 'graphToTexCitation.ts');
const { GRAPH_TO_TEX, graphToTexStandardLatex, graphToTexBibtex } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);

test('generated and downloadable citations describe the current math tools without advertising citation tools', async () => {
  assert.doesNotMatch(GRAPH_TO_TEX.title, /citations/i);
  for (const value of [graphToTexStandardLatex(), graphToTexBibtex(), await readFile('CITATION.cff', 'utf8'), await readFile('citation/graph-to-tex.bib', 'utf8')]) {
    assert.match(value, /Graphs, diagrams, and math tools/);
    assert.doesNotMatch(value, /and citations|citation tools/i);
  }
  assert.match(await readFile('LICENSE', 'utf8'), /released into the public domain/);
});
