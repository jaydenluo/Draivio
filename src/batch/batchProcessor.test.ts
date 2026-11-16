import { describe, expect, it } from 'vitest'
import { BatchQueue, defaultRecipe, resizeGeometry, normalizeRecipe, watermarkRect, outputName, applyBatchPreset } from './batchProcessor'

describe('batch recipes and pixels', () => {
  it('fits landscape and portrait, fills by centered crop and keeps alpha', () => {
    expect(resizeGeometry(400,200,{...defaultRecipe(),mode:'long-edge',longEdge:100})).toMatchObject({width:100,height:50})
    expect(resizeGeometry(200,400,{...defaultRecipe(),mode:'long-edge',longEdge:100})).toMatchObject({width:50,height:100})
    expect(resizeGeometry(400,200,{...defaultRecipe(),mode:'fixed',width:100,height:100,fit:'fit'})).toMatchObject({width:100,height:100,dx:0,dy:25,dw:100,dh:50})
    expect(resizeGeometry(400,200,{...defaultRecipe(),mode:'fixed',width:100,height:100,fit:'fill'})).toMatchObject({sx:100,sy:0,sw:200,sh:200})
    expect([...applyBatchPreset(new Uint8ClampedArray([120,60,20,0,120,60,20,180]),'mono')]).toEqual([70,70,70,0,70,70,70,180])
  })
  it('validates persisted recipes and deterministic safe names / watermark placement', () => {
    const recipe={...defaultRecipe(),watermark:{...defaultRecipe().watermark,kind:'text' as const,text:'版权所有'}}
    expect(normalizeRecipe(JSON.parse(JSON.stringify(recipe)))).toEqual(recipe)
    expect(() => normalizeRecipe({...recipe,width:100000})).toThrow()
    expect(() => normalizeRecipe({...recipe,quality:NaN})).toThrow()
    expect(outputName('../foo.png','png',2)).toBe('foo-batch-003.png')
    expect(watermarkRect(200,100,40,20,'bottom-right',10)).toEqual({x:150,y:70,width:40,height:20})
    const edge=watermarkRect(10,10,20,20,'bottom-right',100);expect(edge.x).toBeGreaterThanOrEqual(0);expect(edge.y).toBeGreaterThanOrEqual(0);expect(edge.x+edge.width).toBeLessThanOrEqual(10)
  })
})
describe('bounded queue', () => {
  it('continues after corruption, caps concurrency and retries only failed items', async () => {
    const q=new BatchQueue(['a','bad','c'].map(name=>({id:name,name})),2); let active=0,max=0; const calls:string[]=[]
    await q.run(async item=>{calls.push(item.id); active++;max=Math.max(max,active);await Promise.resolve();active--;if(item.id==='bad')throw new Error('损坏');return '/out/'+item.name})
    expect(max).toBe(2);expect(q.items.map(i=>i.status)).toEqual(['success','failed','success']);expect(q.items[1].error).toBe('损坏')
    await q.run(async item=>{calls.push(item.id);return '/out/'+item.name},true)
    expect(calls).toEqual(['a','bad','c','bad']);expect(q.summary()).toMatchObject({success:3,failed:0})
  })
  it('cancels future scheduling, retains completed outputs and does not auto-retry cancelled items', async () => {
    const q=new BatchQueue(['a','b','c'].map(name=>({id:name,name})),1)
    await q.run(async item=>{q.cancel();return '/out/'+item.name})
    expect(q.items.map(i=>i.status)).toEqual(['success','cancelled','cancelled'])
    expect(q.items[0].output).toBe('/out/a');let calls=0
    await q.run(async()=>{calls++;return 'x'},true);expect(calls).toBe(0)
  })
})

describe('Unicode output filenames',()=>{
 it('budgets UTF-8 bytes including output suffix without breaking unicode codepoints',()=>{
  for(const name of ['图'.repeat(60)+'.png','😀'.repeat(60)+'.jpeg','e\u0301'.repeat(100)+'.webp']){
   const generated=outputName(name,'png',999)
   expect(new TextEncoder().encode(generated).length).toBeLessThanOrEqual(170)
   expect(generated).toMatch(/-batch-1000\.png$/)
   expect(generated).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/)
  }
 })
})
