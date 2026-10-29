#!/usr/bin/env python3
"""Benchmark the real CLI. Never compile or execute downloaded upstream TeX."""
import argparse, collections, concurrent.futures, csv, difflib, hashlib, json, os, pathlib, platform, re, statistics, subprocess, time, unicodedata
import pymupdf as fitz
import pypandoc
from rapidfuzz.distance import Levenshtein

ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.tools/benchmark'; OUTPUT=CACHE/'runs'; BINARY=ROOT/'native/target/release/graphtotex-pdf'
PANDOC=pypandoc.get_pandoc_path()
def command(args,**kwargs): return subprocess.run([str(a) for a in args],capture_output=True,timeout=kwargs.pop('timeout',45),**kwargs)
def normalize(s): return re.sub(r'\s+',' ',unicodedata.normalize('NFKC',s).replace('\u00ad','')).strip()
def tokens(s): return re.findall(r'\\[A-Za-z@]+|[\w]+|[^\w\s]',s,flags=re.UNICODE)
def strip_comments(s): return re.sub(r'(?<!\\)%[^\n]*','',s)
def body(s):
    s=strip_comments(s)
    if '\\begin{document}' in s:s=s.split('\\begin{document}',1)[1]
    return s.split('\\end{document}',1)[0]
def expand(path,root,seen=None):
    seen=set() if seen is None else seen
    path=path.resolve()
    if path in seen or len(seen)>300 or not path.is_relative_to(root.resolve()) or not path.exists():return ''
    seen.add(path);text=strip_comments(path.read_text(errors='replace'))
    def include(match):
        name=match.group(1);target=path.parent/name
        if not target.suffix:target=target.with_suffix('.tex')
        if not target.exists():target=root/name;target=target if target.suffix else target.with_suffix('.tex')
        return expand(target,root,seen) if target.exists() else match.group(0)
    return re.sub(r'\\(?:input|include|subfile)\s*\{([^{}]+)\}',include,text)
def ast(text,source='latex'):
    result=command([PANDOC,'--sandbox','-f',source,'-t','json'],input=text.encode())
    if result.returncode:return None
    try:return json.loads(result.stdout)
    except ValueError:return None
def math_nodes(value):
    found=[]
    if isinstance(value,dict):
        if value.get('t')=='Math':found.append(re.sub(r'\s+|\\(?:left|right)\b','',value['c'][1]))
        else:
            for v in value.values():found.extend(math_nodes(v))
    elif isinstance(value,list):
        for v in value:found.extend(math_nodes(v))
    return found
def ast_plain(value):
    if value is None:return ''
    result=command([PANDOC,'--sandbox','-f','json','-t','plain','--wrap=none'],input=json.dumps(value).encode())
    return result.stdout.decode(errors='replace') if result.returncode==0 else ''
def metrics(original,converted):
    a=tokens(body(original));b=tokens(body(converted))
    return {'source_tokens':len(a),'output_tokens':len(b),'tex_token_change':Levenshtein.normalized_distance(a,b) if a or b else 0}
