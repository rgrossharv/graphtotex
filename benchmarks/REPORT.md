# Benchmark results

The converter is fast, but PDF source recovery is currently weak. Automatic mode mostly preserves original pages. Those pages are not editable LaTeX.

## Dataset

205 pinned TeX/PDF pairs from 8 repositories. The PDFs contain 2,946 pages.

Inputs and per-file checksums are in [dataset.json](dataset.json). Full numeric results and failures are in [results.json](results.json) and [results.csv](results.csv). Methods and caveats are in [README.md](README.md).

## Native converter

| Input / mode | Converted | Median time | Median TeX token change | Median text token F1 | Median strict equation recall |
|---|---:|---:|---:|---:|---:|
| auto | 205/205 | 77.0 ms | 98.0% | 0.0% | 0.0% |
| docx | 35/35 | 9.2 ms | 67.2% | 93.4% | 10.0% |
| editable | 205/205 | 77.7 ms | 76.9% | 73.6% | 0.0% |
| epub | 10/10 | 11.6 ms | 73.7% | 90.9% | 0.0% |
| html | 24/24 | 6.3 ms | 42.6% | 98.0% | 0.0% |
| odt | 27/27 | 41.7 ms | 51.0% | 63.6% | — |
| rtf | 0/19 | 0.0 ms | — | — | — |

Automatic mode preserves 2,858/2,946 pages (97.0%). Its wrapper output must not be interpreted as recovered source. Direct-format TeX scores use Pandoc output as their reference, rather than an original TeX file.

## Results by source repository

| Repository | Documents | Editable-mode TeX change | Editable-mode text F1 | Auto preserved pages |
|---|---:|---:|---:|---:|
| [Dreamaker203/math-lecture-notes](https://github.com/Dreamaker203/math-lecture-notes) | 142 | 77.7% | 71.3% | 1415/1415 |
| [Jad-srifi/regional-quant-circle](https://github.com/Jad-srifi/regional-quant-circle) | 12 | 36.2% | 96.6% | 15/20 |
| [ausdavoud/Logic-and-Set-Theory-Exercises](https://github.com/ausdavoud/Logic-and-Set-Theory-Exercises) | 5 | 91.7% | 62.6% | 15/15 |
| [ovega14/RealAnalysis_solutions](https://github.com/ovega14/RealAnalysis_solutions) | 14 | 61.3% | 90.0% | 66/67 |
| [pmichaillat/math-for-macro](https://github.com/pmichaillat/math-for-macro) | 7 | 76.0% | 70.0% | 44/71 |
| [sleepymalc/Notes](https://github.com/sleepymalc/Notes) | 12 | 99.3% | 91.7% | 1210/1265 |
| [vEnhance/web.evanchen.cc](https://github.com/vEnhance/web.evanchen.cc) | 5 | 94.1% | 96.6% | 10/10 |
| [yanhan/mit-1801-ps-unofficial-sol](https://github.com/yanhan/mit-1801-ps-unofficial-sol) | 8 | 61.6% | 84.6% | 83/83 |

## Google Docs

The public Precalculus syllabus was exported directly as DOCX and converted without a PDF intermediate. Conversion: ok; text token F1 against Pandoc’s DOCX reference: 100.0%. This one syllabus is not a general Google Docs or equation benchmark.

Against Google Docs’ own plain-text export, text token F1 is 97.3% and character error rate is 2.3%.

## Website worker

| Mode | Converted | Median worker time | Median TeX token change | Preserved pages |
|---|---:|---:|---:|---:|
| auto | 205/205 | 478.0 ms | 98.0% | 2858/2946 |
| editable | 205/205 | 393.9 ms | 67.5% | 0/2946 |

## Rendering spot checks

One first three-page sample per repository/mode. MuPDF grayscale at 72 dpi, output resized to source page bounds; F1 of ink pixels below 220. Not an equation-correctness metric.

| Mode | Compiled | Mean ink-pixel F1 | Missing-glyph warnings |
|---|---:|---:|---:|
| auto | 8/8 | 67.3% | 3 |
| editable | 8/8 | 6.6% | 9872 |

## Interpretation

The current PDF engine should be described as approximate text extraction plus visual preservation, not a general mathematical PDF decompiler. Recovering fractions, matrices, alignments, proofs, references, and original macros needs further work. Direct OMML and MathML conversion has access to explicit structure and should be preferred when that source exists.

Legacy DOC and RTF are unsupported. ODT styles and embedded equation objects, merged tables, numbering restarts, and some EPUB/image features require review. Benchmark conversion success does not imply exact fidelity.

Source/PDF synchronization was not proven by rebuilding upstream TeX. The corpus is imbalanced and the syntax metrics penalize valid alternate TeX. Use the repository breakdown and inspect cached diffs before interpreting a single number.
