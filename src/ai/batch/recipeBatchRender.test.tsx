import {it,expect} from 'vitest'
import {Blob as NodeBlob} from 'node:buffer'
import {createCanvas,loadImage} from 'batch-test-canvas'
import {Resvg} from '@resvg/resvg-js'
import {createRecipeInputDocument,processRecipeBatchInput} from './recipeBatchRender'
import type {RecipeBatchConfig} from './recipeBatch'
const config:RecipeBatchConfig={recipe:{schemaVersion:1,id:'opacity',version:1,name:'opacity',inputs:[{id:'target',required:true}],parameters:{},steps:[{id:'opacity',tool:'opacity',args:{layerId:{$input:'target'},value:50}}]},parameters:{},inputSlot:'target',concurrency:1,prefix:'edit',maxRequests:0,budgetMicros:0}
it('executes the real recipe transaction and renders a changed PNG from a private image document',async()=>{
 const c=createCanvas(20,10),ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,20,10);const bytes=c.toBuffer('image/png'),file=new NodeBlob([new Uint8Array(bytes)]) as unknown as File,input={id:'a',name:'x.png',file},state=await createRecipeInputDocument(input)
 expect(state.documentWidth).toBe(20);expect(state.canvasTexts).toEqual([]);expect(state.aiRecovery).toBeUndefined()
 const blob=await processRecipeBatchInput(input,config,new AbortController().signal,{render:async svg=>new NodeBlob([new Uint8Array(new Resvg(svg).render().asPng())],{type:'image/png'}) as unknown as Blob})
 const out=await loadImage(Buffer.from(await blob.arrayBuffer()));ctx.clearRect(0,0,20,10);ctx.drawImage(out,0,0);expect(ctx.getImageData(5,5,1,1).data[3]).toBeGreaterThanOrEqual(127);expect(ctx.getImageData(5,5,1,1).data[3]).toBeLessThanOrEqual(128);expect(state.layers[0].opacity).toBe(100)
 await expect(processRecipeBatchInput(input,{...config,recipe:{...config.recipe,steps:[{id:'bad',tool:'remote-model',args:{}}]}},new AbortController().signal)).rejects.toThrow('本地')
})
