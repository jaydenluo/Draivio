import { renderToStaticMarkup } from 'react-dom/server'
import { MaskDefinitions } from './MaskOverlay'
import { extractLayerScene } from './layerExtraction'
import type { Selection, SelectionRect } from './selectionGeometry'
export type ExportRange = 'canvas' | 'selection' | 'layer'

/** Keep mask/transform coordinates in the original document; crop only the output viewport. */
function exportRect(range:ExportRange,selection?:Selection,cropRect?:SelectionRect|null):SelectionRect {
  const crop=cropRect??{x:0,y:0,width:100,height:100}
  const selected=range==='selection'?selection?.rect:undefined
  if (!selected) return crop
  const x=Math.max(crop.x,selected.x),y=Math.max(crop.y,selected.y)
  return {x,y,width:Math.max(0,Math.min(crop.x+crop.width,selected.x+selected.width)-x),height:Math.max(0,Math.min(crop.y+crop.height,selected.y+selected.height)-y)}
}
export function exportRangeDimensions(width:number,height:number,range:ExportRange,selection?:Selection,cropRect?:SelectionRect|null) {
  const rect=exportRect(range,selection,cropRect)
  return {width:rect.width>0?Math.max(1,Math.round(width*rect.width/100)):0,height:rect.height>0?Math.max(1,Math.round(height*rect.height/100)):0}
}

export function serializeExportScene(svg: SVGSVGElement, options: {range:ExportRange;selection?:Selection;layerId?:string;cropRect?:SelectionRect|null}):string {
  if (options.range==='selection' && (!options.selection || options.selection.rect.width<=0 || options.selection.rect.height<=0)) throw new Error('没有可导出的选区')
  if (options.range==='layer') {
    const target=[...svg.querySelectorAll('[data-layer-id]')].find(node=>node.getAttribute('data-layer-id')===options.layerId)
    let hidden = !target
    for (let node: Element | null = target ?? null; node && node !== svg; node = node.parentElement) {
      const style = (node as SVGElement).style
      if (node.getAttribute('display') === 'none' || node.getAttribute('visibility') === 'hidden' || style.display === 'none' || style.visibility === 'hidden') hidden = true
    }
    if (hidden) throw new Error('当前图层不存在或已隐藏，无法导出')
  }
  const clone=options.range==='layer'?extractLayerScene(svg,options.layerId!):svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-editor-overlay], [data-mask-preview], .selection-geometry, .selection-overlay, .transform-overlay, .transform-actions, .mask-preview').forEach(node=>node.remove())
  clone.removeAttribute('xmlns'); clone.setAttributeNS('http://www.w3.org/2000/xmlns/','xmlns','http://www.w3.org/2000/svg')
  clone.removeAttribute('class'); clone.removeAttribute('style'); clone.removeAttribute('role'); clone.removeAttribute('aria-label')
  const [x=0,y=0,width=0,height=0]=(svg.getAttribute('viewBox')??'').trim().split(/[ ,]+/).map(Number)
  if (!(width>0&&height>0)) throw new Error('画布尺寸无效')
  const selection=options.range==='selection'?options.selection:undefined
  const rect=exportRect(options.range,selection,options.cropRect)
  if (rect.width<=0||rect.height<=0) throw new Error('选区与可见画布没有交集，无法导出')
  if (selection) {
    // Reuse exactly the layer mask implementation, including boolean paths and feather pixels.
    const id='draivio-export-selection'
    const definitions=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg"><defs>{MaskDefinitions({selection,strokes:[],inverted:false,applied:true},id,width,height)}</defs></svg>)
    const parsed=new DOMParser().parseFromString(definitions,'image/svg+xml')
    const defs=document.importNode(parsed.querySelector('defs')!,true)
    const group=document.createElementNS('http://www.w3.org/2000/svg','g')
    group.setAttribute('data-export-selection','true'); group.setAttribute('mask',`url(#${id})`)
    for (const child of [...clone.childNodes]) {
      if (child instanceof Element && child.localName==='defs') continue
      group.append(child)
    }
    clone.append(defs,group)
  }
  clone.setAttribute('viewBox',`${x+rect.x*width/100} ${y+rect.y*height/100} ${rect.width*width/100} ${rect.height*height/100}`)
  const dimensions=exportRangeDimensions(width,height,options.range,selection,options.cropRect)
  clone.setAttribute('width',String(dimensions.width)); clone.setAttribute('height',String(dimensions.height))
  return new XMLSerializer().serializeToString(clone)
}
