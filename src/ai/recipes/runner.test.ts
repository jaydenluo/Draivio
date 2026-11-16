import { describe,expect,it } from 'vitest'
import { initialEditorState,editorReducer } from '../../state/editor'
import { validateRecipe,parseRecipe,type Recipe } from './schema'
import { previewRecipe,runRecipe,editorRecipeTools } from './runner'
const recipe=():Recipe=>({schemaVersion:1,id:'basic',version:1,name:'透明度',inputs:[{id:'target',required:true}],parameters:{amount:{type:'number',default:42,min:0,max:100}},steps:[{id:'opacity',tool:'opacity',args:{layerId:{$input:'target'},value:{$parameter:'amount'}}}]})
const state=()=>structuredClone(initialEditorState)
describe('editable recipes',()=>{
 it('previews privately, commits once, undoes and replays edited parameters',async()=>{
  const before=state(), definition=recipe(), bindings={target:'art'}
  const preview=await previewRecipe(before,definition,{amount:40},bindings,editorRecipeTools)
  expect(before.layers[0].opacity).not.toBe(40); expect(preview.state.layers[0].opacity).toBe(40)
  const result=await runRecipe(before,definition,{amount:40},bindings,editorRecipeTools,{documentId:'doc'})
  expect(result.status).toBe('committed'); expect(result.state.undoStack).toHaveLength(1)
  expect(editorReducer(result.state,{type:'undo'}).layers).toEqual(before.layers)
  const edited=await previewRecipe(before,definition,{amount:60},bindings,editorRecipeTools)
  expect(edited.state.layers[0].opacity).toBe(60)
 })
 it('rejects missing tools, missing input, cycles, bounds and stale versions before any effects',()=>{
  const s=state(),r=recipe()
  expect(()=>validateRecipe(r,{amount:101},{target:'art'},editorRecipeTools,s)).toThrow(/范围/)
  expect(()=>validateRecipe(r,{}, {},editorRecipeTools,s)).toThrow(/输入/)
  expect(()=>validateRecipe(r,{}, {target:'deleted'},editorRecipeTools,s)).toThrow(/图层/)
  expect(()=>validateRecipe({...r,steps:[{...r.steps[0],tool:'script'}]}, {},{target:'art'},editorRecipeTools,s)).toThrow(/工具/)
  expect(()=>validateRecipe({...r,steps:[{...r.steps[0],dependsOn:['opacity']}]},{},{target:'art'},editorRecipeTools,s)).toThrow(/循环/)
  expect(()=>parseRecipe({...r,schemaVersion:90})).toThrow(/版本/)
 })
 it('migrates version zero and roundtrips only serializable data',()=>{
  const old={...recipe(),schemaVersion:0}; const migrated=parseRecipe(old)
  expect(migrated.schemaVersion).toBe(1); expect(parseRecipe(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated)
  expect(()=>parseRecipe({...recipe(),steps:[{id:'script',tool:'opacity',args:{value:()=>0}}]})).toThrow()
 })
 it('rolls back midflight failure and cancellation and rejects changed document',async()=>{
  const before=state(),r=recipe(),controller=new AbortController()
  const fail={...editorRecipeTools,broken:{deterministic:true,execute:()=>{throw new Error('failure')}}}
  const result=await runRecipe(before,{...r,steps:[...r.steps,{id:'bad',tool:'broken',args:{},dependsOn:['opacity']}]},{},{target:'art'},fail,{documentId:'doc'})
  expect(result.status).toBe('failed');expect(result.state).toBe(before)
  controller.abort();expect((await runRecipe(before,r,{}, {target:'art'},editorRecipeTools,{documentId:'doc',signal:controller.signal})).status).toBe('cancelled')
  const changed=editorReducer(before,{type:'rename-layer',id:'art',name:'new'})
  expect((await runRecipe(before,r,{}, {target:'art'},editorRecipeTools,{documentId:'doc',current:()=>changed})).status).toBe('conflict')
 })
 it('records deterministic arguments and requires actual generation provenance',async()=>{
  const r=recipe(),before=state()
  const a=await previewRecipe(before,r,{amount:22},{target:'art'},editorRecipeTools),b=await previewRecipe(before,r,{amount:22},{target:'art'},editorRecipeTools)
  expect(a.records).toEqual(b.records);expect(a.state.layers).toEqual(b.state.layers)
  const generated={gen:{deterministic:false,execute:()=>({state:before,provenance:{model:'real-model',provider:'configured',seed:123,randomness:'seeded'}})}}
  const g=await previewRecipe(before,{...r,steps:[{id:'gen',tool:'gen',args:{}}]},{},{target:'art'},generated)
  expect(g.records[0].provenance?.seed).toBe(123)
 })
})
describe('recipe boundary protection',()=>{
 it('rejects incompatible document conditions and never invokes a valid earlier tool when a later one is missing',async()=>{
  const r=recipe(),before=state();let calls=0
  const tools={...editorRecipeTools,opacity:{deterministic:true,execute:(s:typeof before)=>{calls++;return{state:s}}}}
  expect(()=>validateRecipe({...r,conditions:{minWidth:10000}},{},{target:'art'},tools,before)).toThrow(/适用/)
  await expect(runRecipe(before,{...r,steps:[...r.steps,{id:'unknown',tool:'unknown',args:{}}]},{},{target:'art'},tools,{documentId:'doc'})).rejects.toThrow(/工具/)
  expect(calls).toBe(0)
 })
 it('discards a late completion after document switching and refuses absent stochastic evidence',async()=>{
  const before=state();let id='doc';const r={...recipe(),steps:[{id:'async',tool:'async',args:{}}]}
  const switched=await runRecipe(before,r,{},{target:'art'},{async:{deterministic:true,execute:async s=>{id='other';return{state:editorReducer(s,{type:'rename-layer',id:'art',name:'bad'})}}}},{documentId:'doc',currentDocumentId:()=>id})
  expect(switched.status).toBe('failed');expect(switched.state).toBe(before)
  const missing=await runRecipe(before,r,{},{target:'art'},{async:{deterministic:false,execute:s=>({state:s})}},{documentId:'doc'})
  expect(missing.status).toBe('failed');expect(missing.state).toBe(before)
 })
})

describe('review regression: complete preflight before handlers',()=>{
 it.each([{layerId:'missing-layer',value:20},{layerId:'art',value:'bad'},{layerId:'art',value:101},{layerIds:['art','missing-layer'],dx:1,dy:1}])('rejects malformed later literal arguments before earlier external effects: %j',async args=>{
  const before=state();let calls=0;const tools={...editorRecipeTools,count:{deterministic:true,execute:(s:typeof before)=>{calls++;return{state:s}}}}
  const r={...recipe(),steps:[{id:'first',tool:'count',args:{}},{id:'last',tool:'dx' in args?'move':'opacity',args,dependsOn:['first']}] } as Recipe
  await expect(runRecipe(before,r,{},{target:'art'},tools)).rejects.toThrow();expect(calls).toBe(0)
 })
 it('runs custom validator contracts for every step before any handler',async()=>{let calls=0;const tools={count:{deterministic:true,execute:(s:ReturnType<typeof state>)=>{calls++;return{state:s}}},custom:{deterministic:true,validate:(_s:ReturnType<typeof state>,args:Record<string,unknown>)=>{if(args.amount!==5)throw new Error('invalid custom amount')},execute:(s:ReturnType<typeof state>)=>({state:s})}};await expect(runRecipe(state(),{...recipe(),steps:[{id:'first',tool:'count',args:{}},{id:'custom',tool:'custom',args:{amount:6}}]},{},{target:'art'},tools)).rejects.toThrow('invalid custom amount');expect(calls).toBe(0)})
 it('clears document-scoped saved recipes on new-document and restores them on undo',()=>{const before=state();before.savedRecipes=[{recipe:recipe(),parameters:{amount:42},bindings:{target:'art'},records:[]}];const fresh=editorReducer(before,{type:'new-document',width:100,height:100});expect(fresh.savedRecipes).toEqual([]);expect(editorReducer(fresh,{type:'undo'}).savedRecipes).toEqual(before.savedRecipes)})
})
