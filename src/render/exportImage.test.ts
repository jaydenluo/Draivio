import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportSvgImage, exportFormatMime, prepareSvgExport } from './exportImage'

const source = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"><rect width="10" height="10" fill="red"/></svg>'
function pipeline(blob?: Blob | null) {
  const image = document.createElement('canvas')
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn() }
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const encode = vi.spyOn(canvas, 'toBlob').mockImplementation((cb, mime) => cb(blob === undefined ? new Blob(['pixels'], { type: mime }) : blob))
  const decodeSvg = vi.fn(async () => ({ image, width: 20, height: 10 }))
  return { context, canvas, encode, decodeSvg, deps: { createCanvas: () => canvas, decodeSvg } }
}
afterEach(() => vi.useRealTimers())
describe('image export pipeline', () => {
  it.each(['png','jpeg','webp'] as const)('draws one decoded image for %s and preserves alpha unless JPEG', async format => {
    const p = pipeline()
    const result = await exportSvgImage(source, { format, width: 40, height: 20 }, p.deps)
    expect(result.type).toBe(exportFormatMime(format))
    expect(p.decodeSvg).toHaveBeenCalledTimes(1)
    expect(p.context.drawImage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 0, 0, 20, 10, 0, 0, 40, 20)
    expect(p.context.fillRect).toHaveBeenCalledTimes(format === 'jpeg' ? 1 : 0)
  })
  it.each([null, new Blob([], {type:'image/png'}), new Blob(['fallback'], {type:'image/png'})])('rejects null, empty or unsupported MIME encoding', async blob => {
    await expect(exportSvgImage(source, {format:'webp',width:20,height:10}, pipeline(blob).deps)).rejects.toThrow(/编码|格式/)
  })
  it.each([{format:'gif'}, {width:0}, {width:16385}, {width:8000,height:8000}, {quality:NaN}, {quality:101}, {background:'url(evil)'}])('rejects invalid options before canvas allocation %j', async patch => {
    const p = pipeline(); const createCanvas = vi.fn(p.deps.createCanvas)
    await expect(exportSvgImage(source, {...{format:'png',width:20,height:10},...patch} as never,{...p.deps,createCanvas})).rejects.toThrow()
    expect(createCanvas).not.toHaveBeenCalled()
  })
  it('never fakes a missing context', async () => {
    const p=pipeline(); vi.spyOn(p.canvas,'getContext').mockReturnValue(null)
    await expect(exportSvgImage(source,{format:'png',width:20,height:10},p.deps)).rejects.toThrow('不支持')
  })
  it('bounds decode and aborts pending work', async () => {
    vi.useFakeTimers(); const p=pipeline(); const controller=new AbortController()
    const promise=exportSvgImage(source,{format:'png',width:20,height:10,signal:controller.signal},{...p.deps,decodeSvg:()=>new Promise(()=>{})})
    const rejected=expect(promise).rejects.toThrow(/取消/); controller.abort(); await rejected
    expect(p.encode).not.toHaveBeenCalled()
    const timeout=exportSvgImage(source,{format:'png',width:20,height:10},{...p.deps,decodeSvg:()=>new Promise(()=>{}),timeoutMs:10})
    const timed=expect(timeout).rejects.toThrow(/超时/); await vi.advanceTimersByTimeAsync(11); await timed
  })
  it('embeds external resources once and applies explicit SVG output dimensions', async () => {
    const requestImage=vi.fn(async()=> 'data:image/png;base64,AQID')
    const result=await prepareSvgExport('<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/a"/><image href="https://example.invalid/a"/></svg>', {width:60,height:30}, {requestImage,decodeImage:async()=>({width:1,height:1})})
    expect(requestImage).toHaveBeenCalledTimes(1)
    expect(result).not.toContain('https://'); expect(result).toContain('width="60"'); expect(result).toContain('height="30"')
    await expect(prepareSvgExport('<svg><image href="https://example.invalid/a"/></svg>',{width:20,height:10},{requestImage:async()=>{throw new Error('CORS')}})).rejects.toThrow(/图片/)
  })
})
it('bounds a stalled encoder and releases the output canvas', async()=>{
 vi.useFakeTimers();const p=pipeline();p.encode.mockImplementation(()=>{})
 const promise=exportSvgImage(source,{format:'png',width:20,height:10},{...p.deps,timeoutMs:10})
 const rejected=expect(promise).rejects.toThrow('超时')
 await vi.advanceTimersByTimeAsync(11);await rejected
 expect(p.canvas.width).toBe(0);expect(p.canvas.height).toBe(0)
})
it('releases a decoded image on draw failure', async()=>{
 const p=pipeline();const dispose=vi.fn();p.context.drawImage.mockImplementation(()=>{throw new Error('tainted')})
 await expect(exportSvgImage(source,{format:'png',width:20,height:10},{...p.deps,decodeSvg:async()=>({image:p.canvas,width:20,height:10,dispose})})).rejects.toThrow('tainted')
 expect(dispose).toHaveBeenCalledTimes(1);expect(p.canvas.width).toBe(0)
})
it('disposes an injected decoder that resolves after cancellation', async()=>{
 let resolve!:(value:{image:CanvasImageSource;width:number;height:number;dispose:()=>void})=>void
 const p=pipeline();const controller=new AbortController();const dispose=vi.fn()
 const promise=exportSvgImage(source,{format:'png',width:20,height:10,signal:controller.signal},{...p.deps,decodeSvg:()=>new Promise(done=>{resolve=done})})
 await vi.waitFor(()=>expect(resolve).toBeDefined())
 const rejected=expect(promise).rejects.toThrow('取消');controller.abort();await rejected
 resolve({image:p.canvas,width:20,height:10,dispose});await Promise.resolve();await Promise.resolve()
 expect(dispose).toHaveBeenCalledTimes(1)
})

