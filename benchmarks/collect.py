#!/usr/bin/env python3
"""Pin public GitHub trees and collect paired TeX/PDFs; never execute upstream code."""
import argparse, concurrent.futures, hashlib, json, pathlib, re, time, urllib.request, urllib.error

ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / '.tools/benchmark'
REPOS = [
    'sleepymalc/Notes', 'zeramorphic/cambridge-maths-notes', 'sreahw/schuller-geometric',
    'Name-Kompsky/tripos', 'pmichaillat/math-for-macro',
    'yanhan/mit-1801-ps-unofficial-sol', 'Dreamaker203/math-lecture-notes',
    'vEnhance/web.evanchen.cc', 'ovega14/RealAnalysis_solutions',
    'ausdavoud/Logic-and-Set-Theory-Exercises', 'Jad-srifi/regional-quant-circle',
    'jgm/pandoc', 'w3c/epub-tests',
]

def get(url, limit=30_000_000):
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'GraphToTeX-reproducible-benchmark', 'Accept': 'application/vnd.github+json' if 'api.github.com' in url else '*/*'}), timeout=60) as response:
                if int(response.headers.get('Content-Length', '0')) > limit: raise ValueError('download exceeds limit')
                data = response.read(limit + 1)
                if len(data) > limit: raise ValueError('download exceeds limit')
                return data
        except urllib.error.HTTPError as error:
            if error.code in (403, 404): raise
            if attempt == 2: raise
            time.sleep(1 + attempt)
        except Exception:
            if attempt == 2: raise
            time.sleep(1 + attempt)

def raw(repo, commit, path):
    return f'https://raw.githubusercontent.com/{repo}/{commit}/' + urllib.parse.quote(path)

def discover(repo, refresh=False):
    target = CACHE / 'trees' / (repo.replace('/', '__') + '.json')
    if target.exists() and not refresh: return json.loads(target.read_text())
    pins=ROOT/'benchmarks/repositories.json'
    existing=json.loads(pins.read_text()).get('repositories',[]) if pins.exists() else []
    commit=next((r['commit'] for r in existing if r['repository']==repo),None) if not refresh else None
    if not commit: commit = json.loads(get(f'https://api.github.com/repos/{repo}/commits/HEAD'))['sha']
    tree = json.loads(get(f'https://api.github.com/repos/{repo}/git/trees/{commit}?recursive=1'))
    if tree.get('truncated'): raise ValueError('GitHub tree truncated; refusing incomplete discovery')
    result = {'repo': repo, 'commit': commit, 'tree': tree['tree']}
    target.parent.mkdir(parents=True, exist_ok=True); target.write_text(json.dumps(result))
    return result

