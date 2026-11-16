import { expect,it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { render,cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from '../../canvas/CanvasScene'
import { serializeExport } from '../../render/serializeExport'
import { editorReducer,type EditorState } from '../../state/editor'
import { createProductCandidate,adoptProductCandidate,defaultProductSettings } from './product'
import { productFixture } from './productFixture'
import { encodeProject,decodeProject } from '../../document/projectFormat'
const raster=(s:string)=>new Resvg(s).render()
const originalSvg='<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#8090a0"/><rect x="12" y="5" width="24" height="33" fill="#cc8030"/><rect x="14" y="14" width="20" height="9" fill="#ffffff"/><path d="M16 16h2v5h-2zM20 16h5v1h-3v1h3v3h-5zM28 16h2v5h-2z" fill="#000000"/></svg>'
const source=`data:image/png;base64,${Buffer.from(raster(originalSvg).asPng()).toString('base64')}`
function svg(state:EditorState){return renderToStaticMarkup(<CanvasScene state={state} thumbnail/>).replace('<svg ','<svg width="48" height="48" ')}
const pixel=(p:Uint8Array,x:number,y:number)=>Array.from(p.slice((y*48+x)*4,(y*48+x+1)*4))
it('preserves label pixels and holes, keeps half alpha on glass and matches actual scene/export/reopen with independent contact shadow',async()=>{
 const b=productFixture(source),raw=raster(originalSvg),c=createProductCandidate(b,'doc',{...defaultProductSettings(),color:'#e0f0ff',shadowBlur:2}),applied=adoptProductCandidate(c,b,'doc')
 const after=raster(svg(applied)),before=raster(svg(b))
 for(let y=14;y<22;y++)for(let x=14;x<28;x++)expect(pixel(after.pixels,x,y)).toEqual(pixel(raw.pixels,x,y))
 expect(pixel(after.pixels,20,30)).not.toEqual(pixel(raw.pixels,20,30));expect(pixel(before.pixels,20,30)[3]).toBe(0)
 expect(pixel(before.pixels,30,26)[3]).toBe(128)
 expect(after.pixels).not.toEqual(before.pixels)
 const noShadow={...applied,layers:applied.layers.map(l=>l.productRecipe?.role==='shadow'?{...l,visible:false}:l)}
 expect(after.pixels).not.toEqual(raster(svg(noShadow)).pixels)
 const reopened=editorReducer(b,{type:'restore-project',document:decodeProject(await encodeProject(applied,{id:'p',name:'product'})).document})
 expect(raster(svg(reopened)).pixels).toEqual(after.pixels)
 const {container}=render(<CanvasScene state={applied}/>),node=container.querySelector('svg')!
 Object.defineProperty(node,'viewBox',{value:{baseVal:{x:0,y:0,width:48,height:48}}})
 const exported=raster(serializeExport(node,{range:'canvas'}))
 expect(exported.pixels).toEqual(after.pixels)
 expect(raster(svg(editorReducer(applied,{type:'undo'}))).pixels).toEqual(before.pixels)
 expect(raster(svg(editorReducer(editorReducer(applied,{type:'undo'}),{type:'redo'}))).pixels).toEqual(after.pixels)
 writeFileSync('docs/implementation/product-recipe/before.png',before.asPng());writeFileSync('docs/implementation/product-recipe/after.png',after.asPng());writeFileSync('docs/implementation/product-recipe/export.png',exported.asPng());cleanup()
})