it.each(['embedded','downloaded'] as const)('rejects a damaged %s resource before whole-SVG decode or encode',async kind=>{
 const p=pipeline();const decodeImage=vi.fn(async()=>{throw new Error('damaged')})
 const href=kind==='embedded'?'data:image/png;base64,AQID':'https://example.invalid/damaged'
 await expect(exportSvgImage(`<svg><image href="${href}"/></svg>`,{format:'png',width:20,height:10},{...p.deps,decodeImage,requestImage:async()=> 'data:image/png;base64,AQID'})).rejects.toThrow('图片')
 expect(decodeImage).toHaveBeenCalledTimes(1);expect(p.decodeSvg).not.toHaveBeenCalled();expect(p.encode).not.toHaveBeenCalled()
})
it('validates each unique resource dimensions and releases it before SVG export',async()=>{
 const dispose=vi.fn();const decodeImage=vi.fn(async()=>({width:0,height:10,dispose}))
 await expect(prepareSvgExport('<svg><image href="data:image/png;base64,AQID"/></svg>',{width:20,height:10},{decodeImage})).rejects.toThrow('图片')
 expect(dispose).toHaveBeenCalledTimes(1)
})
it('decodes duplicate resources once and disposes validation pixels',async()=>{
 const dispose=vi.fn();const decodeImage=vi.fn(async()=>({width:20,height:10,dispose}))
 await prepareSvgExport('<svg><image href="data:image/png;base64,AQID"/><image href="data:image/png;base64,AQID"/></svg>',{width:20,height:10},{decodeImage})
 expect(decodeImage).toHaveBeenCalledTimes(1);expect(dispose).toHaveBeenCalledTimes(1)
})
it('bounds pending resource validation and disposes a late decoded resource',async()=>{
 vi.useFakeTimers();let resolve!:(value:{width:number;height:number;dispose:()=>void})=>void;const dispose=vi.fn()
 const promise=prepareSvgExport('<svg><image href="data:image/png;base64,AQID"/></svg>',{width:20,height:10},{decodeImage:()=>new Promise(done=>{resolve=done}),timeoutMs:10})
 const rejected=expect(promise).rejects.toThrow('超时');await vi.advanceTimersByTimeAsync(11);await rejected
 resolve({width:20,height:10,dispose});await Promise.resolve();await Promise.resolve();expect(dispose).toHaveBeenCalledTimes(1)
})
it.each(['error','zero','timeout','abort','success'] as const)('validates native resource Image %s and clears handlers/source',async mode=>{
 vi.useFakeTimers()
 const images:{src:string;naturalWidth:number;naturalHeight:number;onload:null|(()=>void);onerror:null|(()=>void)}[]=[]
 class ResourceImage {src='';naturalWidth=mode==='zero'?0:2;naturalHeight=2;onload:null|(()=>void)=null;onerror:null|(()=>void)=null;constructor(){images.push(this)}}
 vi.stubGlobal('Image',ResourceImage)
 const controller=new AbortController()
 try {
  const pending=prepareSvgExport('<svg><image href="data:image/png;base64,AQID"/></svg>',{width:20,height:10,signal:controller.signal},{timeoutMs:10})
  if(mode==='success') {images[0].onload?.();await pending}
  else {
   const rejected=expect(pending).rejects.toThrow(mode==='timeout'?'超时':mode==='abort'?'取消':'图片')
   if(mode==='error')images[0].onerror?.()
   if(mode==='zero')images[0].onload?.()
   if(mode==='timeout')await vi.advanceTimersByTimeAsync(11)
   if(mode==='abort')controller.abort()
   await rejected
  }
  expect(images[0].src).toBe('');expect(images[0].onload).toBeNull();expect(images[0].onerror).toBeNull()
 }finally {vi.unstubAllGlobals()}
})
