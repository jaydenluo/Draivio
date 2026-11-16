import { expect, it } from 'vitest'
import { initialEditorState, editorReducer } from '../state/editor'
import { encodeProject, decodeProject } from './projectFormat'
import { editorSnapIndex, snapLayerTransform } from '../canvas/snapTransform'
import { layerCanvasBounds } from './alignment'
import { layerMatrix, multiplyPoint } from '../canvas/layerCoordinates'
it('guide edit is one undo transaction and survives project reopen; malformed guide rejected',async()=>{
 const s=structuredClone(initialEditorState), next=editorReducer(s,{type:'update-guide-settings',action:{type:'add',guide:{id:'g',axis:'x',position:35,locked:false}}})
 expect(next.undoStack).toHaveLength(1);expect(editorReducer(next,{type:'undo'}).guideSettings.guides).toEqual([])
 const file=await encodeProject(next,{id:'d',name:'test'});expect(decodeProject(file).document.guideSettings).toEqual(next.guideSettings)
 const invalid=JSON.parse(file);invalid.document.guideSettings.grid.spacingX=0;expect(()=>decodeProject(JSON.stringify(invalid))).toThrow()
})
it.each([25,100,400])('maps screen snap threshold through world AABB at %s%%',zoom=>{
 const s=structuredClone(initialEditorState);s.zoom=zoom;s.layers=[{...s.layers[0],id:'a',transform:{kind:'transform',rect:{x:10,y:10,width:20,height:20},rotation:30,flipX:false,flipY:false}}];s.selectedLayerId='a';s.selectedLayerIds=['a'];const d=s.layers[0].transform!;const b=layerCanvasBounds(s,'a');s.guideSettings.guides=[{id:'g',axis:'x',position:b.x+5/(zoom/100),locked:false}]
 const result=snapLayerTransform(s,'a',d,editorSnapIndex(s,'a'),'move',false);const moved=layerCanvasBounds({...s,layers:[{...s.layers[0],transform:result.draft}]},'a');expect(moved.x).toBeCloseTo(s.guideSettings.guides[0].position,4)
 expect(snapLayerTransform(s,'a',d,editorSnapIndex(s,'a'),'move',true).draft).toEqual(d)
})
it('resize snaps rotated AABB while keeping opposite corner fixed',()=>{
 const s=structuredClone(initialEditorState);s.layers=[{...s.layers[0],id:'a',transform:{kind:'transform',rect:{x:20,y:20,width:20,height:20},rotation:30,flipX:false,flipY:false}}];s.selectedLayerId='a';const d=s.layers[0].transform!,b=layerCanvasBounds(s,'a');s.guideSettings.guides=[{id:'g',axis:'x',position:b.x+b.width+3,locked:false}];const result=snapLayerTransform(s,'a',d,editorSnapIndex(s,'a'),'se',false)
 const before=multiplyPoint(layerMatrix(d,s.documentWidth,s.documentHeight),{x:0,y:0}),after=multiplyPoint(layerMatrix(result.draft,s.documentWidth,s.documentHeight),{x:0,y:0});expect(after.x).toBeCloseTo(before.x,4);expect(after.y).toBeCloseTo(before.y,4)
 const actual=layerCanvasBounds({...s,layers:[{...s.layers[0],transform:result.draft}]},'a');expect(actual.x+actual.width).toBeCloseTo(s.guideSettings.guides[0].position,4)
})
it('maps resize correction through rotated parent and child affine without moving opposite corner',()=>{
 const s=structuredClone(initialEditorState);const child={...s.layers[0],id:'a',groupId:'g',transform:{kind:'transform' as const,rect:{x:20,y:20,width:20,height:20},rotation:20,flipX:false,flipY:false,affine:[1,.1,.15,1,2,3] as [number,number,number,number,number,number]}};const parent={...s.layers[0],id:'g',source:undefined,children:['a'],transform:{kind:'transform' as const,rect:{x:10,y:10,width:70,height:70},rotation:15,flipX:false,flipY:false}};s.layers=[parent,child];s.selectedLayerId='a';const d=child.transform,b=layerCanvasBounds(s,'a');s.guideSettings.guides=[{id:'g1',axis:'x',position:b.x+b.width+2,locked:false}];const result=snapLayerTransform(s,'a',d,editorSnapIndex(s,'a'),'se',false)
 const before=multiplyPoint(layerMatrix(d,s.documentWidth,s.documentHeight),{x:0,y:0}),after=multiplyPoint(layerMatrix(result.draft,s.documentWidth,s.documentHeight),{x:0,y:0});expect(after.x).toBeCloseTo(before.x,4);expect(after.y).toBeCloseTo(before.y,4)
 const actual=layerCanvasBounds({...s,layers:[parent,{...child,transform:result.draft}]},'a');expect(actual.x+actual.width).toBeCloseTo(s.guideSettings.guides[0].position,4)
})
