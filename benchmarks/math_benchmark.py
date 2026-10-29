#!/usr/bin/env python3
"""Before/after equation checks. Never compile downloaded upstream TeX.

Run with .tools/bench-venv/bin/python benchmarks/math_benchmark.py --label before --binary ...
Then repeat with --label after and the rebuilt binary. Existing broad results stay intact.
"""
import argparse, collections, hashlib, json, os, pathlib, platform, re, statistics, subprocess, time, xml.etree.ElementTree as ET
import pymupdf
import pypandoc
from rapidfuzz.distance import Levenshtein
from run import ast, ast_plain, bag_f1, body, expand, math_nodes, normalize, tokens

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.tools/math-benchmark'
DATA = ROOT / '.tools/benchmark'
PANDOC = pypandoc.get_pandoc_path()
SENTINEL = 'Ordinary prose remains readable. The answer follows below.'
PUBLIC_IDS = ['13987801a9bcb1c0', '71bf4e26522eadd1', '1c02b66733bd478f', 'ac1298692b46c41f']
CONSTRUCTS = {'mfrac', 'msqrt', 'mroot', 'msup', 'msub', 'msubsup', 'munder', 'mover', 'munderover', 'mtable'}

def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def run(args, **kw): return subprocess.run([str(a) for a in args], capture_output=True, timeout=kw.pop('timeout', 60), **kw)
def texenv():
    return {**os.environ, 'TEXMFHOME': str(ROOT/'.tools/texmf'), 'TEXMFVAR': str(ROOT/'.tools/tex-cache'), 'TEXMFCONFIG': str(ROOT/'.tools/tex-config'), 'TEXMFCACHE': str(ROOT/'.tools/tex-cache')}
def compile_tex(directory, filename='document.tex'):
    result = run(['lualatex', '-interaction=nonstopmode', '-halt-on-error', '-no-shell-escape', filename], cwd=directory, env=texenv())
    (directory / (pathlib.Path(filename).stem + '.compile.log')).write_bytes(result.stdout + result.stderr)
    return {'compiled': result.returncode == 0, 'missing_glyph_warnings': result.stdout.count(b'Missing character:')}

def presentation(tex):
    """Pandoc/texmath's presentation tree, not algebraic equivalence.

    Remove spacing/style/group wrappers only. Preserve operator and argument order.
    Exact matches can still reject semantically equal formulas (e.g. x+x vs 2x).
    """
    converted = run([PANDOC, '--sandbox', '-f', 'latex', '-t', 'html', '--mathml'], input=tex.encode())
    if converted.returncode: return [], collections.Counter()
    formulas = []
    structures = collections.Counter()
    def canonical(node):
        tag = node.tag.split('}')[-1]
        if tag in {'annotation', 'annotation-xml', 'mspace'}: return ()
        child_groups = tuple(canonical(c) for c in node)
        if tag in {'math', 'semantics', 'mrow', 'mstyle'}:
            return tuple(v for group in child_groups for v in group)
        # Retain each argument boundary: (x+y)/z differs from x/(+yz).
        children = child_groups
        if tag in CONSTRUCTS: structures[tag] += 1
        text = re.sub(r'\s+', ' ', ''.join(node.itertext())).strip() if not list(node) else ''
        attrs = tuple(sorted((k, v) for k, v in node.attrib.items() if k in {'mathvariant', 'linethickness', 'notation'}))
        return ((tag, text, attrs, children),)
    for source in re.findall(r'<math\b.*?</math>', converted.stdout.decode(errors='replace'), flags=re.S):
        try: formulas.append(canonical(ET.fromstring(source)))
        except ET.ParseError: pass
    return formulas, structures

def equation_metrics(gold, output):
    original = collections.Counter(math_nodes(ast(body(gold))))
    recovered = collections.Counter(math_nodes(ast(output)))
    a, sa = presentation(body(gold)); b, sb = presentation(output)
    gold_trees = collections.Counter(a); output_trees = collections.Counter(b)
    strict_matches = sum((original & recovered).values())
    tree_matches = sum((gold_trees & output_trees).values())
    construct_matches = sum((sa & sb).values())
    return {'reference_equations': sum(original.values()), 'output_equations': sum(recovered.values()),
            'strict_matches': strict_matches, 'presentation_matches': tree_matches,
            'strict_recall': strict_matches / sum(original.values()) if original else None,
            'presentation_recall': tree_matches / sum(gold_trees.values()) if gold_trees else None,
            'reference_constructs': dict(sa), 'output_constructs': dict(sb),
            'construct_recall': construct_matches / sum(sa.values()) if sa else None}

