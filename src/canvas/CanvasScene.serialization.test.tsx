import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { expect, it } from 'vitest'
import { CanvasScene, CanvasSceneView } from './CanvasScene'
import { initialEditorState } from '../state/editor'
import { createSmartFilter } from '../render/filterPipeline'
it('serializes exactly one SVG root even with pending filters, unavailable proof and a mask preview',()=>{
 const state=structuredClone(initialEditorState)
 state.documentWidth=10;state.documentHeight=10;state.documentBackground='#00ff00';state.layers=[]
 state.proofSettings={...state.proofSettings,enabled:true,targetProfile:undefined} as typeof state.proofSettings
 const filter={...createSmartFilter('grain','grain'),amount:.2,seed:1}
 state.layers=[{id:'test',name:'test',className:'layer-art',visible:true,opacity:100,blendMode:'正常',smartFilters:{items:[filter]}}]
 state.selectedLayerId='test';state.activeToolGroup='mask';state.layerMasks={test:{strokes:[],applied:false,inverted:false}}
 for(const thumbnail of [false,true]){
  const markup=renderToStaticMarkup(<CanvasScene state={state} thumbnail={thumbnail}/>),doc=new DOMParser().parseFromString(markup,'image/svg+xml')
  expect(doc.querySelector('parsererror')).toBeNull();expect(doc.documentElement.localName).toBe('svg');expect(doc.childNodes).toHaveLength(1)
  expect(doc.querySelector('span,div,[data-artboard-overlay],[aria-label="蒙版红色预览"]')).toBeNull()
  expect(()=>new Resvg(markup).render()).not.toThrow()
 }
 const interactive=renderToStaticMarkup(<CanvasSceneView state={state}/>);expect(interactive).toContain('滤镜预览计算中');expect(interactive).toContain('软打样不可用');expect(interactive).toContain('蒙版红色预览')
})
it('editor decoration never changes the first document pixel',()=>{
 const state=structuredClone(initialEditorState);state.documentWidth=10;state.documentHeight=10;state.layers=[];state.documentBackground='#008000'
 const rendered=new Resvg(renderToStaticMarkup(<CanvasScene state={state}/>)).render();expect([...rendered.pixels.slice(0,4)]).toEqual([0,128,0,255])
})