def filehash(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def evaluate_pair(item,mode,resume=True):
    dest=OUTPUT/item['id']/mode;record=dest.parent/(mode+'.metrics.json')
    if resume and record.exists():
        cached=json.loads(record.read_text())
        if cached.get('engine_sha256')==filehash(BINARY):return cached
    result={'id':item['id'],'repository':item['repository'],'source_path':item['source_path'],'category':item['category'],'mode':mode,'kind':'pdf','status':'failed','engine_sha256':filehash(BINARY)}
    path=CACHE/item['local_pdf'];source=CACHE/item['local_source']
    try:
        if filehash(path)!=item['pdf_sha256'] or filehash(source)!=item['source_sha256']:raise ValueError('input checksum mismatch')
        original=expand(source,CACHE/'repos'/item['repository'].replace('/','__'))
        with fitz.open(path) as pdf:
            reference='\n'.join(page.get_text(sort=True) for page in pdf);result['pages']=len(pdf)
        if dest.exists():
            # Resume partial runs in a fresh attempt directory; never overwrite CLI outputs.
            dest=dest.with_name(dest.name+'-'+str(time.time_ns()))
        start=time.perf_counter();conversion=command([BINARY,path,'-o',dest,'--mode',mode],timeout=90);result['seconds']=time.perf_counter()-start
        dest.parent.mkdir(parents=True,exist_ok=True);(dest.parent/(mode+'.log')).write_bytes(conversion.stderr[-200000:])
        if conversion.returncode:raise ValueError(conversion.stderr.decode(errors='replace')[-600:])
        tex=(dest/'document.tex').read_text();report=json.loads((dest/'report.json').read_text())
        result.update(metrics(original,tex));result['preserved_pages']=sum(p['preserved'] for p in report)
        result['editable_pages']=len(report)-result['preserved_pages'];result['output_directory']=str(dest.relative_to(CACHE))
        output_ast=ast(tex);original_ast=ast(body(original));plain=ast_plain(output_ast)
        a=normalize(reference);b=normalize(plain)
        result['reference_characters']=len(a);result['text_character_error_rate']=Levenshtein.distance(a,b)/max(1,len(a));
        result['text_token_f1']=bag_f1(tokens(a),tokens(b))
        gold=collections.Counter(math_nodes(original_ast));predicted=collections.Counter(math_nodes(output_ast));matches=sum((gold&predicted).values())
        result['reference_equations']=sum(gold.values());result['recovered_equations']=sum(predicted.values());result['exact_equation_recall']=matches/sum(gold.values()) if gold else None
        diff=difflib.unified_diff(body(original).splitlines(keepends=True),body(tex).splitlines(keepends=True),fromfile='original-expanded.tex',tofile='reconstructed.tex',n=2)
        (dest.parent/(mode+'.diff')).write_text(''.join(diff))
        result['status']='ok'
    except Exception as error:result['error']=str(error)
    record.parent.mkdir(parents=True,exist_ok=True);record.write_text(json.dumps(result,ensure_ascii=False,indent=2))
    return result
def bag_f1(a,b):
    gold=collections.Counter(a);prediction=collections.Counter(b);match=sum((gold&prediction).values());return 2*match/max(1,len(a)+len(b))
def evaluate_direct(item,resume=True):
    identity=hashlib.sha256(item['local'].encode()).hexdigest()[:16];dest=OUTPUT/'direct'/identity;record=dest.parent/(identity+'.metrics.json')
    if resume and record.exists():
        cached=json.loads(record.read_text())
        if cached.get('engine_sha256')==filehash(BINARY) and cached.get('input_sha256')==item.get('sha256'):return cached
    source=CACHE/item['local'];kind=source.suffix.lower().strip('.');result={'id':identity,'repository':item.get('repository','public Google Docs'),'source_path':item.get('path',source.name),'kind':kind,'mode':'direct','status':'failed','engine_sha256':filehash(BINARY),'input_sha256':item.get('sha256')}
    try:
        if item.get('sha256') and filehash(source)!=item['sha256']:raise ValueError('checksum mismatch')
        if dest.exists():dest=dest.with_name(dest.name+'-'+str(time.time_ns()))
        start=time.perf_counter();run=command([BINARY,source,'-o',dest],timeout=45);result['seconds']=time.perf_counter()-start
        if run.returncode:raise ValueError(run.stderr.decode(errors='replace')[-600:])
        report=json.loads((dest/'report.json').read_text());result.update({k:report.get(k) for k in ['blocks','equations','warnings']})
        reference=command([PANDOC,'--sandbox',source,'-t','json'],timeout=30)
        if reference.returncode:result['reference_error']=reference.stderr.decode(errors='replace')[-500:]
        else:
            gold_ast=json.loads(reference.stdout);tex=(dest/'document.tex').read_text();out_ast=ast(tex)
            gold_tex=command([PANDOC,'--sandbox','-f','json','-t','latex'],input=reference.stdout).stdout.decode(errors='replace')
            result.update(metrics(gold_tex,tex));a=normalize(ast_plain(gold_ast));b=normalize(ast_plain(out_ast))
            result['text_character_error_rate']=Levenshtein.distance(a,b)/max(1,len(a));result['text_token_f1']=bag_f1(tokens(a),tokens(b))
            gold=collections.Counter(math_nodes(gold_ast));prediction=collections.Counter(math_nodes(out_ast));result['reference_equations']=sum(gold.values());result['exact_equation_recall']=sum((gold&prediction).values())/sum(gold.values()) if gold else None
        result['output_directory']=str(dest.relative_to(CACHE));result['status']='ok'
    except Exception as error:result['error']=str(error)
    record.parent.mkdir(parents=True,exist_ok=True);record.write_text(json.dumps(result,ensure_ascii=False,indent=2));return result
def aggregate(rows):
    ok=[r for r in rows if r['status']=='ok'];output={'attempted':len(rows),'converted':len(ok),'failed':len(rows)-len(ok)}
    for key in ['seconds','tex_token_change','text_character_error_rate','text_token_f1','exact_equation_recall']:
        values=[r[key] for r in ok if isinstance(r.get(key),(float,int))]
        if values:output[key+'_median']=statistics.median(values)
    output['pages']=sum(r.get('pages',0) for r in ok);output['editable_pages']=sum(r.get('editable_pages',0) for r in ok);output['preserved_pages']=sum(r.get('preserved_pages',0) for r in ok)
    output['seconds_total']=sum(r.get('seconds',0) for r in ok)
    return output
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--limit',type=int);parser.add_argument('--workers',type=int,default=3);parser.add_argument('--fresh',action='store_true');parser.add_argument('--fresh-direct',action='store_true');args=parser.parse_args()
    dataset=json.loads((ROOT/'benchmarks/dataset.json').read_text());pairs=dataset['pairs'][:args.limit];jobs=[(p,m) for p in pairs for m in ['auto','editable']]
    rows=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i,result in enumerate(pool.map(lambda job:evaluate_pair(*job,resume=not args.fresh),jobs)):
            rows.append(result)
            if i%20==0:print(f'PDF {i}/{len(jobs)}: {result["status"]}',flush=True)
    direct=[f for f in dataset['files'] if 'error' not in f and pathlib.Path(f['path']).suffix.lower() in ['.docx','.epub','.odt','.html','.rtf']]
    for path in sorted((CACHE/'google-docs').glob('*.docx')):direct.append({'local':str(path.relative_to(CACHE)),'sha256':filehash(path),'repository':'public Google Docs','path':path.name})
    for i,item in enumerate(direct):
        result=evaluate_direct(item,resume=not (args.fresh or args.fresh_direct));rows.append(result)
        if i%10==0:print(f'Direct {i}/{len(direct)}: {result["kind"]} {result["status"]}',flush=True)
    groups={}
    for key in sorted(set(r['mode'] if r['kind']=='pdf' else r['kind'] for r in rows)):
        groups[key]=aggregate([r for r in rows if (r['mode'] if r['kind']=='pdf' else r['kind'])==key])
    original_hash=(CACHE/'first-run-engine.sha256').read_text().strip() if (CACHE/'first-run-engine.sha256').exists() else filehash(BINARY)
    for row in rows: row.setdefault('engine_sha256',original_hash)
    report={'schema_version':1,'engine_sha256':filehash(BINARY),'platform':platform.platform(),'python':platform.python_version(),'pandoc_version':str(pypandoc.get_pandoc_version()),'dataset_pairs':len(pairs),'groups':groups,'rows':rows}
    (ROOT/'benchmarks/results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    columns=['id','repository','source_path','kind','mode','status','pages','seconds','editable_pages','preserved_pages','tex_token_change','text_character_error_rate','text_token_f1','reference_equations','exact_equation_recall','error']
    with (ROOT/'benchmarks/results.csv').open('w',newline='') as stream:
        writer=csv.DictWriter(stream,fieldnames=columns,extrasaction='ignore');writer.writeheader();writer.writerows(rows)
    print(json.dumps(groups,indent=2),flush=True)
if __name__=='__main__':main()
