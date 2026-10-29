#!/usr/bin/env python3
import collections,json,pathlib,statistics,hashlib
from run import ROOT,CACHE,aggregate,metrics,expand,normalize,tokens,bag_f1,ast,ast_plain
from rapidfuzz.distance import Levenshtein

report=json.loads((ROOT/'benchmarks/results.json').read_text());dataset=json.loads((ROOT/'benchmarks/dataset.json').read_text())
rows=report['rows'];text=['# Benchmark results\n','The converter is fast, but PDF source recovery is currently weak. Automatic mode mostly preserves original pages. Those pages are not editable LaTeX.\n']
text+=['## Dataset\n',f'{len(dataset["pairs"])} pinned TeX/PDF pairs from {len(set(p["repository"] for p in dataset["pairs"]))} repositories. The PDFs contain {report["groups"]["editable"]["pages"]:,} pages.\n','Inputs and per-file checksums are in [dataset.json](dataset.json). Full numeric results and failures are in [results.json](results.json) and [results.csv](results.csv). Methods and caveats are in [README.md](README.md).\n']
text+=['## Native converter\n','| Input / mode | Converted | Median time | Median TeX token change | Median text token F1 | Median strict equation recall |','|---|---:|---:|---:|---:|---:|']
def pct(n):return f'{100*n:.1f}%' if n is not None else '—'
for group,data in report['groups'].items():
    text.append(f'| {group} | {data["converted"]}/{data["attempted"]} | {data.get("seconds_median",0)*1000:.1f} ms | {pct(data.get("tex_token_change_median"))} | {pct(data.get("text_token_f1_median"))} | {pct(data.get("exact_equation_recall_median"))} |')
auto=report['groups']['auto'];text+=['',f'Automatic mode preserves {auto["preserved_pages"]:,}/{auto["pages"]:,} pages ({100*auto["preserved_pages"]/auto["pages"]:.1f}%). Its wrapper output must not be interpreted as recovered source. Direct-format TeX scores use Pandoc output as their reference, rather than an original TeX file.\n','## Results by source repository\n','| Repository | Documents | Editable-mode TeX change | Editable-mode text F1 | Auto preserved pages |','|---|---:|---:|---:|---:|']
for repo in sorted(set(r['repository'] for r in rows if r['kind']=='pdf')):
    a=aggregate([r for r in rows if r['repository']==repo and r['mode']=='auto']);e=aggregate([r for r in rows if r['repository']==repo and r['mode']=='editable'])
    text.append(f'| [{repo}](https://github.com/{repo}) | {e["attempted"]} | {pct(e.get("tex_token_change_median"))} | {pct(e.get("text_token_f1_median"))} | {a["preserved_pages"]}/{a["pages"]} |')
public=[r for r in rows if r['repository']=='public Google Docs']
if public:
    r=public[0];text+=['\n## Google Docs\n',f'The public Precalculus syllabus was exported directly as DOCX and converted without a PDF intermediate. Conversion: {r["status"]}; text token F1 against Pandoc’s DOCX reference: {pct(r.get("text_token_f1"))}. This one syllabus is not a general Google Docs or equation benchmark.\n']
    original=CACHE/'google-docs/precalculus.txt'
    if original.exists() and r.get('output_directory'):
        output=(CACHE/r['output_directory']/'document.tex').read_text();a=normalize(original.read_text(encoding='utf-8-sig'));b=normalize(ast_plain(ast(output)))
        text.append(f'Against Google Docs’ own plain-text export, text token F1 is {pct(bag_f1(tokens(a),tokens(b)))} and character error rate is {pct(Levenshtein.distance(a,b)/max(1,len(a)))}.\n')
        meta={'url':'https://docs.google.com/document/d/1cplaMhNt3QYCkVWwo8Imn6bMAopecxRM_PH_LuyCwOI/','title':'Precalculus','native_mime_type':'application/vnd.google-apps.document','source':'Public Launch course catalog','files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in original.parent.glob('precalculus.*') if p.is_file()}}
        (ROOT/'benchmarks/google-docs.json').write_text(json.dumps(meta,indent=2)+'\n')
browser_path=ROOT/'benchmarks/browser-results.json'
if browser_path.exists():
    browser=json.loads(browser_path.read_text());pairs={p['id']:p for p in dataset['pairs']};scored=[]
    for r in browser['results']:
        r=dict(r)
        if r['status']=='ok':
            pair=pairs[r['id']];original=expand(CACHE/pair['local_source'],CACHE/'repos'/pair['repository'].replace('/','__'))
            output=(CACHE/'browser'/r['id']/(r['mode']+'.tex')).read_text();r.update(metrics(original,output));r['editable_pages']=r['pages']-r['preserved_pages']
        scored.append(r)
    text+=['## Website worker\n','| Mode | Converted | Median worker time | Median TeX token change | Preserved pages |','|---|---:|---:|---:|---:|']
    summary={}
    for mode in ['auto','editable']:
        g=aggregate([r for r in scored if r['mode']==mode]);summary[mode]=g;text.append(f'| {mode} | {g["converted"]}/{g["attempted"]} | {1000*g.get("seconds_median",0):.1f} ms | {pct(g.get("tex_token_change_median"))} | {g["preserved_pages"]}/{g["pages"]} |')
    (ROOT/'benchmarks/browser-scores.json').write_text(json.dumps({'groups':summary,'rows':scored},indent=2)+'\n')
render_path=ROOT/'benchmarks/render-results.json'
if render_path.exists():
    render=json.loads(render_path.read_text());text+=['\n## Rendering spot checks\n',render['method']+'\n','| Mode | Compiled | Mean ink-pixel F1 | Missing-glyph warnings |','|---|---:|---:|---:|']
    for mode in ['auto','editable']:
        r=[v for v in render['records'] if v['mode']==mode];values=[v['ink_overlap_f1_mean'] for v in r if v.get('ink_overlap_f1_mean') is not None]
        text.append(f'| {mode} | {sum(v["status"]=="compiled" for v in r)}/{len(r)} | {pct(statistics.mean(values) if values else None)} | {sum(v.get("missing_glyph_warnings",0) for v in r)} |')
text+=['\n## Interpretation\n','The current PDF engine should be described as approximate text extraction plus visual preservation, not a general mathematical PDF decompiler. Recovering fractions, matrices, alignments, proofs, references, and original macros needs further work. Direct OMML and MathML conversion has access to explicit structure and should be preferred when that source exists.','\nLegacy DOC and RTF are unsupported. ODT styles and embedded equation objects, merged tables, numbering restarts, and some EPUB/image features require review. Benchmark conversion success does not imply exact fidelity.','\nSource/PDF synchronization was not proven by rebuilding upstream TeX. The corpus is imbalanced and the syntax metrics penalize valid alternate TeX. Use the repository breakdown and inspect cached diffs before interpreting a single number.']
(ROOT/'benchmarks/REPORT.md').write_text('\n'.join(text)+'\n');print('Wrote benchmarks/REPORT.md',flush=True)
