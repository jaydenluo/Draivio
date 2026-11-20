import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

test('manifest validates actual bytes and catches changed files and escaping paths', async () => {
  const { validateManifest } = await import('./baseline.mjs');
  const dir = await mkdtemp(join(tmpdir(), 'large-image-test-'));
  try {
    const bytes = Buffer.from('known-invalid-image');
    await writeFile(join(dir, 'broken.png'), bytes);
    const entry = { id:'broken', path:'broken.png', bytes:bytes.length, sha256:createHash('sha256').update(bytes).digest('hex'), expected:'decode_error', source:'synthetic CC0', format:'PNG' };
    assert.equal((await validateManifest({schemaVersion:1,fixtures:[entry]}, dir)).valid, true);
    await writeFile(join(dir,'broken.png'),'changed');
    assert.equal((await validateManifest({schemaVersion:1,fixtures:[entry]},dir)).valid,false);
    assert.equal((await validateManifest({schemaVersion:1,fixtures:[{...entry,path:'../escape'}]},dir)).valid,false);
    assert.equal((await validateManifest({schemaVersion:1,fixtures:[{...entry,expected:'anything'}]},dir)).valid,false);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
test('statistics use observed successes only and retain failures and not_run', async () => {
  const { summarize } = await import('./baseline.mjs');
  const rows = [1,2,3,4,100].map(ms=>({outcome:'passed',ms}));
  rows.push({outcome:'failed',ms:0,error:'decoder rejected'}, {outcome:'not_run',reason:'No WebView'});
  assert.deepEqual(summarize(rows), {attempts:7,passed:5,failed:1,not_run:1,p50Ms:3,p95Ms:100,maxMs:100});
  assert.equal(summarize([{outcome:'failed',ms:99}]).p50Ms,null);
});
test('runner captures actual subprocess failure, expected malformed rejection, and timeout', async () => {
  const { runCommand } = await import('./baseline.mjs');
  assert.equal((await runCommand(process.execPath,['-e','process.exit(7)'])).exitCode,7);
  assert.equal((await runCommand(process.execPath,['-e','process.exit(7)'],{expectedFailure:true})).outcome,'passed');
  const timed = await runCommand(process.execPath,['-e','setTimeout(()=>{},10000)'],{timeoutMs:30});
  assert.equal(timed.outcome,'failed');
  assert.equal(timed.timedOut,true);
});
test('probe interpretation distinguishes decode rejection from infrastructure errors', async()=>{
 const { interpretProbe }=await import('./baseline.mjs');
 const fixture={expected:'decode_error'};
 const result={exitCode:2,timedOut:false,stdout:JSON.stringify({outcome:'failed',errorKind:'decode_rejected',error:'bad PNG'})};
 assert.equal(interpretProbe(result,fixture,'decode').outcome,'passed');
 assert.equal(interpretProbe({...result,stdout:'garbage'},fixture,'decode').outcome,'failed');
 assert.equal(interpretProbe({...result,stdout:JSON.stringify({outcome:'failed',errorKind:'probe_error'})},fixture,'decode').outcome,'failed');
 assert.equal(interpretProbe({...result,timedOut:true},fixture,'decode').outcome,'failed');
 assert.equal(interpretProbe({...result,exitCode:0,stdout:JSON.stringify({outcome:'passed'})},fixture,'decode').outcome,'failed');
 assert.equal(interpretProbe({...result,exitCode:0,stdout:JSON.stringify({outcome:'passed'})},fixture,'inspect').outcome,'passed');
});
test('capability inventory includes aliased pixel consumers and per-tool paths/budgets', async()=>{
 const {readFile}=await import('node:fs/promises');
 const report=JSON.parse(await readFile('docs/verification/large-images/capabilities.json','utf8'));
 for(const path of ['src/retouch/contentFill.ts','src/render/precisionCodec.ts','src/ai/imaging/processingWorker.ts'])assert.ok(report.candidates.some(c=>c.path===path),path);
 assert.equal(report.tools.length,45);
 for(const tool of report.tools){assert.ok(tool.referencePixelPaths?.length,tool.id);assert.ok(tool.currentBudget?.length,tool.id);for(const path of tool.referencePixelPaths)assert.ok(report.candidates.some(c=>c.path===path),path);}
});
test('background eraser and cutout reference their actual viewport pixel paths', async()=>{
 const {readFile}=await import('node:fs/promises');const report=JSON.parse(await readFile('docs/verification/large-images/capabilities.json','utf8'));
 const eraser=report.tools.find(t=>t.id==='background-eraser');assert.ok(eraser.referencePixelPaths.includes('src/canvas/rasterTools.ts'));assert.ok(!eraser.referencePixelPaths.includes('src/retouch/contentFill.ts'));assert.ok(!eraser.currentBudget.includes('4,194,304'));
 const cutout=report.tools.find(t=>t.id==='cutout');assert.ok(cutout.referencePixelPaths.includes('src/imaging/enhancement.ts'));assert.ok(!cutout.referencePixelPaths.includes('src/ai/tools/selectionTools.ts'));
});