def prepare():
    fixture_dir = CACHE/'fixtures'; fixture_dir.mkdir(parents=True, exist_ok=True)
    fixtures = json.loads((ROOT/'benchmarks/math-fixtures.json').read_text())
    for fixture in fixtures:
        directory = fixture_dir/fixture['id']; directory.mkdir(exist_ok=True)
        math = ('\\[\n'+fixture['formula']+'\n\\]') if fixture['display'] else ('Here is the formula \\('+fixture['formula']+'\\) in a sentence.')
        source = '\\documentclass[11pt]{article}\n\\usepackage{fontspec,amsmath,amssymb}\n\\pagestyle{empty}\n\\begin{document}\n'+SENTINEL+'\n\n'+math+'\n\nText after the equation stays in order.\n\\end{document}\n'
        path=directory/'document.tex'
        changed = not path.exists() or path.read_text() != source
        path.write_text(source)
        if changed or not (directory/'document.pdf').exists():
            if not compile_tex(directory)['compiled']: raise RuntimeError(f'Authored fixture failed: {path}')
    return fixtures

def cases(fixtures):
    dataset=json.loads((ROOT/'benchmarks/dataset.json').read_text())
    for fixture in fixtures:
        directory=CACHE/'fixtures'/fixture['id']
        yield {'id': fixture['id'], 'group':'authored-pdf', 'source':directory/'document.tex', 'input':directory/'document.pdf', 'compile':True}
    for pair in dataset['pairs']:
        if pair['id'] in PUBLIC_IDS:
            yield {'id':pair['id'], 'group':'public-pdf', 'source':DATA/pair['local_source'], 'input':DATA/pair['local_pdf'], 'repository':pair['repository'], 'repository_root':DATA/'repos'/pair['repository'].replace('/','__'), 'compile':True, 'pinned_pdf_sha256':pair['pdf_sha256'], 'pinned_source_sha256':pair['source_sha256']}
    for item in dataset['files']:
        if item['path'].endswith(('docx-with-equations-to-latex/equations.docx','docx/golden/mark_math.docx')):
            yield {'id':pathlib.Path(item['path']).stem, 'group':'public-docx', 'input':DATA/item['local'], 'repository':item['repository'], 'compile':True, 'pinned_input_sha256':item['sha256']}

def evaluate(case, binary, label):
    result={k:v for k,v in case.items() if k not in {'source','input','repository_root','compile'}}
    result.update({'input':str(case['input'].relative_to(ROOT)), 'input_sha256':sha(case['input'])})
    destination=CACHE/label/case['id']/str(time.time_ns())
    if case.get('source'):
        result['source_sha256']=sha(case['source'])
        gold=expand(case['source'],case['repository_root']) if 'repository_root' in case else case['source'].read_text()
    else:
        reference=run([PANDOC,'--sandbox',case['input'],'-t','latex'])
        if reference.returncode: raise RuntimeError(reference.stderr.decode())
        gold=reference.stdout.decode()
    started=time.perf_counter()
    conversion=run([binary,case['input'],'-o',destination,'--mode','editable'],timeout=120)
    result['seconds']=time.perf_counter()-started
    if conversion.returncode:
        result.update(status='failed',error=conversion.stderr.decode(errors='replace')[-500:]); return result
    output=(destination/'document.tex').read_text()
    result.update(status='ok',output=str(destination.relative_to(ROOT)),**equation_metrics(gold,output))
    plain=ast_plain(ast(output))
    if case['group']=='authored-pdf': result['prose_preserved']=normalize(SENTINEL) in normalize(plain) and 'Text after the equation stays in order.' in normalize(plain)
    result['tex_token_change']=Levenshtein.normalized_distance(tokens(body(gold)),tokens(body(output)))
    if case['compile']:
        # Generated code only. No downloaded upstream TeX is ever executed.
        result.update(compile_tex(destination))
    if case['group'].endswith('pdf'):
        with pymupdf.open(case['input']) as pdf:
            result['pages']=len(pdf)
            reference='\n'.join(page.get_text(sort=True) for page in pdf)
        result['text_token_f1']=bag_f1(tokens(normalize(reference)),tokens(normalize(plain)))
    return result

def summarize(records):
    summaries={}
    for group in sorted({r['group'] for r in records}):
        rows=[r for r in records if r['group']==group]
        ok=[r for r in rows if r['status']=='ok']
        summary={'attempted':len(rows),'converted':len(ok),'compiled':sum(bool(r.get('compiled')) for r in ok),
                 'reference_equations':sum(r.get('reference_equations',0) for r in ok),
                 'strict_matches':sum(r.get('strict_matches',0) for r in ok),
                 'presentation_matches':sum(r.get('presentation_matches',0) for r in ok)}
        summary['strict_recall']=summary['strict_matches']/max(1,summary['reference_equations'])
        summary['presentation_recall']=summary['presentation_matches']/max(1,summary['reference_equations'])
        for field in ['seconds','tex_token_change','construct_recall','text_token_f1']:
            values=[r[field] for r in ok if r.get(field) is not None]
            if values:summary[field+'_median']=statistics.median(values)
        if group=='authored-pdf':summary['prose_preserved']=sum(bool(r.get('prose_preserved')) for r in ok)
        summaries[group]=summary
    return summaries

