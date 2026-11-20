import {act,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {CanvasSceneView as CanvasScene} from './CanvasScene'
import {initialEditorState,type EditorState} from '../state/editor'
import * as exports from '../render/exportImage'
import {createSmartFilter} from '../render/filterPipeline'
import {imageAssetStore} from '../assets/imageAssetStore'
function state(seed:number):EditorState{const s=structuredClone(initialEditorState);s.documentWidth=8;s.documentHeight=8;s.layers=[{id:'art',name:'a',className:'layer-art',source:'fixture',visible:true,opacity:100,blendMode:'正常',smartFilters:{items:[{...createSmartFilter('grain','g'),amount:.2,seed}]}}];s.layerMasks={};s.brushStrokes=[];s.canvasShapes=[];s.canvasTexts=[];return s}

it('keeps the result pending until the display image loads, and preserves the scene if it fails to load', async () => {
 const materialize = vi.spyOn(exports, 'materializeColorAdjustments').mockResolvedValue('<svg/>')
 try {
  const view = render(<CanvasScene state={state(1)} />)
  const image = await waitFor(() => {
   const image = view.container.querySelector('[data-color-preview]')
   expect(image).toBeInTheDocument()
   return image!
  })
  expect(screen.getByText(/滤镜预览计算中/)).toBeInTheDocument()
  expect(view.container.querySelector('[data-color-preview-source]')).not.toHaveAttribute('visibility', 'hidden')
  await act(async () => image.dispatchEvent(new Event('error')))
  expect(await screen.findByRole('alert')).toHaveTextContent('滤镜预览无法显示')
  expect(view.container.querySelector('[data-color-preview-source]')).not.toHaveAttribute('visibility', 'hidden')
 } finally { materialize.mockRestore() }
})

it('renders again when native pixels become available and skips work for hidden layers', async () => {
 const materialize = vi.spyOn(exports, 'materializeColorAdjustments').mockResolvedValue('<svg/>')
 const ref = { assetId: 'a'.repeat(48), revision: 1 }
 const s = state(1)
 s.layers[0] = { ...s.layers[0], rasterRef: ref }
 const view = render(<CanvasScene state={s} />)
 try {
  await waitFor(() => expect(materialize).toHaveBeenCalledTimes(1))
  act(() => imageAssetStore.publishPreview(ref, 'data:image/png;base64,cGl4ZWxz', 'filter-test'))
  await waitFor(() => expect(materialize).toHaveBeenCalledTimes(2))
  expect(materialize.mock.calls[1][0]).toContain('data:image/png;base64,cGl4ZWxz')
  view.rerender(<CanvasScene state={{ ...s, layers: [{ ...s.layers[0], visible: false }] }} />)
  expect(materialize).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(/滤镜预览计算中/)).not.toBeInTheDocument()
 } finally { view.unmount(); imageAssetStore.releaseOwner('filter-test'); materialize.mockRestore() }
})
it('shows pending source, aborts old advanced preview, and never publishes superseded results',async()=>{const jobs:Array<{resolve:(s:string)=>void;signal?:AbortSignal}>=[];vi.spyOn(exports,'materializeColorAdjustments').mockImplementation((_source,deps)=>new Promise(resolve=>jobs.push({resolve,signal:deps?.signal})));const view=render(<CanvasScene state={state(1)}/>);await waitFor(()=>expect(jobs).toHaveLength(1));expect(screen.getByText(/滤镜预览计算中/)).toBeInTheDocument();view.rerender(<CanvasScene state={state(2)}/>);await waitFor(()=>expect(jobs).toHaveLength(2));expect(jobs[0].signal?.aborted).toBe(true);await act(async()=>jobs[0].resolve('<svg old="true"/>'));expect(view.container.querySelector('[data-color-preview]')).toBeNull();await act(async()=>jobs[1].resolve('<svg fresh="true"/>'));expect(view.container.querySelector('[data-color-preview]')?.getAttribute('href')).toContain('fresh');await act(async()=>view.container.querySelector('[data-color-preview]')!.dispatchEvent(new Event('load')));expect(screen.queryByText(/滤镜预览计算中/)).not.toBeInTheDocument();view.unmount();expect(jobs[1].signal?.aborted).toBe(true);vi.restoreAllMocks()})
it('reports genuine materialization failure while keeping original graph and source intact',async()=>{vi.spyOn(exports,'materializeColorAdjustments').mockRejectedValue(new Error('CPU 智能滤镜最多支持 1600 万像素'));const s=state(1);const view=render(<CanvasScene state={s}/>);expect(await screen.findByRole('alert')).toHaveTextContent('1600 万像素');expect(view.container.querySelector('[data-cpu-smart-filters]')).toBeInTheDocument();expect(view.container.querySelector('[data-color-preview]')).toBeNull();expect(s.layers[0].source).toBe('fixture');vi.restoreAllMocks()})
