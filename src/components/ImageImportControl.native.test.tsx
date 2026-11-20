import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
const transport=vi.hoisted(()=>vi.fn())
vi.mock('@tauri-apps/api/window',()=>({getCurrentWindow:()=>({onCloseRequested:async()=>()=>{},listen:async()=>()=>{}})}))
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true,invoke:transport}))
import {EditorProvider,useEditor} from '../state/editor'
import {COMMAND_EVENT} from '../commands/shortcuts'
import {ImageImportControl} from './ImageImportControl'
const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),c=>c.charCodeAt(0))
const asset={protocolVersion:1,assetId:'a'.repeat(48),session:'b'.repeat(48),revision:1,lease:'c'.repeat(48),metadata:{width:400,height:200,bands:4,sampleType:'u8',orientation:6,pages:1,format:'png',editingSupported:true,profileHash:null},contentHash:null,profile:null}
function Probe(){const {state,dispatch}=useEditor();return <><output data-testid="document">{state.documentWidth} × {state.documentHeight} · {state.undoStack.length} · {state.layers[0]?.source??''}</output><button onClick={()=>dispatch({type:'new-document',width:640,height:480})}>切换文档</button></>}
function setup(overrides:Record<string,unknown>={}){
 let op='preview'
 transport.mockImplementation(async(command:string,args?:Record<string,unknown>)=>{
  if(command in overrides)return await (typeof overrides[command]==='function'?(overrides[command] as ()=>unknown)():overrides[command])
  if(command==='image_asset_pick')return structuredClone(asset)
  if(command==='image_asset_start'){op=args!.operation as string;return job()}
  if(command==='image_asset_job')return job()
  if(command==='image_asset_snapshot')return {...asset,rasterRef:{assetId:asset.assetId,revision:1}}
  function job(){return {protocolVersion:1,jobId:op,assetId:asset.assetId,revision:1,phase:'ready',contentHash:null,error:null,resource:{resourceId:op,session:asset.session,assetId:asset.assetId,revision:1,role:op,mime:'image/png',bytes:png.length,width:400,height:200,coordinateSpace:op==='preview'?'display':'source',resourceUrl:`https://native/${op}`,displayTransformHash:op==='preview'?'display':null}}}
 })
 class DecodedImage{naturalWidth=200;naturalHeight=400;onload?:()=>void;set src(value:string){if(value)queueMicrotask(()=>this.onload?.())}}
 vi.stubGlobal('Image',DecodedImage)
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(png,{status:206,headers:{'Content-Range':`bytes 0-${png.length-1}/${png.length}`}})))
 const rendered=render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent(window,new CustomEvent(COMMAND_EVENT,{detail:'importImage'}))
 return rendered
}
it('uses native production picker and imports original bytes, never the display preview',async()=>{
 setup()
 await screen.findByAltText('原生显示预览（不用于编辑）')
 expect(screen.getByTestId('document')).toHaveTextContent('500 × 625 · 0')
 await waitFor(()=>expect(screen.getByRole('button',{name:'导入'})).not.toBeDisabled())
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByTestId('document')).toHaveTextContent('200 × 400 · 1 · data:image/png;base64,'))
 expect(fetch).toHaveBeenCalledWith('https://native/original',expect.anything())
 expect(screen.getByTestId('document')).not.toHaveTextContent('https://native/preview')
 await waitFor(()=>expect(transport).toHaveBeenCalledWith('image_asset_dispose',expect.objectContaining({assetId:asset.assetId})))
 expect(transport).toHaveBeenCalledWith('image_resource_replace_root',{owner:{kind:'transaction',id:`import:${asset.assetId}`},references:[]})
})
it('keeps oversized native source as preview only without editing it',async()=>{
 setup({image_asset_pick:{...asset,metadata:{...asset.metadata,width:20000}}})
 await screen.findByAltText('原生显示预览（不用于编辑）')
 expect(screen.getByRole('button',{name:'导入'})).toBeDisabled()
 expect(screen.getByTestId('document')).toHaveTextContent('500 × 625 · 0')
 fireEvent.click(screen.getByRole('button',{name:'关闭导入图片'}))
 await waitFor(()=>expect(transport).toHaveBeenCalledWith('image_asset_dispose',expect.anything()))
 expect(fetch).not.toHaveBeenCalled()
})
it('releases a native picker result arriving after document change',async()=>{
 let finish!:(value:unknown)=>void
 setup({image_asset_pick:()=>new Promise(resolve=>{finish=resolve})})
 await waitFor(()=>expect(finish).toBeDefined())
 fireEvent.click(screen.getByText('切换文档'))
 finish(asset)
 await waitFor(()=>expect(transport).toHaveBeenCalledWith('image_asset_dispose',expect.objectContaining({assetId:asset.assetId})))
 expect(screen.queryByRole('dialog',{name:'导入图片'})).not.toBeInTheDocument()
 expect(screen.getByTestId('document')).toHaveTextContent('640 × 480 · 1')
})

