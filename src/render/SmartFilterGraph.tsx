import { useId, type ReactNode } from 'react'
import { activeSmartFilters, requiresCpuSmartFilters, type SmartFilterChain } from './filterPipeline'
/** Declarative SVG backend shared by the editor and actual export, in layer-local pixels. */
export function SmartFilterGraph({ chain, width, height, children }: { chain?: SmartFilterChain; width: number; height: number; children: ReactNode }) {
 const prefix=`smart-filter-${useId().replaceAll(':','')}`
 const items=activeSmartFilters(chain)
 if(!items.length)return <>{children}</>
 if(requiresCpuSmartFilters(chain))return <g data-cpu-smart-filters={JSON.stringify(chain)} data-filter-width={width} data-filter-height={height}>{children}</g>
 let current='SourceGraphic'
 const nodes:ReactNode[]=[]
 for(const [index,f] of items.entries()){
  const n=`${prefix}-${index}`,blur=`${n}-blur`,output=`${n}-output`
  nodes.push(<feGaussianBlur key={blur} in={current} stdDeviation={f.radius} result={blur}/>)
  if(f.kind==='gaussian')current=blur
  else {
   // Arithmetic RGB is clamped at each chain boundary; alpha is restored to
   // the step input so sharpening cannot grow or erode transparency.
   if(f.kind==='highpass')nodes.push(<feComponentTransfer key={`${n}-bias`} in={current} result={`${n}-bias`}>{['R','G','B'].map(channel => channel === 'R' ? <feFuncR key={channel} type="linear" slope={f.amount/(1+f.amount)} intercept={.5/(1+f.amount)}/> : channel === 'G' ? <feFuncG key={channel} type="linear" slope={f.amount/(1+f.amount)} intercept={.5/(1+f.amount)}/> : <feFuncB key={channel} type="linear" slope={f.amount/(1+f.amount)} intercept={.5/(1+f.amount)}/>)}</feComponentTransfer>)
   nodes.push(<feComposite key={n} in={f.kind==='highpass'?`${n}-bias`:current} in2={blur} operator="arithmetic" k2={1+f.amount} k3={-f.amount} k4={0} result={`${n}-rgb`}/>,<feComponentTransfer key={`${n}-opaque`} in={`${n}-rgb`} result={`${n}-opaque`}><feFuncA type="linear" slope={0} intercept={1}/></feComponentTransfer>,<feComposite key={output} in={`${n}-opaque`} in2={current} operator="in" result={output}/>)
   current=output
  }
 }
 const mask=chain?.mask
 const rect=mask?.rect
 if(mask?.enabled&&rect){
  const coverage=`${prefix}-coverage`
  nodes.push(<feImage key="mask-image" href={`#${coverage}`} x={0} y={0} width={width} height={height} result={`${prefix}-mask-image`}/>,<feColorMatrix key="mask-alpha" in={`${prefix}-mask-image`} type="luminanceToAlpha" result={`${prefix}-mask-alpha`}/>)
  // Interpolate premultiplied contributions additively. Source-over would
  // multiply complementary antialias coverage and punch a transparency seam.
  nodes.push(<feComposite key="masked-filter" in={current} in2={`${prefix}-mask-alpha`} operator={mask.inverted?'out':'in'} result={`${prefix}-filtered`}/>,<feComposite key="masked-original" in="SourceGraphic" in2={`${prefix}-mask-alpha`} operator={mask.inverted?'in':'out'} result={`${prefix}-original`}/>,<feComposite key="interpolate" in={`${prefix}-filtered`} in2={`${prefix}-original`} operator="arithmetic" k2={1} k3={1} k4={0}/>)
 }
 return <g data-smart-filter-chain="true">
  <defs>
   {mask?.enabled&&rect?<g id={`${prefix}-coverage`}><rect width={width} height={height} fill="black"/><rect x={rect.x*width/100} y={rect.y*height/100} width={rect.width*width/100} height={rect.height*height/100} fill="white"/></g>:null}
   <filter id={prefix} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>{nodes}</filter>
  </defs>
  <g filter={`url(#${prefix})`}>{children}</g>
 </g>
}
