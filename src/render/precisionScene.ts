import type { EditorState, Layer } from '../state/editor'
import { effectiveLayerState, layerParentId } from '../state/layerHierarchy'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { invertMatrix, multiplyPoint } from '../canvas/layerCoordinates'
import { rasterizeSelectionMask } from '../canvas/selectionRaster'
import { resolveBlendMode } from './blendModes'
import { toLinearPrecision } from './precisionAsset'
import { createPixelBuffer, enforceBudget, readNormalized, writeNormalized, type PixelBuffer } from './pixelBuffer'
import { compositePrecision } from './precisionPipeline'
import { adjustmentPipeline } from '../imaging/layerAdjustments'

/** Explicit scene-linear backend for original bitmap layers. Unsupported content
 * fails before export; display PNGs are never substituted for original samples. */
export async function renderPrecisionScene(state: EditorState, options:{signal?:AbortSignal;maxBytes?:number}={}):Promise<PixelBuffer> {
  const width=state.documentWidth,height=state.documentHeight,maxBytes=options.maxBytes??512*1024*1024
  const abort=()=>{if(options.signal?.aborted)throw new DOMException('高精度画布导出已取消','AbortError')};abort()
  const visible=state.layers.filter(l=>effectiveLayerState(state.layers,l.id).visible)
  if(!visible.some(l=>l.highPrecision))throw new Error('画布没有高精度原始资源')
  const visibleIds=new Set(visible.map(l=>l.id))
  const attached=[...state.canvasShapes.filter(s=>!s.hidden),...state.canvasTexts,...state.brushStrokes]
  if(attached.some(item=>visibleIds.has(item.layerId)))throw new Error('高精度画布暂不支持附加矢量、文字或画笔内容；不会静默忽略')
  const modes=new Map<string,'normal'|'multiply'|'screen'>()
  let maxDepth=1
  for(const layer of visible) {
    const mode=resolveBlendMode(layer.blendMode)
    if(!['normal','multiply','screen'].includes(mode))throw new Error(`高精度画布尚不支持混合模式“${layer.blendMode}”，请保留源文档或显式导出显示副本`)
    modes.set(layer.id,mode as 'normal'|'multiply'|'screen')
    if(layer.kind!=='group'&&!layer.highPrecision)throw new Error(`图层“${layer.name}”缺少高精度原始资源；不会使用8位预览代替`)
    if(layer.smartObject||layer.smartFilters?.items.some(f=>f.enabled)||layer.effects?.items.some(e=>e.enabled)||layer.clipBaseId||layer.maskedCompositeSourceIds||layer.repairSourceIds)throw new Error(`图层“${layer.name}”包含高精度画布尚不支持的效果或合成链`)
    const mask=state.layerMasks[layer.id]
    if(mask?.applied&&mask.selection)enforceBudget(Math.ceil(layer.contentWidth??width),Math.ceil(layer.contentHeight??height),'rgba8',maxBytes/4)
    if(mask?.applied&&(mask.strokes.length||mask.gradient||mask.refinement))throw new Error('高精度画布暂不支持画笔/渐变/精修蒙版，请保留原始资源')
    if(adjustmentPipeline(layer.adjustments))throw new Error('高精度画布不能使用8位调整参数；请先在高精度资源面板应用处理')
    let depth=1,parent=layerParentId(state.layers,layer.id);const seen=new Set([layer.id])
    while(parent){if(seen.has(parent))throw new Error('图层层级循环');seen.add(parent);depth++;parent=layerParentId(state.layers,parent)}
    maxDepth=Math.max(maxDepth,depth)
  }
  // Group accumulators, per-layer raster and composite output coexist.
  const maskBytes=visible.reduce((n,l)=>n+(state.layerMasks[l.id]?.applied&&state.layerMasks[l.id]?.selection?Math.ceil(l.contentWidth??width)*Math.ceil(l.contentHeight??height)*3:0),0)
  const peakBytes=maskBytes+width*height*16*(maxDepth+3)+visible.reduce((n,l)=>n+(l.highPrecision?l.highPrecision.width*l.highPrecision.height*4*(l.highPrecision.format==='rgba16'?2:4)*16:0),0)
  if(peakBytes>maxBytes)throw new Error(`高精度画布所需缓冲估算 ${Math.ceil(peakBytes/1048576)} MiB，超出预算；原始资源保留`)
  enforceBudget(width,height,'rgba32f',maxBytes)
  const blank=()=>createPixelBuffer(width,height,'rgba32f')
  const rasterize=async(layer:Layer)=>{
    const source=toLinearPrecision(layer.highPrecision!),out=blank(),inverse=invertMatrix(layerWorldPixelMatrix(state.layers,layer.id,width,height))
    const cw=layer.contentWidth??width,ch=layer.contentHeight??height
    const scale=Math.min(cw/source.width,ch/source.height),offsetX=(cw-source.width*scale)/2,offsetY=(ch-source.height*scale)/2
    const mask=state.layerMasks[layer.id], mw=Math.ceil(cw), mh=Math.ceil(ch)
    const maskPixels=mask?.applied&&mask.selection?rasterizeSelectionMask(mask.selection,mw,mh):undefined
    for(let y=0;y<height;y++) {
      abort()
      for(let x=0;x<width;x++) {
        const local=multiplyPoint(inverse,{x:x+.5,y:y+.5}),sx=(local.x-offsetX)/scale,sy=(local.y-offsetY)/scale
        if(sx<0||sy<0||sx>=source.width||sy>=source.height)continue
        // Sample source pixel centers with premultiplied bilinear interpolation.
        const fx=sx-.5,fy=sy-.5,left=Math.floor(fx),top=Math.floor(fy),rgba=[0,0,0,0]
        for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
          const px=Math.max(0,Math.min(source.width-1,left+dx)),py=Math.max(0,Math.min(source.height-1,top+dy))
          const weight=(dx?fx-left:1-fx+left)*(dy?fy-top:1-fy+top),sample=readNormalized(source,py*source.width+px),a=Math.max(0,Math.min(1,sample[3]))
          for(let c=0;c<3;c++)rgba[c]+=sample[c]*a*weight
          rgba[3]+=a*weight
        }
        if(rgba[3])for(let c=0;c<3;c++)rgba[c]/=rgba[3]
        if(mask?.applied&&mask.selection){const mx=Math.max(0,Math.min(mw-1,Math.floor(local.x/cw*mw))),my=Math.max(0,Math.min(mh-1,Math.floor(local.y/ch*mh))),a=maskPixels![my*mw+mx]/255;rgba[3]*=mask.inverted?1-a:a}
        writeNormalized(out,y*width+x,rgba)
      }
      if((y+1)%32===0)await new Promise<void>(resolve=>setTimeout(resolve,0))
    }
    return out
  }
  const renderChildren=async(parent?:string):Promise<PixelBuffer>=>{
    let output=blank()
    const children=visible.filter(l=>layerParentId(state.layers,l.id)===parent)
    for(const layer of [...children].reverse()){
      abort()
      const pixels=layer.kind==='group'?await renderChildren(layer.id):await rasterize(layer)
      if(layer.kind==='group'&&state.layerMasks[layer.id]?.applied)throw new Error('高精度画布暂不支持组蒙版')
      output=compositePrecision(output,pixels,modes.get(layer.id),layer.opacity/100)
    }
    return output
  }
  const result=await renderChildren()
  if(state.documentBackground!=='transparent') {
    if(!/^#[0-9a-f]{6}$/i.test(state.documentBackground))throw new Error('高精度画布背景颜色无效')
    const rgb=[1,3,5].map(i=>parseInt(state.documentBackground.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),base=blank()
    for(let i=0;i<width*height;i++)writeNormalized(base,i,[...rgb,1])
    abort();return compositePrecision(base,result)
  }
  abort();return result
}