def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--max-pairs', type=int, default=260)
    parser.add_argument('--per-repo', type=int, default=160); parser.add_argument('--discover-only', action='store_true'); parser.add_argument('--refresh',action='store_true')
    args = parser.parse_args(); CACHE.mkdir(parents=True, exist_ok=True)
    manifests = []; failures = []; tasks = {}; repositories = []
    for repo in REPOS:
        try:
            data = discover(repo,args.refresh); files = {item['path']: item for item in data['tree'] if item['type'] == 'blob'}
            tex = [p for p in files if p.endswith('.tex')]; pdf = {p for p in files if p.endswith('.pdf')}
            candidates = []
            for path in tex:
                same = str(pathlib.PurePosixPath(path).with_suffix('.pdf'))
                matches = [same] if same in pdf else [p for p in pdf if pathlib.PurePosixPath(p).stem == pathlib.PurePosixPath(path).stem]
                if len(matches) == 1 and files[matches[0]].get('size', 0) <= 12_000_000: candidates.append((path, matches[0]))
            candidates.sort(key=lambda pair: hashlib.sha256((repo + '/' + pair[0]).encode()).hexdigest())
            chosen = candidates[:min(args.per_repo, args.max_pairs - len(manifests))] if repo != 'jgm/pandoc' else []
            license_paths = [p for p in files if re.match(r'^(?:LICENSE|LICENCE|COPYING)(?:\.[^/]*)?$', p, re.I)]
            info = {'repository': repo, 'commit': data['commit'], 'paired_candidates': len(candidates), 'selected': len(chosen), 'license_paths': license_paths}
            repositories.append(info); print(json.dumps(info), flush=True)
            slug = repo.replace('/', '__')
            def task(path):
                tasks[(repo,path)] = (raw(repo,data['commit'],path), CACHE/'repos'/slug/path,files[path]['sha'])
            for source, compiled in chosen:
                identity = hashlib.sha256(f'{repo}@{data["commit"]}:{source}'.encode()).hexdigest()[:16]
                manifests.append({'id': identity, 'repository': repo, 'commit': data['commit'], 'source_path': source, 'pdf_path': compiled,
                    'source_url': raw(repo,data['commit'],source), 'pdf_url': raw(repo,data['commit'],compiled),
                    'local_source': str(pathlib.Path('repos')/slug/source), 'local_pdf': str(pathlib.Path('repos')/slug/compiled),
                    'category': 'problem_set' if re.search(r'ps\d|problem|exercise|solution|exam|测试|习题', source, re.I) else 'notes',
                    'pairing': 'same-stem at pinned repository commit; upstream PDF/source synchronization not independently verified'})
                task(source); task(compiled)
            if chosen:
                for path in files:
                    if path.endswith(('.tex','.sty','.cls','.bib')) and files[path].get('size',0) < 2_000_000: task(path)
            for path in license_paths: task(path)
            # Real third-party structured documents, kept separate from paired math.
            direct = [p for p in files if pathlib.PurePosixPath(p).suffix.lower() in ('.docx','.epub','.odt','.html','.rtf') and files[p].get('size',0) < 3_000_000]
            direct.sort(key=lambda p: hashlib.sha256(p.encode()).hexdigest())
            if repo in ('jgm/pandoc','w3c/epub-tests'):
                for extension in ('.docx','.epub','.odt','.html','.rtf'):
                    for path in [p for p in direct if p.endswith(extension)][:20]: task(path)
                for path in direct:
                    if path.endswith(('.docx','.epub','.odt')) and re.search(r'math|equation|table|numbered|footnote',path,re.I): task(path)
        except Exception as error:
            failures.append({'repository':repo,'error':str(error)}); print(repo, error, flush=True)
    (ROOT/'benchmarks/repositories.json').write_text(json.dumps({'repositories':repositories,'discovery_failures':failures},ensure_ascii=False,indent=2)+'\n')
    if args.discover_only: return
    def download(item):
        (repo,path),(url,dest,blob_sha) = item
        try:
            content=dest.read_bytes() if dest.exists() else b''
            blob_hash=lambda data:hashlib.sha1(f'blob {len(data)}\0'.encode()+data).hexdigest()
            if blob_hash(content)!=blob_sha:
                content = get(url)
                if blob_hash(content)!=blob_sha:raise ValueError('download differs from the pinned Git blob')
                dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(content)
            return {'repository':repo,'path':path,'url':url,'local':str(dest.relative_to(CACHE)),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'bytes':dest.stat().st_size}
        except Exception as error: return {'repository':repo,'path':path,'error':str(error)}
    files=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for i,result in enumerate(executor.map(download,tasks.items())):
            files.append(result)
            if i%100==0: print(f'Downloaded {i}/{len(tasks)}',flush=True)
    available={(f['repository'],f['path']):f for f in files if 'error' not in f}
    for item in manifests:
        item['source_sha256']=available.get((item['repository'],item['source_path']),{}).get('sha256')
        item['pdf_sha256']=available.get((item['repository'],item['pdf_path']),{}).get('sha256')
    (ROOT/'benchmarks/dataset.json').write_text(json.dumps({'schema_version':1,'pairs':manifests,'files':files},ensure_ascii=False,indent=2)+'\n')
    print(f'Collected {len(manifests)} pairs; {len(available)} files; {sum(f.get("bytes",0) for f in files)/1e6:.1f} MB',flush=True)

if __name__=='__main__': main()
