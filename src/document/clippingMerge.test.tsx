import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { expect, it } from 'vitest'
import { initialEditorState, editorReducer, type EditorState, type Layer } from '../state/editor'
import { prepareLayerMerge, applyLayerMerge } from './groupTransforms'
import { CanvasScene } from '../canvas/CanvasScene'
import { validateClipping } from '../state/clipping'
const layer=(id:string):Layer=>({id,name:id,className:'layer-art',visible:true,opacity:100,blendMode:'正常'})
const state=()=>({...structuredClone(initialEditorState),documentWidth:32,documentHeight:32,layers:[{...layer('top'),clipBaseId:'base',blendMode:'柔光'},{...layer('base'),opacity:50,blendMode:'正片叠底'},layer('back')],selectedLayerId:'top',selectedLayerIds:['top','base'],canvasTexts:[],brushStrokes:[],canvasShapes:[{id:'top-s',layerId:'top',kind:'rectangle' as const,rect:{x:0,y:0,width:100,height:100},color:'#ff8833',strokeWidth:0},{id:'base-s',layerId:'base',kind:'ellipse' as const,rect:{x:10,y:10,width:80,height:80},color:'#4488bb',strokeWidth:0},{id:'back-s',layerId:'back',kind:'rectangle' as const,rect:{x:0,y:0,width:100,height:100},color:'#23aa69',strokeWidth:0}],sceneOrder:['top-s','base-s','back-s']})
const render=(s:EditorState)=>new Resvg(renderToStaticMarkup(<CanvasScene state={s}/>)).render().pixels
const encode=async(svg:string)=>`data:image/png;base64,${new Resvg(svg).render().asPng().toString('base64')}`
it('full clipping-chain merge keeps alpha, blend with backdrop, and undo',async()=>{
 const s=state(),before=render(s),result=await prepareLayerMerge(s,'selected',encode),next=applyLayerMerge(s,result)
 expect(()=>validateClipping(next.layers)).not.toThrow()
 const after=render(next);expect(after.length).toBe(before.length)
 for(let i=0;i<after.length;i++)expect(Math.abs(after[i]-before[i])).toBeLessThanOrEqual(2)
 const committed=editorReducer(s,{type:'merge-layer-result',result});expect(render(editorReducer(committed,{type:'undo'}))).toEqual(before)
})
it.each([['top'],['base']])('refuses a partial clipping-chain merge of %s with no document mutation',async(id)=>{
 const s=state();s.selectedLayerId=id;s.selectedLayerIds=[id];const before=structuredClone(s)
 await expect(prepareLayerMerge(s,'selected',encode)).rejects.toThrow(/完整剪贴链/);expect(s).toEqual(before)
})

it('ungroup promotes explicit children order and preserves internal clipping pixels through undo',()=>{
 const s = state()
 s.layers = [
   { ...layer('group'), className: 'layer-group', children: ['top', 'base'] },
   s.layers[1],
   s.layers[0],
   s.layers[2],
 ]
 s.layers[1].groupId = 'group'; s.layers[2].groupId = 'group'
 const before = render(s)
 const ungrouped = editorReducer(s, { type: 'ungroup-layers', id: 'group' })
 expect(ungrouped.layers.map(layer => layer.id)).toEqual(['top', 'base', 'back'])
 expect(ungrouped.layers.find(layer => layer.id === 'top')?.clipBaseId).toBe('base')
 const after = render(ungrouped)
 let maxDiff = 0; for (let index = 0; index < after.length; index++) maxDiff = Math.max(maxDiff, Math.abs(after[index] - before[index]))
 expect(maxDiff).toBeLessThanOrEqual(64)
 const undone = editorReducer(ungrouped, { type: 'undo' })
 expect(render(undone)).toEqual(before)
})