it('cancels original persistence on document change without late import',async()=>{
 let finish!:(value:unknown)=>void
 setup()
 await screen.findByAltText('原生显示预览（不用于编辑）')
 await waitFor(()=>expect(screen.getByRole('button',{name:'导入'})).not.toBeDisabled())
 transport.mockImplementation(async(command:string)=>{
  if(command==='image_asset_start')return await new Promise(resolve=>{finish=resolve})
 })
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(finish).toBeDefined())
 fireEvent.click(screen.getByText('切换文档'))
 finish({protocolVersion:1,jobId:'original',assetId:asset.assetId,revision:1,phase:'ready',resource:null,error:null,contentHash:null})
 await waitFor(()=>expect(transport).toHaveBeenCalledWith('image_asset_dispose',expect.objectContaining({assetId:asset.assetId})))
 expect(screen.getByTestId('document')).toHaveTextContent('640 × 480 · 1')
 expect(fetch).not.toHaveBeenCalled()
})

it('keeps the preview importer in a body Portal with header-only dragging and reachable close controls',async()=>{
 const {container}=setup()
 await screen.findByAltText('原生显示预览（不用于编辑）')
 const dialog=screen.getByRole('dialog',{name:'导入图片'})
 expect(dialog.parentElement?.parentElement).toBe(document.body)
 expect(container).not.toContainElement(dialog)
 let height=500
 const position=()=>{const [x=0,y=0]=dialog.style.translate.split(' ').map(parseFloat);return {left:200+x,top:100+y,width:300,height}}
 vi.spyOn(dialog,'getBoundingClientRect').mockImplementation(()=>{
  const {left,top,width,height}=position()
  return {left,top,right:left+width,bottom:top+height,width,height,x:left,y:top,toJSON:()=>({})}
 })
 const titlebar=dialog.querySelector('header')!
 const close=screen.getByRole('button',{name:'关闭导入图片'})
 const drag=(target:Element,id:number,dx:number,dy:number)=>{
  fireEvent.pointerDown(target,{pointerId:id,pointerType:'pen',button:0,clientX:230,clientY:120})
  fireEvent.pointerMove(window,{pointerId:id,pointerType:'pen',clientX:230+dx,clientY:120+dy})
  fireEvent.pointerUp(window,{pointerId:id,pointerType:'pen'})
 }
 drag(titlebar.querySelector('strong')??titlebar,1,50,30)
 expect(dialog.style.translate).toBe('50px 30px')
 drag(close,2,100,100)
 drag(screen.getByLabelText('导入尺寸'),3,100,100)
 drag(screen.getByAltText('原生显示预览（不用于编辑）'),4,100,100)
 expect(dialog.style.translate).toBe('50px 30px')
 drag(titlebar,5,10000,10000)
 expect(position().left+300).toBeLessThanOrEqual(window.innerWidth-8)
 expect(position().top+height).toBeLessThanOrEqual(window.innerHeight-8)
 drag(titlebar,6,-10000,-10000)
 expect(position().left).toBe(8)
 expect(position().top).toBe(8)
 // A growing preview must retain access to its title and top-right close control.
 height=window.innerHeight+200
 fireEvent(window,new Event('resize'))
 expect(position().top).toBe(8)
 expect(position().left).toBeGreaterThanOrEqual(8)
 expect(position().left+300).toBeLessThanOrEqual(window.innerWidth-8)
 fireEvent.click(close)
 expect(screen.queryByRole('dialog',{name:'导入图片'})).not.toBeInTheDocument()
 expect(screen.getByTestId('document')).toHaveTextContent('500 × 625 · 0')
 expect(fetch).not.toHaveBeenCalled()
})

it('reserves preview and phase geometry before a delayed preview arrives',async()=>{
 let finish!:(value:unknown)=>void
 const previewJob={protocolVersion:1,jobId:'preview',assetId:asset.assetId,revision:1,phase:'ready',contentHash:null,error:null,resource:{resourceId:'preview',session:asset.session,assetId:asset.assetId,revision:1,role:'preview',mime:'image/png',bytes:100,width:400,height:200,coordinateSpace:'display',resourceUrl:'https://native/preview',displayTransformHash:'display'}}
 setup({image_asset_job:()=>new Promise(resolve=>{finish=resolve})})
 const dialog=await screen.findByRole('dialog',{name:'导入图片'})
 await waitFor(()=>expect(finish).toBeDefined())
 const previewSlot=dialog.querySelector<HTMLElement>('[data-import-preview-slot]')
 const phaseSlot=dialog.querySelector<HTMLElement>('[data-import-phase-slot]')
 expect(previewSlot).not.toBeNull()
 expect(previewSlot!.style.height).toBe('240px')
 expect(phaseSlot!.style.height).toBe('96px')
 vi.spyOn(dialog,'getBoundingClientRect').mockReturnValue({left:200,top:100,right:500,bottom:700,width:300,height:600,x:200,y:100,toJSON:()=>({})})
 const titlebar=dialog.querySelector('header')!
 fireEvent.pointerDown(titlebar,{pointerId:1,button:0,clientX:230,clientY:120})
 fireEvent.pointerMove(window,{pointerId:1,clientX:230,clientY:-1000})
 fireEvent.pointerUp(window,{pointerId:1})
 expect(dialog.style.translate).toBe('0px -92px')
 finish(previewJob)
 await screen.findByAltText('原生显示预览（不用于编辑）')
 expect(dialog.querySelector('[data-import-preview-slot]')).toBe(previewSlot)
 expect(previewSlot!.style.height).toBe('240px')
 expect(phaseSlot!.style.height).toBe('96px')
 expect(dialog.style.translate).toBe('0px -92px')
 fireEvent.click(screen.getByRole('button',{name:'关闭导入图片'}))
 expect(screen.getByTestId('document')).toHaveTextContent('500 × 625 · 0')
})
