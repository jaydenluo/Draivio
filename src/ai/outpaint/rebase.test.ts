import {it,expect} from 'vitest'
import {testMaskedIO as io} from '../maskedEdit/testIO'
import {initialEditorState,editorReducer,type EditorState} from '../../state/editor'
import {generateOutpaint} from './workflow'
import {expansionFromEdges} from './geometry'
import {captureEditorContext} from '../context/editorContext'
import {contextPreviewSvg} from '../context/editorPreview'
import {encodeProject,decodeProject} from '../../document/projectFormat'
const png=io.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},(_,i)=>[i*10,30,80,255]).flat())}),raw=io.encode({width:1,height:1,data:new Uint8ClampedArray([100,50,200,255])})
const render=async(s:EditorState)=>io.decode(await io.render(contextPreviewSvg(s,captureEditorContext(s,'doc','document')),s.documentWidth,s.documentHeight))
for(const variant of ['nested','transformed-group','documentSpace','nested-documentSpace'])it(`retains ${variant} editable original pixels after asymmetric adoption/hide/delete/project and undo`,async()=>{
 let s:EditorState={...initialEditorState,documentWidth:8,documentHeight:6,documentBackground:'transparent',layers:[{id:'art',name:'art',className:'layer-art',source:png,visible:true,opacity:100,blendMode:'正常',...(variant.includes('documentSpace')?{documentSpace:true,contentWidth:8,contentHeight:6}:{}),transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}}],selectedLayerId:'art',selectedLayerIds:['art'],brushStrokes:[],canvasTexts:[],canvasShapes:[],layerMasks:{},sceneOrder:[],aiResults:[],smartObjectSources:{},prompt:'extend'}
 if(variant!=='documentSpace')s.layers=[{id:'group',name:'group',kind:'group',className:'layer-art',visible:true,opacity:100,blendMode:'正常',children:['art'],transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:variant==='transformed-group'?90:0,flipX:false,flipY:false}},{...s.layers[0],groupId:'group'}]
 const before=await render(s),e=expansionFromEdges(8,6,{left:3,right:2,top:1,bottom:3}),result=await generateOutpaint(s,'doc',e,'transparent-edit',async()=>raw,{io})
 s=editorReducer(s,{type:'add-ai-result',result});s=editorReducer(s,{type:'adopt-outpaint-result',id:result.id});const snapshot=s.selectedLayerId
 for(const action of ['hide','delete','reopen']as const){let hidden=editorReducer(s,action==='delete'?{type:'delete-layer',id:snapshot}:{type:'toggle-layer',id:snapshot});if(action==='reopen')hidden={...hidden,...decodeProject(await encodeProject(hidden,{id:'doc',name:'rebased'})).document};const image=await render(hidden);for(let y=0;y<6;y++)for(let x=0;x<8;x++)expect([...image.data.slice(((y+1)*13+x+3)*4,((y+1)*13+x+3)*4+4)]).toEqual([...before.data.slice((y*8+x)*4,(y*8+x)*4+4)])}
 const undo=editorReducer(s,{type:'undo'});expect([...(await render(undo)).data]).toEqual([...before.data])
},20000)

import {rebaseOutpaintLayers} from './rebase'
import {layerWorldPixelMatrix,documentPointToLayerLocal} from '../../canvas/layerWorldMatrix'
import {multiplyMatrices,invertMatrix,multiplyPoint,type AffineMatrix} from '../../canvas/layerCoordinates'
it('normalized document-space affine shares the actual physical map with pointer and mask tools',()=>{
 const s:EditorState={...initialEditorState,documentWidth:8,documentHeight:6,layers:[{id:'group',name:'g',className:'layer-art',kind:'group',children:['art'],visible:true,opacity:100,blendMode:'正常',transform:{kind:'transform',rect:{x:10,y:5,width:80,height:90},rotation:20,flipX:false,flipY:false}},{id:'art',groupId:'group',name:'art',className:'layer-art',source:png,documentSpace:true,contentWidth:8,contentHeight:6,visible:true,opacity:100,blendMode:'正常'}]}
 const e=expansionFromEdges(8,6,{left:3,right:2,top:1,bottom:3}),layers=rebaseOutpaintLayers(s,e)
 const parent=layerWorldPixelMatrix(s.layers,'group',8,6),oldEffective=multiplyMatrices(parent,invertMatrix(layerWorldPixelMatrix(s.layers,'art',8,6))),expected=multiplyMatrices([1,0,0,1,3,1],oldEffective),actual=layerWorldPixelMatrix(layers,'art',13,10)
 actual.forEach((n,i)=>expect(n).toBeCloseTo(expected[i],10))
 const localPixel={x:4,y:3},document=multiplyPoint(actual,localPixel),local=documentPointToLayerLocal(layers,'art',{x:document.x/13*100,y:document.y/10*100},13,10)
 expect(local.x).toBeCloseTo(50);expect(local.y).toBeCloseTo(50)
})

it('post-hide affine transform gesture updates the same editable layer coordinate map',async()=>{
 let s:EditorState={...initialEditorState,documentWidth:8,documentHeight:6,documentBackground:'transparent',layers:[{id:'art',name:'a',className:'layer-art',source:png,documentSpace:true,contentWidth:8,contentHeight:6,visible:true,opacity:100,blendMode:'正常'}],selectedLayerId:'art',selectedLayerIds:['art'],brushStrokes:[],canvasTexts:[],canvasShapes:[],layerMasks:{},aiResults:[],sceneOrder:[]}
 const e=expansionFromEdges(8,6,{left:3,right:2,top:1,bottom:3}),result=await generateOutpaint(s,'doc',e,'transparent-edit',async()=>raw,{io});s=editorReducer(s,{type:'add-ai-result',result});s=editorReducer(s,{type:'adopt-outpaint-result',id:result.id});s=editorReducer(s,{type:'toggle-layer',id:s.selectedLayerId});s=editorReducer(s,{type:'select-layer',id:'art'})
 const before=await render(s),transform=s.layers.find(l=>l.id==='art')!.transform!,affine=[...transform.affine!] as AffineMatrix;affine[4]+=100/13
 s=editorReducer(s,{type:'commit-layer-transform',layerId:'art',transform:{...transform,affine}})
 const moved=await render(s);for(let y=1;y<7;y++)for(let x=3;x<10;x++)expect([...moved.data.slice((y*13+x+1)*4,(y*13+x+1)*4+4)]).toEqual([...before.data.slice((y*13+x)*4,(y*13+x)*4+4)])
 const local=documentPointToLayerLocal(s.layers,'art',{x:8/13*100,y:4/10*100},13,10);expect(local.x).toBeCloseTo(50);expect(local.y).toBeCloseTo(50)
},15000)