def report():
    before=json.loads((ROOT/'benchmarks/math-before.json').read_text())
    after=json.loads((ROOT/'benchmarks/math-after.json').read_text())
    lines=['# Equation reconstruction checks','',
           'This focused before/after test complements the original broad benchmark. It uses 12 authored equation PDFs, four pinned public math PDFs, and two pinned public equation DOCX files. Authored cases include difficult unsupported structures deliberately. Only authored fixtures and generated output are compiled; upstream TeX is never executed.','',
           '| Group | Equations | Exact formula matches, before → after | Presentation-tree matches, before → after | Compiled outputs, before → after |',
           '|---|---:|---:|---:|---:|']
    for group, old in before['groups'].items():
        new=after['groups'][group]
        lines.append(f"| {group} | {old['reference_equations']} | {old['strict_matches']} → {new['strict_matches']} | {old['presentation_matches']} → {new['presentation_matches']} | {old['compiled']}/{old['attempted']} → {new['compiled']}/{new['attempted']} |")
    lines+=['','## Authored PDF cases','','| Case | Presentation match before → after | Compiles after |','|---|---:|---:|']
    oldrows={r['id']:r for r in before['records']}
    for row in after['records']:
        if row['group']=='authored-pdf': lines.append(f"| {row['id']} | {oldrows[row['id']]['presentation_matches']} → {row['presentation_matches']} | {'yes' if row.get('compiled') else 'no'} |")
    lines+=['','## Interpretation','',
            'Exact formula matches remove whitespace and `\\left`/`\\right` only. Presentation-tree matching uses Pandoc/texmath to read generated LaTeX into MathML, removes grouping/spacing wrappers, and compares the remaining ordered trees. It accepts redundant braces and `\\ensuremath` wrappers but is not an algebraic equivalence test. Whole equations must match; disconnected fragments do not count as recovered equations.',
            '', 'Construct recall in the JSON measures counts of fraction, root, script, limit, and matrix nodes. It is a diagnostic only: counting a fraction does not prove its numerator or denominator is correct. Compilation likewise does not establish visual or mathematical fidelity.',
            '', 'These cases are small and deliberately targeted, not a representative estimate for all PDFs. Public source/PDF synchronization has not been proven by recompiling upstream TeX. DOCX references are Pandoc conversions of the original structured documents, not original LaTeX. Timings include process startup and are descriptive on this host.',
            '', '## Reproduce','', '```sh', '.tools/bench-venv/bin/python benchmarks/math_benchmark.py --label before --binary .tools/math-benchmark/baseline/graphtotex-pdf', 'npm run build:cli', '.tools/bench-venv/bin/python benchmarks/math_benchmark.py --label after', '```','',
            'Install `benchmarks/requirements.txt` and LuaLaTeX first. The baseline executable is a local frozen pre-change artifact; its SHA-256 is recorded in `math-before.json`. Public input hashes come from `dataset.json`. Source fixture formulas live in `math-fixtures.json`. Raw output and compiler logs stay in `.tools/math-benchmark/`.']
    (ROOT/'benchmarks/MATH_REPORT.md').write_text('\n'.join(lines)+'\n')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--label',choices=['before','after'],required=True);parser.add_argument('--binary',type=pathlib.Path,default=ROOT/'native/target/release/graphtotex-pdf');parser.add_argument('--prepare-only',action='store_true');args=parser.parse_args()
    fixtures=prepare()
    if args.prepare_only:return
    binary=args.binary.resolve();records=[]
    for case in cases(fixtures):
        result=evaluate(case,binary,args.label);records.append(result)
        print(case['group'],case['id'],result['status'],result.get('presentation_matches'),result.get('compiled'),flush=True)
    output={'schema_version':1,'engine_sha256':sha(binary),'platform':platform.platform(),'pandoc_version':str(pypandoc.get_pandoc_version()),'groups':summarize(records),'records':records}
    (ROOT/f'benchmarks/math-{args.label}.json').write_text(json.dumps(output,indent=2)+'\n')
    if all((ROOT/f'benchmarks/math-{label}.json').exists() for label in ['before','after']):report()
    print(json.dumps(output['groups'],indent=2),flush=True)
if __name__=='__main__':main()
