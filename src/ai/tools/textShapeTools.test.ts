import {it,expect} from 'vitest';import {initialEditorState,type EditorState} from '../../state/editor';import {applyText,applyShape} from './textShapeTools';import {getAiManualTool} from './toolCoverage'
const s=():EditorState=>({...structuredClone(initialEditorState),layers:[{...initialEditorState.layers[0],id:'base'}],selectedLayerId:'base',selectedLayerIds:['base'],canvasTexts:[],canvasShapes:[]})
it('keeps AI text editable and undoable',()=>{const n=applyText(s(),{layerId:'base',text:'中文标题',x:10,y:10,fontFamily:'sans-serif',fontSize:24,fontWeight:'400',color:'#fff',align:'left'});expect(n.canvasTexts[0].text).toBe('中文标题');expect(n.layers.some(l=>l.kind==='text'||l.id==='base')).toBe(true);expect(n.undoStack).toHaveLength(1)})
it('rejects locked or invalid shapes',()=>{expect(()=>applyShape({...s(),layers:s().layers.map(l=>({...l,locked:true}))},{layerId:'base',kind:'rectangle',rect:{x:0,y:0,width:0,height:20},color:'#fff',strokeWidth:0} as any)).toThrow(/锁定/)})
it.each(['x','y','width','height'] as const)('rejects nonfinite shape %s without writes',key=>{
 for(const value of [NaN,Infinity,-Infinity]){const state=s(),before=structuredClone(state);expect(()=>applyShape(state,{layerId:'base',kind:'rectangle',rect:{x:0,y:0,width:20,height:20,[key]:value},color:'#fff',strokeWidth:0})).toThrow();expect(state).toEqual(before)}
})
it('rejects nonfinite editable path handles and shape opacity',()=>{
 for(const invalid of [{path:{closed:true,fillRule:'nonzero',anchors:[{x:1,y:1,out:{x:Infinity,y:2}},{x:3,y:3}]}},{opacity:NaN},{strokeWidth:Infinity}])expect(()=>applyShape(s(),{layerId:'base',kind:'path',rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0,...invalid} as any)).toThrow()
})
it('rejects string-coerced dimensions and path handles instead of persisting malformed geometry',()=>{
 expect(()=>applyShape(s(),{layerId:'base',kind:'rectangle',rect:{x:0,y:0,width:'20',height:20},color:'#fff',strokeWidth:0} as any)).toThrow()
 expect(()=>applyShape(s(),{layerId:'base',kind:'path',rect:{x:0,y:0,width:20,height:20},path:{closed:true,fillRule:'nonzero',anchors:[{x:1,y:1,out:{x:'bad',y:2}},{x:3,y:3}]},color:'#fff',strokeWidth:0} as any)).toThrow()
})
it('rejects unknown shape kinds and duplicate object identities',()=>{
 const state=s(); const shape={layerId:'base',kind:'rectangle' as const,rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0}
 expect(()=>applyShape(state,{...shape,kind:'triangle' as any})).toThrow(/类型/)
 const first=applyShape(state,{...shape,id:'shape-1'}); expect(first.canvasShapes).toHaveLength(1)
 expect(()=>applyShape(first,{...shape,id:'shape-1'})).toThrow(/ID/)
})
it('rejects malformed kind-specific structures',()=>{
 const state=s(); const base={layerId:'base',kind:'boolean' as const,rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0}
 expect(()=>applyShape(state,base as any)).toThrow(/布尔形状/)
 expect(()=>applyShape(state,{...base,boolean:{left:{},right:{},mode:'union'}} as any)).toThrow()
 expect(()=>applyShape(state,{...base,boolean:{left:{closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:1,y:1}]},right:{closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:1,y:1}]},mode:'invalid'}} as any)).toThrow(/模式/)
})
it('enforces shape validation through the registered manual adapter',()=>{
 const tool=getAiManualTool('shape'); expect('execute' in tool).toBe(true); if(!('execute' in tool))throw new Error('shape adapter missing')
 const execute=tool.execute as (state: ReturnType<typeof s>, shape: any) => ReturnType<typeof s>; const shape={layerId:'base',kind:'rectangle' as const,rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0,id:'registry-shape'}
 const first=execute(s(),shape); expect(first.canvasShapes).toHaveLength(1)
 expect(()=>execute(first,shape)).toThrow(/ID/)
 expect(()=>execute(s(),{...shape,kind:'unknown' as any})).toThrow(/类型/)
})
it('enforces text identity validation through the registered manual adapter',()=>{
 const tool=getAiManualTool('text'); expect('execute' in tool).toBe(true); if(!('execute' in tool))throw new Error('text adapter missing')
 const execute=tool.execute as (state: ReturnType<typeof s>, text: any) => ReturnType<typeof s>; const text={layerId:'base',text:'标题',x:10,y:10,fontFamily:'sans-serif',fontSize:24,fontWeight:'400',color:'#fff',align:'left',id:'registry-text'}
 const first=execute(s(),text); expect(first.canvasTexts).toHaveLength(1)
 expect(()=>execute(first,text)).toThrow(/ID/); expect(()=>execute(s(),{...text,id:''})).toThrow(/ID/); expect(()=>execute(s(),{...text,id:42})).toThrow(/ID/)
})
const registryText={layerId:'target',id:'new-text',text:'指定目标',x:10,y:10,fontFamily:'sans-serif',fontSize:24,fontWeight:'400',color:'#fff',align:'left' as const}
const registryShape={layerId:'target',id:'new-shape',kind:'rectangle' as const,rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0}
const registryExecute=(name:'text'|'shape')=>getAiManualTool(name) as {execute:typeof applyText|typeof applyShape}
const twoLayers=()=>({...s(),layers:[...s().layers,{...s().layers[0],id:'target'}]})
it.each(['text','shape'] as const)('publishes registered %s to an existing unselected target without duplicating layers',name=>{
 const state=twoLayers(),before=structuredClone(state)
 const next=registryExecute(name).execute(state,(name==='text'?registryText:registryShape) as any)
 expect(next.layers).toEqual(state.layers);expect(new Set(next.layers.map(l=>l.id)).size).toBe(2)
 expect(name==='text'?next.canvasTexts[0].layerId:next.canvasShapes[0].layerId).toBe('target')
 expect(next.undoStack).toHaveLength(state.undoStack.length+1);expect(state).toEqual(before)
})
it.each(['text','shape'] as const)('rejects registered %s object IDs colliding with layers and invalid target contexts',name=>{
 const input=name==='text'?registryText:registryShape
 for(const kind of ['group','mask','adjustment'] as const){const state=twoLayers();state.layers[1].kind=kind;const before=structuredClone(state);expect(()=>registryExecute(name).execute(state,input as any)).toThrow(/目标图层/);expect(state).toEqual(before)}
 for(const id of ['base','target'])expect(()=>registryExecute(name).execute(twoLayers(),{...input,id} as any)).toThrow(/ID/)
 const smart=twoLayers();smart.layers[1].smartObject={} as any;expect(()=>registryExecute(name).execute(smart,input as any)).toThrow(/目标图层/)
 const locked=twoLayers();locked.layers.push({...locked.layers[0],id:'parent',kind:'group',locked:true});locked.layers[1].groupId='parent';expect(()=>registryExecute(name).execute(locked,input as any)).toThrow(/锁定/)
 const missing=twoLayers();expect(()=>registryExecute(name).execute(missing,{...input,layerId:'missing'} as any)).toThrow(/不存在/)
 const ambiguous=twoLayers();ambiguous.layers.push({...ambiguous.layers[1]});expect(()=>registryExecute(name).execute(ambiguous,input as any)).toThrow(/目标图层/)
})
it.each(['text','shape'] as const)('keeps registered %s identity checks across every published scene collection',name=>{
 const input=name==='text'?registryText:registryShape
 for(const collision of ['text','shape','stroke','sceneOrder'] as const){
  const state=twoLayers(),id='collision'
  if(collision==='text')(state.canvasTexts as any[]).push({...registryText,id,layerId:'base'})
  if(collision==='shape')(state.canvasShapes as any[]).push({...registryShape,id,layerId:'base'})
  if(collision==='stroke')state.brushStrokes=[{id,layerId:'base'} as any]
  if(collision==='sceneOrder')state.sceneOrder=[id]
  const before=structuredClone(state);expect(()=>registryExecute(name).execute(state,{...input,id} as any)).toThrow(/ID/);expect(state).toEqual(before)
 }
 for(const id of ['', ' ', 0, null, {}])expect(()=>registryExecute(name).execute(twoLayers(),{...input,id} as any)).toThrow(/ID/)
})
it.each(['text','shape'] as const)('uses registered %s explicit target instead of selected context for inherited locks',name=>{
 const input=name==='text'?registryText:registryShape
 const state=twoLayers();state.layers[0].locked=true
 expect(()=>registryExecute(name).execute(state,input as any)).not.toThrow()
 const inherited=twoLayers();inherited.layers.push({...inherited.layers[0],id:'group',kind:'group',locked:true,children:['target']})
 const before=structuredClone(inherited);expect(()=>registryExecute(name).execute(inherited,input as any)).toThrow(/锁定/);expect(inherited).toEqual(before)
 for(const layerId of [null,42,''])expect(()=>registryExecute(name).execute(twoLayers(),{...input,layerId} as any)).toThrow(/目标图层/)
})
it.each([
 {text:42},{fontFamily:[]},{fontWeight:400},{color:{}},{align:'justify'},{layout:'other'},
 {width:'30'},{height:-2},{width:0},{lineHeight:0},{lineHeight:'1.4'},{letterSpacing:'2'},{rotation:'30'},
 {runs:{}},{runs:[null]},{runs:[{start:-1,end:2}]},{runs:[{start:0,end:999}]},{runs:[{start:0,end:1,fontSize:'20'}]},
 {runs:[{start:0,end:1,fontFamily:42}]},{runs:[{start:0,end:1,color:{}}]}
])('rejects malformed text runtime fields through the registry: %j',invalid=>{
 const state=twoLayers(),before=structuredClone(state)
 expect(()=>registryExecute('text').execute(state,{...registryText,...invalid} as any)).toThrow();expect(state).toEqual(before)
})
it('publishes valid paragraph text styles to the explicit registry target',()=>{
 const state=twoLayers(),next=registryExecute('text').execute(state,{...registryText,layout:'paragraph',width:240,height:80,lineHeight:1.5,letterSpacing:-1,rotation:15,runs:[{start:0,end:2,fontSize:30,fontFamily:'serif',fontWeight:'700',color:'#f00'}]} as any)
 expect(next.canvasTexts[0]).toMatchObject({layerId:'target',layout:'paragraph',width:240,height:80});expect(next.canvasTexts[0].runs).toHaveLength(1)
})
import {validateDocument} from '../../document/projectValidation'
import {editorReducer} from '../../state/editor'
it.each([{lineHeight:21},{lineHeight:0.09},{letterSpacing:101},{letterSpacing:-101},{rotation:361},{rotation:-361}])('rejects registry text outside persistence schema limits: %j',patch=>{
 expect(()=>registryExecute('text').execute(twoLayers(),{...registryText,...patch} as any)).toThrow()
})
it.each(['text','shape'] as const)('rejects %s on an actual reducer-created kindless group',name=>{
 const grouped=editorReducer(twoLayers(),{type:'group-layers',ids:['base','target']})
 const group=grouped.layers.find(l=>l.className==='layer-group')!
 expect(group.kind).toBeUndefined();expect(()=>registryExecute(name).execute(grouped,{...(name==='text'?registryText:registryShape),layerId:group.id} as any)).toThrow(/目标图层/)
})
it.each([{color:42},{endColor:42},{selection:{rect:{x:0,y:0,width:1,height:1}}},{strokeColor:42},{hidden:'false'},{fillEnabled:1},{scaleStroke:0},{dashArray:42},{strokeLineCap:'invalid'},{strokeLineJoin:'invalid'}])('rejects registry shape malformed persisted styles and selection: %j',patch=>{
 expect(()=>registryExecute('shape').execute(twoLayers(),{...registryShape,...patch} as any)).toThrow()
})
it.each(['text','shape'] as const)('publishes registry %s results that satisfy validateDocument',name=>{
 const state={...structuredClone(initialEditorState),colorManagement:initialEditorState.colorManagement},target=state.layers.find(l=>l.className!=='layer-group'&&!l.smartObject)!.id
 const next=registryExecute(name).execute(state,{...(name==='text'?registryText:registryShape),layerId:target} as any)
 expect(()=>validateDocument(next)).not.toThrow()
})
it.each([[],['a'],['a','a'],['a',42],['a','b','c']].map(sourceIds=>({sourceIds})))('rejects malformed shape boolean source identities through registry: %j',({sourceIds})=>{
 const path={closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:10,y:10}]}
 expect(()=>registryExecute('shape').execute(twoLayers(),{...registryShape,kind:'boolean',boolean:{left:path,right:path,mode:'union',sourceIds}} as any)).toThrow()
})
it.each(['rectangle','ellipse','line','arrow','fill','gradient','path','boolean'] as const)('publishes schema-valid registered %s including optional styles',kind=>{
 const state={...structuredClone(initialEditorState),colorManagement:initialEditorState.colorManagement},path={closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:10,y:10}]}
 const next=registryExecute('shape').execute(state,{...registryShape,kind,layerId:state.selectedLayerId,path:kind==='path'?path:undefined,boolean:kind==='boolean'?{left:path,right:path,mode:'union',sourceIds:['left','right']}:undefined,selection:state.selection,endColor:'#fff',strokeColor:'#000',hidden:false,fillEnabled:true,scaleStroke:false,dashArray:'2 2',strokeLineCap:'round',strokeLineJoin:'bevel'} as any)
 expect(()=>validateDocument(next)).not.toThrow()
})
