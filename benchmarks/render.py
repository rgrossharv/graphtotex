#!/usr/bin/env python3
"""Compile only locally generated output; compare a stratified first-three-page sample."""
import json, pathlib, os, subprocess, statistics
import pymupdf as fitz
from PIL import Image, ImageChops, ImageStat
ROOT=pathlib.Path(__file__).resolve().parents[1];CACHE=ROOT/'.tools/benchmark'
dataset=json.loads((ROOT/'benchmarks/dataset.json').read_text());report=json.loads((ROOT/'benchmarks/results.json').read_text())
byid={p['id']:p for p in dataset['pairs']};chosen={}
for row in report['rows']:
    if row['kind']=='pdf' and row['status']=='ok':chosen.setdefault((row['repository'],row['mode']),row)
records=[]
for (repo,mode),row in chosen.items():
    directory=CACHE/row['output_directory'];pages=json.loads((directory/'report.json').read_text())[:3]
    tex=(directory/'document.tex').read_text();preamble=tex.split('\\begin{document}',1)[0]
    (directory/'render-sample.tex').write_text(preamble+'\\begin{document}\n'+''.join(p['tex'] for p in pages)+'\\end{document}\n')
    env={**os.environ,'TEXMFHOME':str(ROOT/'.tools/texmf'),'TEXMFVAR':str(ROOT/'.tools/tex-cache'),'TEXMFCONFIG':str(ROOT/'.tools/tex-config'),'TEXMFCACHE':str(ROOT/'.tools/tex-cache')}
    record={'id':row['id'],'repository':repo,'mode':mode,'input_pages':len(pages)}
    try:
        run=subprocess.run(['lualatex','-interaction=nonstopmode','-halt-on-error','-no-shell-escape','render-sample.tex'],cwd=directory,env=env,capture_output=True,timeout=60)
        record['missing_glyph_warnings']=run.stdout.count(b'Missing character:')
        if run.returncode:raise ValueError(run.stdout.decode(errors='replace')[-1000:])
        with fitz.open(directory/'render-sample.pdf') as output,fitz.open(CACHE/byid[row['id']]['local_pdf']) as original:
            scores=[]
            for index in range(min(len(pages),len(output))):
                a=original[index].get_pixmap(colorspace=fitz.csGRAY,alpha=False);b=output[index].get_pixmap(colorspace=fitz.csGRAY,alpha=False)
                a=Image.frombytes('L',[a.width,a.height],a.samples);b=Image.frombytes('L',[b.width,b.height],b.samples).resize(a.size)
                maska=a.point(lambda v:255 if v<220 else 0);maskb=b.point(lambda v:255 if v<220 else 0)
                intersection=ImageStat.Stat(ImageChops.multiply(maska,maskb)).sum[0]/255
                total=(ImageStat.Stat(maska).sum[0]+ImageStat.Stat(maskb).sum[0])/255
                scores.append(2*intersection/max(1,total))
            record.update({'status':'compiled','output_pages':len(output),'ink_overlap_f1':scores,'ink_overlap_f1_mean':statistics.mean(scores) if scores else None})
    except Exception as error:record.update({'status':'failed','error':str(error)})
    records.append(record);print(repo,mode,record['status'],flush=True)
(ROOT/'benchmarks/render-results.json').write_text(json.dumps({'method':'One first three-page sample per repository/mode. MuPDF grayscale at 72 dpi, output resized to source page bounds; F1 of ink pixels below 220. Not an equation-correctness metric.','records':records},indent=2)+'\n')
