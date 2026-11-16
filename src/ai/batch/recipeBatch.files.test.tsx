import {it,expect} from 'vitest'
import {mkdtemp,mkdir,writeFile,readFile,stat} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {Blob as NodeBlob} from 'node:buffer'
import {createCanvas,loadImage} from 'batch-test-canvas'
import {Resvg} from '@resvg/resvg-js'
import {RecipeBatch,restoreRecipeBatch,type RecipeBatchConfig} from './recipeBatch'
import {processRecipeBatchInput} from './recipeBatchRender'
import {writeBatchOutput,type BrowserDirectory} from '../../batch/batchIO'
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex')
it('real three-file recipe trial/batch, corrupt retry, collision-safe output and restart history',async()=>{
 const root=await mkdtemp(join(tmpdir(),'draivio-recipe-batch-')),out=join(root,'out');await mkdir(out);await mkdir(join(root,'first'));await mkdir(join(root,'second'));await mkdir(join(root,'cache'))
 const canvas=createCanvas(100,70),ctx=canvas.getContext('2d');ctx.fillStyle='#c34b30';ctx.fillRect(0,0,100,70);ctx.fillStyle='#fff';ctx.font='14px sans-serif';ctx.fillText('LOCAL RECIPE',5,30);const original=canvas.toBuffer('image/png')
 const paths=[join(root,'first/same.png'),join(root,'second/same.png'),join(root,'broken.png')];await Promise.all(paths.map((p,i)=>writeFile(p,i===2?'corrupt actual file':original)));const beforeHashes=await Promise.all(paths.map(async p=>hash(await readFile(p))))
 // Load actual files via batchIO's File branch; every attempt obtains fresh file bytes.
 const sources=await Promise.all(paths.map(async(p,index)=>({id:`file-${index}`,name:index<2?'same.png':'broken.png',file:new NodeBlob([new Uint8Array(await readFile(p))],{type:'image/png'}) as unknown as File})))
 const config:RecipeBatchConfig={recipe:{schemaVersion:1,id:'local-opacity',version:1,name:'Local opacity 70%',inputs:[{id:'target',required:true}],parameters:{},steps:[{id:'opacity',tool:'opacity',args:{layerId:{$input:'target'},value:70}}]},parameters:{},inputSlot:'target',concurrency:2,prefix:'recipe',maxRequests:0,budgetMicros:0}
 const occupied='recipe-same-batch-001.png';await writeFile(join(out,occupied),'PRESERVE EXISTING OUTPUT')
 const directory:BrowserDirectory={name:out,getFileHandle:async(name,options)=>{const path=join(out,name);if(!options?.create){try{await stat(path)}catch{throw new DOMException('missing','NotFoundError')}}return {createWritable:async()=>({write:async(blob)=>{await writeFile(path,new Uint8Array(await blob.arrayBuffer()))},close:async()=>{},abort:async()=>{}})}}}
 let active=0,maxActive=0;const calls:string[]=[],transactions:number[]=[]
 const queue=new RecipeBatch(sources,config,{process:async(input,c,s)=>{calls.push(input.id);active++;maxActive=Math.max(maxActive,active);try{return await processRecipeBatchInput(input,c,s,{render:async(svg,document)=>{transactions.push(document.undoStack.length);return new NodeBlob([new Uint8Array(new Resvg(svg).render().asPng())],{type:'image/png'}) as unknown as Blob}})}finally{active--}},write:(name,blob)=>writeBatchOutput({name:out,handle:directory},name,blob),save:async(record)=>{await writeFile(join(root,'journal.json'),JSON.stringify(record,null,2))},putResult:async(id,blob)=>{await writeFile(join(root,'cache',Buffer.from(id).toString('hex')+'.png'),new Uint8Array(await blob.arrayBuffer()))}})
 await queue.trial();expect(calls).toEqual(['file-0']);expect(queue.record.items[0].output).toBe(join(out,'recipe-same-batch-001-2.png'));await queue.run();expect(queue.record.items.map(i=>i.status)).toEqual(['success','success','failed']);const firstRecords=structuredClone(queue.record)
 expect(await readFile(join(out,occupied),'utf8')).toBe('PRESERVE EXISTING OUTPUT');expect(await Promise.all(paths.map(async p=>hash(await readFile(p))))).toEqual(beforeHashes)
 const repaired=canvas.toBuffer('image/png');await writeFile(paths[2],repaired);sources[2].file=new NodeBlob([new Uint8Array(await readFile(paths[2]))],{type:'image/png'}) as unknown as File
 await queue.retryFailed();expect(queue.record.items.map(i=>i.status)).toEqual(['success','success','success']);expect(calls).toEqual(['file-0','file-1','file-2','file-2']);expect(queue.record.items.map(i=>i.attempts)).toEqual([1,1,2]);expect(transactions).toEqual([1,1,1]);expect(queue.record.reservedRequests).toBe(0)
 const pixels:unknown[]=[];for(const item of queue.record.items){const bytes=await readFile(item.output!),download=queue.results.get(item.id)!;expect(Buffer.from(await download.arrayBuffer())).toEqual(bytes);expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);const image=await loadImage(bytes),c=createCanvas(100,70),x=c.getContext('2d');x.drawImage(image,0,0);const p=[...x.getImageData(90,60,1,1).data];expect(p[3]).toBeGreaterThanOrEqual(178);expect(p[3]).toBeLessThanOrEqual(179);pixels.push(p)}
 const restored=restoreRecipeBatch(JSON.parse(await readFile(join(root,'journal.json'),'utf8')));expect(restored.items.every(i=>i.status==='success')).toBe(true);expect(restored.trialSucceeded).toBe(false);expect(calls).toHaveLength(4)
 const evidence=process.env.RECIPE_BATCH_EVIDENCE_DIR;if(evidence){await mkdir(evidence,{recursive:true});await writeFile(join(evidence,'before.png'),original);for(const item of queue.record.items)await writeFile(join(evidence,`after-${item.index+1}.png`),await readFile(item.output!));await writeFile(join(evidence,'execution.json'),JSON.stringify({root,firstRecords,final:queue.record,restored,originalHashesBefore:beforeHashes,unmodifiedGoodInputHashes:await Promise.all(paths.slice(0,2).map(async p=>hash(await readFile(p)))),calls,maxActive,transactions,outputPixels:pixels,actualProviderRequests:0,actualProviderCost:0,existingOutputPreserved:true},null,2))}
 console.log(`Real batch filesystem evidence: ${root}`)
},30000)
