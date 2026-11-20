#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { validateManifest, summarize, runCommand, interpretProbe } from './large-images/baseline.mjs';
const args=process.argv.slice(2), take=(flag,fallback)=>args.includes(flag)?args[args.indexOf(flag)+1]:fallback;
const manifestPath=resolve(take('--manifest','/tmp/draivio-large-images/manifest.json'));
const output=resolve(take('--output','docs/verification/large-images/baseline.json'));
const runs=Number(take('--runs','3'));if(!Number.isInteger(runs)||runs<1||runs>30)throw Error('--runs must be 1..30');
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
const validation=await validateManifest(manifest,dirname(manifestPath));
if(!validation.valid){console.error(JSON.stringify(validation));process.exit(1);}
const root=dirname(fileURLToPath(import.meta.url)), rows=[];
for(const fixture of manifest.fixtures){
  for(const stage of ['inspect','decode'])for(let run=0;run<runs;run++){
    const result=await runCommand('python3',[resolve(root,'large-images/probe.py'),stage,resolve(dirname(manifestPath),fixture.path)],{timeoutMs:60000});
    const probe=interpretProbe(result,fixture,stage);
    rows.push({fixture:fixture.id,stage,run,cache:'fresh decoder process; OS cache uncontrolled (no cold-cache claim)',...result,...probe,processWallMs:result.ms,ms:fixture.expected==='decode_error'?null:probe.operationMs??null});
  }
  for(const stage of ['T_firstPreview','T_fitQuality','T_100PercentViewport','T_editReady','projectSave','recovery','export'])rows.push({fixture:fixture.id,stage,outcome:'not_run',reason:'No instrumented desktop WebView/application observation in this CLI baseline'});
}
const groups={};for(const row of rows){const key=row.fixture+':'+row.stage;(groups[key]??=[]).push(row);}
const report={schemaVersion:1,recordedAt:new Date().toISOString(),environment:{platform:process.platform,arch:process.arch,node:process.version,os:os.release(),cpu:os.cpus()[0]?.model,totalMemoryBytes:os.totalmem(),python:(await runCommand('python3',['--version'])).stdout.trim(),decoder:'Pillow isolated subprocess',cachePolicy:'No application cache; OS cache uncontrolled; no cache flush performed'},manifestSha256:(await import('node:crypto')).createHash('sha256').update(await readFile(manifestPath)).digest('hex'),validation,scope:'JPEG/PNG/single-page TIFF; standalone header/decode baseline only',performanceVerdict:'not_run: UI first-paint/edit/roundtrip targets need application instrumentation',rows,summary:Object.fromEntries(Object.entries(groups).map(([key,values])=>[key,summarize(values)]))};
await mkdir(dirname(output),{recursive:true});
await writeFile(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output,rows:rows.length,failed:rows.filter(r=>r.outcome==='failed').length,not_run:rows.filter(r=>r.outcome==='not_run').length}));
if(rows.some(r=>r.outcome==='failed'))process.exitCode=1;
