import { applySmartFilters, validateSmartFilters, type FilterRenderOptions } from './filterPipeline'
export type FilterMaterializeDependencies={decodeSvg:(source:string)=>Promise<{image:CanvasImageSource;width:number;height:number}>;createCanvas:()=>HTMLCanvasElement}
/** Shared awaited pixel path for editor preview and export. Derived PNGs never replace document sources. */
export async function materializeSmartFilters(source:string,deps:FilterMaterializeDependencies,options:FilterRenderOptions={}):Promise<string>{
 const doc=new DOMParser().parseFromString(source,'image/svg+xml'),root=doc.documentElement
 for(const marker of [...root.querySelectorAll('[data-cpu-smart-filters]')].reverse()){
  if(options.signal?.aborted)throw new Error('智能滤镜渲染已取消')
  const chain=validateSmartFilters(JSON.parse(marker.getAttribute('data-cpu-smart-filters')!)),w=Math.ceil(Number(marker.getAttribute('data-filter-width'))),h=Math.ceil(Number(marker.getAttribute('data-filter-height')))
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>16_777_216)throw new Error('CPU 智能滤镜最多支持 1600 万像素，请缩小图层后重试')
  const isolated=doc.createElementNS('http://www.w3.org/2000/svg','svg');isolated.setAttribute('xmlns','http://www.w3.org/2000/svg');isolated.setAttribute('viewBox',`0 0 ${w} ${h}`);isolated.setAttribute('width',String(w));isolated.setAttribute('height',String(h))
  // Keep referenced definitions, excluding ancestor definition copies containing
  // this same marker, which could recurse through a nested filter source.
  for(const defs of root.querySelectorAll('defs'))if(!defs.contains(marker))isolated.append(defs.cloneNode(true))
  const art=marker.cloneNode(true) as Element;art.removeAttribute('data-cpu-smart-filters');isolated.append(art)
  const decoded=await deps.decodeSvg(new XMLSerializer().serializeToString(isolated)),canvas=deps.createCanvas();canvas.width=w;canvas.height=h
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境不支持 CPU 智能滤镜')
  ctx.drawImage(decoded.image,0,0,w,h);const image=ctx.getImageData(0,0,w,h),filtered=await applySmartFilters(new Uint8ClampedArray(image.data),w,h,chain,options);image.data.set(filtered);ctx.putImageData(image,0,0)
  if(options.signal?.aborted)throw new Error('智能滤镜渲染已取消')
  const replacement=doc.createElementNS('http://www.w3.org/2000/svg','image');replacement.setAttribute('width',String(w));replacement.setAttribute('height',String(h));replacement.setAttribute('href',canvas.toDataURL('image/png'));marker.replaceWith(replacement)
 }
 return new XMLSerializer().serializeToString(root)
}
