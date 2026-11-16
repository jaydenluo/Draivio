import { expect,it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from '../../canvas/CanvasScene'
import { editorReducer,initialEditorState } from '../../state/editor'
import { createSelection,combineSelection } from '../../canvas/selectionGeometry'
import { applyDrawingTool } from './drawingTools'
function fixture(){const s=structuredClone(initialEditorState);s.documentWidth=100;s.documentHeight=100;s.documentBackground='transparent';s.layers=[{id:'base',name:'空图层',kind:'image',className:'layer-art',visible:true,opacity:100,blendMode:'正常'}];s.brushStrokes=[];s.canvasShapes=[];s.sceneOrder=[];s.artboards=[];s.activeArtboardId=null;s.selectedLayerId='base';s.selectedLayerIds=['base'];s.layerMasks={};s.selectionVisible=true;s.selection=createSelection('ellipse',{x:10,y:10,width:80,height:80});s.selection=combineSelection(s.selection,createSelection('rectangle',{x:40,y:40,width:20,height:20}),'subtract');return s}
const pixels=(s:ReturnType<typeof fixture>)=>new Resvg(renderToStaticMarkup(<CanvasScene state={s} thumbnail/>)).render().pixels
const alpha=(p:Uint8Array,x:number,y:number)=>p[(y*100+x)*4+3]
it.each(['fill','gradient-fill'] as const)('uses real document contour and hole for %s despite forged caller selection',name=>{
 const s=fixture(),before=structuredClone(s),next=applyDrawingTool(s,name,{layerId:'base',color:'#ff0000',selection:createSelection('rectangle',{x:0,y:0,width:100,height:100})}),p=pixels(next)
 expect(alpha(p,50,25)).toBe(255);expect(alpha(p,50,50)).toBe(0);expect(alpha(p,12,12)).toBe(0);expect(alpha(p,5,50)).toBe(0);expect(s).toEqual(before)
 expect(editorReducer(next,{type:'undo'}).canvasShapes).toEqual(before.canvasShapes)
 // The action captured the real selection, not an alias that can change after authorization.
 s.selection.path={type:'shape',kind:'rectangle',rect:{x:0,y:0,width:100,height:100}};expect(pixels(next)).toEqual(p)
})
it('accepted rectangular brush keeps all visible pixels inside current selection',()=>{
 const s=fixture();s.selection=createSelection('rectangle',{x:20,y:20,width:60,height:60})
 const next=applyDrawingTool(s,'brush',{layerId:'base',color:'#ff0000',size:10,hardness:100,points:[{x:30,y:30},{x:70,y:70}]})
 const p=pixels(next);expect(alpha(p,50,50)).toBe(255)
 for(let y=0;y<100;y++)for(let x=0;x<100;x++)if(x<20||x>=80||y<20||y>=80)expect(alpha(p,x,y)).toBe(0)
})
