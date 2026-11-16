import { render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from '../canvas/CanvasScene'
import { initialEditorState } from '../state/editor'
import { createSelection } from '../canvas/selectionGeometry'
import { serializeExport } from './serializeExport'
it('serializes real React CanvasScene namespaces and preserves canvas, layer and selection pixels',()=>{
 const state=structuredClone(initialEditorState)
 state.documentWidth=20;state.documentHeight=10;state.documentBackground='#ffffff'
 state.layers=[{id:'art',name:'red',className:'layer-art',visible:true,opacity:100,blendMode:'正常'}]
 state.canvasShapes=[{id:'red',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:50,height:100},color:'#ff0000',strokeWidth:0}]
 state.selectionVisible=false
 const {container}=render(<CanvasScene state={state}/>);const svg=container.querySelector('svg')!
 Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:20,height:10}}})
 const source=serializeExport(svg,{range:'canvas'})
 expect(new DOMParser().parseFromString(source,'image/svg+xml').querySelector('parsererror')).toBeNull()
 const result=new Resvg(source).render()
 expect([result.width,result.height]).toEqual([20,10])
 const pixel=(p:Uint8Array,x:number,y:number,w:number)=>Array.from(p.slice((y*w+x)*4,(y*w+x)*4+4))
 expect(pixel(result.pixels,2,5,20)).toEqual([255,0,0,255]);expect(pixel(result.pixels,15,5,20)).toEqual([255,255,255,255])
 const layer=new Resvg(serializeExport(svg,{range:'layer',selectedLayerId:'art'})).render()
 expect(pixel(layer.pixels,2,5,20)).toEqual([255,0,0,255]);expect(pixel(layer.pixels,15,5,20)).toEqual([0,0,0,0])
 const selection=new Resvg(serializeExport(svg,{range:'selection',selection:createSelection('rectangle',{x:0,y:0,width:50,height:100})})).render()
 expect([selection.width,selection.height]).toEqual([10,10]);expect(pixel(selection.pixels,2,5,10)).toEqual([255,0,0,255])
})
