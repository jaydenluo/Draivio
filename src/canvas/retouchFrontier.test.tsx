import { test, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from './CanvasScene'
import { editorReducer, initialEditorState, type EditorState } from '../state/editor'
import { retouchParentId } from './retouchScope'
const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="green"/></svg>', {font:{loadSystemFonts:false}}).render().asPng()
const source = `data:image/png;base64,${Buffer.from(png).toString('base64')}`
const rgba = (state: EditorState) => Array.from(new Resvg(renderToStaticMarkup(<CanvasScene state={state}/>).match(/<svg[\s\S]*<\/svg>/)![0], {font:{loadSystemFonts:false}}).render().pixels.slice(0,4))
test('below crossing a group keeps unsampled group foreground above replacement', () => {
 const state: EditorState = {...structuredClone(initialEditorState),documentWidth:10,documentHeight:10,documentBackground:'transparent', selectedLayerId:'base',selectedLayerIds:['base'],layers:[
 {id:'g',name:'g',className:'',visible:true,opacity:50,blendMode:'正常',children:['upper','base']},
 {id:'upper',name:'upper',className:'',visible:true,opacity:100,blendMode:'正常',groupId:'g'},
 {id:'base',name:'base',className:'',visible:true,opacity:100,blendMode:'正常',groupId:'g'},
 {id:'bottom',name:'bottom',className:'',visible:true,opacity:100,blendMode:'正常'}],brushStrokes:[],canvasTexts:[],layerMasks:{},sceneOrder:[],canvasShapes:[
 {id:'u',layerId:'upper',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#0000ff',strokeWidth:0},
 {id:'b',layerId:'base',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#ff0000',strokeWidth:0},
 {id:'d',layerId:'bottom',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#ffff00',strokeWidth:0}]}
 const parent=retouchParentId(state.layers,'base','below')
 const next=editorReducer(state,{type:'add-repair-layer',baseLayerId:'base',name:'repair',source,repairCoverage:'M0 0H10V10H0Z',repairSourceIds:['base','bottom'],placementParentId:parent,rootPlacement:!parent})
 // The unsampled opaque foreground blue remains in its 50% group, above the repaired backdrop.
 console.log(next.layers.map(x=>[x.id,x.groupId,x.children])); console.log(renderToStaticMarkup(<CanvasScene state={next}/>)); expect(rgba(next)).toEqual([0,64,128,255])
})
