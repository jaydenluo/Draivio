import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { CanvasScene } from './CanvasScene'
import { initialEditorState } from '../state/editor'
import { createSelection, combineSelection, invertSelection } from './selectionGeometry'
import { serializeExportScene, exportRangeDimensions } from './exportScene'

test.each(['ellipse','path','boolean','inverse'] as const)('exports actual %s selection with feather without mutating editor', kind => {
  const first=createSelection('ellipse',{x:10,y:20,width:60,height:50},{feather:4})
  const selection=kind==='boolean'?combineSelection(first,createSelection('rectangle',{x:30,y:30,width:10,height:10}),'subtract'):kind==='inverse'?invertSelection(first):kind==='path'?{...first,path:{type:'path' as const,d:'M10 20L70 20L10 70Z',points:[{x:10,y:20},{x:70,y:20},{x:10,y:70}]}}:first
  const view=render(<CanvasScene state={{...initialEditorState,documentWidth:800,documentHeight:600}} />)
  const original=view.container.querySelector('svg')!; const before=original.outerHTML
  const result=serializeExportScene(original,{range:'selection',selection})
  const doc=new DOMParser().parseFromString(result,'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull()
  expect(doc.querySelector('mask')?.namespaceURI).toBe('http://www.w3.org/2000/svg')
  expect(doc.querySelector('[data-export-selection]')?.getAttribute('mask')).toBe('url(#draivio-export-selection)')
  expect(doc.querySelector(`feGaussianBlur[stdDeviation="${selection.feather}"]`)).not.toBeNull()
  if(kind==='ellipse') expect(doc.querySelector('ellipse')).not.toBeNull()
  if(kind==='path') expect(doc.querySelector('path[d="M10 20L70 20L10 70Z"]')).not.toBeNull()
  if(kind==='boolean') expect(doc.querySelector('mask[id$="-r"]')).not.toBeNull()
  expect(original.outerHTML).toBe(before)
  expect(exportRangeDimensions(800,600,'selection',selection)).toEqual(kind==='inverse'?{width:800,height:600}:{width:480,height:300})
})
test('rejects missing/hidden targets and selection, retaining parent effects for valid layers',()=>{
  const state={...initialEditorState,layers:[{...initialEditorState.layers[0],id:'parent',children:['child'],opacity:50},{...initialEditorState.layers[0],id:'child',groupId:'parent',opacity:40}]}
  const view=render(<CanvasScene state={state}/>); const svg=view.container.querySelector('svg')!
  expect(()=>serializeExportScene(svg,{range:'layer',layerId:'missing'})).toThrow(/图层/)
  expect(()=>serializeExportScene(svg,{range:'selection'})).toThrow(/选区/)
  const exported=new DOMParser().parseFromString(serializeExportScene(svg,{range:'layer',layerId:'child'}),'image/svg+xml')
  expect(exported.querySelector('[data-layer-id="parent"]')?.getAttribute('opacity')).toBe('0.5')
  expect(exported.querySelector('[data-layer-id="child"]')?.getAttribute('opacity')).toBe('0.4')
})
test('refuses a layer explicitly hidden by an ancestor style',()=>{
 const view=render(<svg viewBox="0 0 100 100"><g style={{display:'none'}}><g data-layer-id="hidden"><rect width="100" height="100"/></g></g></svg>)
 expect(()=>serializeExportScene(view.container.querySelector('svg')!,{range:'layer',layerId:'hidden'})).toThrow('隐藏')
})
test.each(['canvas','layer'] as const)('preserves committed crop for %s without changing source coordinates',range=>{
 const view=render(<svg viewBox="0 0 500 625"><g data-layer-id="art"><rect width="500" height="625"/></g></svg>)
 const cropRect={x:25,y:20,width:50,height:40}
 const result=new DOMParser().parseFromString(serializeExportScene(view.container.querySelector('svg')!,{range,layerId:'art',cropRect}),'image/svg+xml')
 expect(result.documentElement.getAttribute('viewBox')).toBe('125 125 250 250')
 expect(result.documentElement.getAttribute('width')).toBe('250');expect(result.documentElement.getAttribute('height')).toBe('250')
 expect(exportRangeDimensions(500,625,range,undefined,cropRect)).toEqual({width:250,height:250})
})
test('intersects selection crop with committed visible canvas, rejecting disjoint selections',()=>{
 const view=render(<svg viewBox="0 0 500 625"><rect width="500" height="625"/></svg>);const svg=view.container.querySelector('svg')!
 const cropRect={x:25,y:20,width:50,height:40};const selection=createSelection('ellipse',{x:50,y:40,width:50,height:50})
 const result=new DOMParser().parseFromString(serializeExportScene(svg,{range:'selection',selection,cropRect}),'image/svg+xml')
 expect(result.documentElement.getAttribute('viewBox')).toBe('250 250 125 125')
 expect(exportRangeDimensions(500,625,'selection',selection,cropRect)).toEqual({width:125,height:125})
 expect(()=>serializeExportScene(svg,{range:'selection',selection:createSelection('rectangle',{x:0,y:0,width:10,height:10}),cropRect})).toThrow('选区')
})
