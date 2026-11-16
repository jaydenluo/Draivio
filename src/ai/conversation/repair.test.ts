import { it,expect } from 'vitest'
import { initialEditorState,editorReducer } from '../../state/editor'
import { createEditPreview } from '../execution/preview'
import { recordConversationRun,undoConversationRun } from './session'
const base=()=>structuredClone(initialEditorState)
it('undoes adopted AI lock without treating its own lock as a subsequent manual edit',()=>{
 const b=base(),steps=[{id:'s',tool:'lock' as const,args:{layerId:'art',locked:true},dependsOn:[]}]
 const p=createEditPreview(b,'doc',steps,['art']),after=recordConversationRun(b,p.document,'doc','run',steps)
 const manual=editorReducer(after,{type:'rename-layer',id:'original',name:'manual'})
 const result=undoConversationRun(manual,'doc')
 console.log('lock undo result',result.state.layers.find(l=>l.id==='art')?.locked,result.warnings)
 expect(result.state.layers.find(l=>l.id==='art')?.locked).not.toBe(true)
 expect(result.state.layers.find(l=>l.id==='original')?.name).toBe('manual')
})
it('undoes adopted structural AI delete while preserving a subsequent independent manual edit',()=>{
 const b=base(),steps=[{id:'s',tool:'delete' as const,args:{layerId:'art'},dependsOn:[]}]
 const p=createEditPreview(b,'doc',steps,['art']),after=recordConversationRun(b,p.document,'doc','run',steps)
 const manual=editorReducer(after,{type:'rename-layer',id:'original',name:'manual'})
 const result=undoConversationRun(manual,'doc')
 expect(result.state.layers.some(l=>l.id==='art')).toBe(true)
 expect(result.state.layers.find(l=>l.id==='original')?.name).toBe('manual')
})
import { encodeProject,decodeProject } from '../../document/projectFormat'
it('rejects malformed conversation metadata through actual project open boundary',async()=>{
 const b=base(),steps=[{id:'s',tool:'move' as const,args:{layerId:'art',dx:10,dy:0},dependsOn:[]}]
 const p=createEditPreview(b,'doc',steps,['art']),after=recordConversationRun(b,p.document,'doc','run',steps)
 const text=await encodeProject(after,{id:'p',name:'p'}),raw=JSON.parse(text)
 raw.document.conversationRuns[0].prompt='private conversation prompt'
 expect(()=>decodeProject(JSON.stringify(raw))).toThrow(/对话/)
})
import { type PlanStep } from '../planning/planner'
import { createSelection } from '../../canvas/selectionGeometry'
function adopted(before:ReturnType<typeof base>,steps:PlanStep[]){const p=createEditPreview(before,'doc',steps,before.layers.map(l=>l.id));return recordConversationRun(before,p.document,'doc','run',steps)}
it('restores a deleted subtree with shapes masks and scene IDs while keeping independent manual state',()=>{
 const b=base();b.layers[0].groupId='g';b.layers.unshift({id:'g',name:'g',className:'',kind:'group',visible:true,opacity:100,blendMode:'正常',children:['art']})
 b.canvasShapes=[{id:'shape',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:10,height:10},color:'#f00',strokeWidth:0}];b.sceneOrder=['shape'];b.layerMasks.art={selection:createSelection('rectangle',{x:0,y:0,width:50,height:100}),strokes:[],applied:true,inverted:false}
 const a=adopted(b,[{id:'s',tool:'delete',args:{layerId:'g'},dependsOn:[]}]),manual=editorReducer(a,{type:'set-layer-opacity',id:'original',opacity:33}),r=undoConversationRun(manual,'doc')
 expect(r.warnings).toEqual([]);expect(r.state.layers.map(l=>l.id)).toEqual(b.layers.map(l=>l.id));expect(r.state.canvasShapes).toEqual(b.canvasShapes);expect(r.state.layerMasks).toEqual(b.layerMasks);expect(r.state.sceneOrder).toEqual(['shape']);expect(r.state.layers.find(l=>l.id==='original')!.opacity).toBe(33)
})
it('removes AI duplicate but preserves changed source; keeps modified copies retryable',()=>{
 const b=base(),a=adopted(b,[{id:'s',tool:'duplicate',args:{layerId:'art'},dependsOn:[]}]),copy=a.layers.find(l=>!b.layers.some(old=>old.id===l.id))!
 const manual=editorReducer(a,{type:'rename-layer',id:'art',name:'manual source'}),r=undoConversationRun(manual,'doc')
 expect(r.state.layers).toHaveLength(3);expect(r.state.layers.find(l=>l.id==='art')!.name).toBe('manual source')
 const modified=editorReducer(a,{type:'rename-layer',id:copy.id,name:'manual copy'}),blocked=undoConversationRun(modified,'doc')
 expect(blocked.state.layers.find(l=>l.id===copy.id)!.name).toBe('manual copy');expect(blocked.state.conversationRuns![0].status).toBe('applied');expect(blocked.warnings.length).toBeGreaterThan(0)
 const reset=editorReducer(blocked.state,{type:'rename-layer',id:copy.id,name:copy.name});expect(undoConversationRun(reset,'doc').state.layers).toHaveLength(3)
})
it('ungroups the AI-created group while preserving member edits and original parent links',()=>{
 const b=base(),a=adopted(b,[{id:'s',tool:'group',args:{layerIds:['art','mask']},dependsOn:[]}]),manual=editorReducer(a,{type:'rename-layer',id:'art',name:'manual member'}),r=undoConversationRun(manual,'doc')
 expect(r.warnings).toEqual([]);expect(r.state.layers).toHaveLength(3);expect(r.state.layers.find(l=>l.id==='art')!.name).toBe('manual member');expect(r.state.layers.every(l=>!l.groupId)).toBe(true)
})
it('restores only the AI order relation and keeps independent manual reorder',()=>{
 const b=base();b.layers.push({...b.layers[2],id:'fourth',name:'fourth',visible:true})
 const a=adopted(b,[{id:'s',tool:'reorder',args:{layerId:'art',direction:'down'},dependsOn:[]}]),manual=editorReducer(a,{type:'reorder-layer',id:'fourth',direction:'up'}),r=undoConversationRun(manual,'doc')
 expect(r.state.layers.map(l=>l.id)).toEqual(['art','mask','fourth','original']);expect(r.warnings).toEqual([])
})
it('never bypasses later manual locks and retains unresolved inverse across project reopen',async()=>{
 const a=adopted(base(),[{id:'s',tool:'lock',args:{layerId:'art',locked:true},dependsOn:[]}])
 const unlocked=editorReducer(a,{type:'toggle-layer-lock',id:'art'}),relocked=editorReducer(unlocked,{type:'toggle-layer-lock',id:'art'}),blocked=undoConversationRun(relocked,'doc')
 expect(blocked.state.layers.find(l=>l.id==='art')!.locked).toBe(true);expect(blocked.state.conversationRuns![0].status).toBe('applied')
 const text=await encodeProject(blocked.state,{id:'p',name:'p'}),loaded=decodeProject(text).document
 expect(loaded.conversationRuns![0].invalidatedLocks).toEqual(['art'])
 const ownMove=adopted(base(),[{id:'s',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}]),locked=editorReducer(ownMove,{type:'toggle-layer-lock',id:'art'}),partial=undoConversationRun(locked,'doc')
 expect(partial.state.conversationRuns![0].status).toBe('applied')
 const retry=undoConversationRun(editorReducer(partial.state,{type:'toggle-layer-lock',id:'art'}),'doc');expect(retry.state.layers.find(l=>l.id==='art')!.transform).toBeUndefined();expect(retry.state.conversationRuns![0].status).toBe('undone')
})
it('survives project save and reopen with a real structural inverse',async()=>{
 const a=adopted(base(),[{id:'s',tool:'delete',args:{layerId:'art'},dependsOn:[]}]),text=await encodeProject(a,{id:'p',name:'p'}),loaded={...base(),...decodeProject(text).document}
 const result=undoConversationRun(loaded,'doc');expect(result.state.layers.some(l=>l.id==='art')).toBe(true);expect(result.state.conversationRuns![0].status).toBe('undone')
})
it('removes newly added smart filter root instead of leaving an invalid empty object',()=>{
 const a=adopted(base(),[{id:'s',tool:'filter',args:{layerId:'art',kind:'grain',radius:1,amount:.1,seed:2},dependsOn:[]}]),r=undoConversationRun(a,'doc')
 expect(r.state.layers.find(l=>l.id==='art')!.smartFilters).toBeUndefined()
})
it('redo after selective conversational undo restores AI effect while retaining independent manual work',()=>{
 const b=base(),a=adopted(b,[{id:'s',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}]),manual=editorReducer(a,{type:'rename-layer',id:'original',name:'manual'})
 const inverse=undoConversationRun(manual,'doc')
 const applied=editorReducer(manual,{type:'apply-conversation-undo',document:inverse.state})
 expect(applied.layers.find(l=>l.id==='art')!.transform).toBeUndefined()
 const redone=editorReducer(applied,{type:'redo'})
 expect(redone.layers.find(l=>l.id==='art')!.transform).toEqual(a.layers.find(l=>l.id==='art')!.transform)
 expect(redone.layers.find(l=>l.id==='original')!.name).toBe('manual')
})
it('removes an unchanged AI-duplicated subtree in child-first order with associated content',()=>{
 const b=base();b.layers[0].groupId='g';b.layers.unshift({id:'g',name:'g',className:'',kind:'group',visible:true,opacity:100,blendMode:'正常',children:['art']});b.canvasShapes=[{id:'shape',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:10,height:10},color:'#f00',strokeWidth:0}];b.sceneOrder=['shape']
 const a=adopted(b,[{id:'s',tool:'duplicate',args:{layerId:'g'},dependsOn:[]}]),r=undoConversationRun(a,'doc')
 expect(r.state.layers).toEqual(b.layers);expect(r.state.canvasShapes).toEqual(b.canvasShapes);expect(r.state.sceneOrder).toEqual(b.sceneOrder)
})
