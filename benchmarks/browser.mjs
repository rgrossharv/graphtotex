import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { preview } from 'vite';
import { createHash } from 'node:crypto';
const dataset=JSON.parse(await readFile('benchmarks/dataset.json','utf8'));
const wasmHash=createHash('sha256').update(await readFile('dist/vendor/pdf-to-tex/graphtotex_pdf_core_bg.wasm')).digest('hex');
let priorHash='';try{priorHash=JSON.parse(await readFile('benchmarks/browser-results.json','utf8')).wasm_sha256;}catch{}
const workerFile=(await readdir('dist/assets')).find(name=>name.startsWith('pdfToTex.worker-'));
if(!workerFile)throw new Error('Build the site first.');
const pairs=new Map(dataset.pairs.map(pair=>[pair.id,pair]));
const server=await preview({preview:{host:'127.0.0.1',port:4181,strictPort:true},plugins:[{
  name:'benchmark-local-input',
  configurePreviewServer(server){server.middlewares.use('/__benchmark',async(req,res)=>{
    const pair=pairs.get((req.url || '').replace(/^\//,''));
    if(!pair){res.statusCode=404;res.end();return;}
    try{res.setHeader('Content-Type','application/pdf');res.end(await readFile(`.tools/benchmark/${pair.local_pdf}`));}
    catch{res.statusCode=500;res.end();}
  });}
}]});
const browser=await chromium.launch({headless:true});
const results=[];let cursor=0;
const jobs=dataset.pairs.flatMap(pair=>['auto','editable'].map(mode=>({pair,mode})));
try{
  await Promise.all(Array.from({length:3},async()=>{
    const page=await browser.newPage();await page.goto('http://127.0.0.1:4181/misc/');
    while(cursor<jobs.length){
      const {pair,mode}=jobs[cursor++];const dest=`.tools/benchmark/browser/${pair.id}`;
      const record=`${dest}/${mode}.json`;
      try{const cached=JSON.parse(await readFile(record,'utf8'));if((cached.wasm_sha256||priorHash)===wasmHash){results.push(cached);continue;}}catch{}
      const start=performance.now();
      const result=await page.evaluate(async({id,workerFile,mode})=>{
        const response=await fetch(`/__benchmark/${id}`);if(!response.ok)throw new Error('Could not load benchmark PDF');
        const bytes=await response.arrayBuffer();
        return new Promise(resolve=>{
        const worker=new Worker(`/assets/${workerFile}`,{type:'module'});
        const timeout=setTimeout(()=>{worker.terminate();resolve({status:'timeout'});},120000);
        worker.onmessage=event=>{if(event.data.type==='result'){clearTimeout(timeout);worker.terminate();const r=event.data.result;resolve({status:'ok',tex:r.tex,seconds:r.elapsedMs/1000,pages:r.pages.length,preserved_pages:r.pages.filter(p=>p.preserved).length});}else if(event.data.type==='error'){clearTimeout(timeout);worker.terminate();resolve({status:'failed',error:event.data.message});}};
        worker.onerror=event=>{clearTimeout(timeout);worker.terminate();resolve({status:'failed',error:event.message});};
        worker.postMessage({file:new File([bytes],'document.pdf',{type:'application/pdf'}),options:{mode,pages:'',password:''}});
      });},{id:pair.id,workerFile,mode});
      const {tex,...summary}=result;Object.assign(summary,{id:pair.id,mode,repository:pair.repository,source_path:pair.source_path,wasm_sha256:wasmHash,wall_seconds:(performance.now()-start)/1000});
      await mkdir(dest,{recursive:true});if(tex)await writeFile(`${dest}/${mode}.tex`,tex);await writeFile(record,JSON.stringify(summary,null,2));results.push(summary);
      if(results.length%20===0)console.log(`Browser ${results.length}/${jobs.length}`);
    }await page.close();
  }));
  results.sort((a,b)=>(a.id+a.mode).localeCompare(b.id+b.mode));
  await writeFile('benchmarks/browser-results.json',JSON.stringify({worker:workerFile,wasm_sha256:wasmHash,chromium:browser.version(),concurrency:3,results},null,2)+'\n');
  console.log(`Browser benchmark completed: ${results.length} conversions.`);
}finally{await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));}
