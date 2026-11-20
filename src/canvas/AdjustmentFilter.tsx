import type { LayerAdjustments } from '../state/editor'
import { adjustmentPipeline, gaussianAxisKernel, CLARITY_SIGMA } from '../imaging/layerAdjustments'

/** Restore original coverage after alpha-weighted convolution, avoiding transparent-edge halos. */
function Smooth({ input, result, sigma }: { input: string; result: string; sigma: number }) {
  const weights = gaussianAxisKernel(sigma), order = weights.length
  return <>
    <feConvolveMatrix in={input} order={`${order} 1`} kernelMatrix={weights.join(' ')} divisor={1} bias={0} edgeMode="none" preserveAlpha={false} kernelUnitLength="1 1" result={`${result}-horizontal`} />
    <feConvolveMatrix in={`${result}-horizontal`} order={`1 ${order}`} kernelMatrix={weights.join(' ')} divisor={1} bias={0} edgeMode="none" preserveAlpha={false} kernelUnitLength="1 1" result={`${result}-weighted`} />
    <feColorMatrix in={`${result}-weighted`} type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 0 1" result={`${result}-opaque`} />
    <feComposite in={`${result}-opaque`} in2="SourceAlpha" operator="in" result={result} />
  </>
}

export function AdjustmentFilter({ id, adjustments, width, height, compareOriginal, exportAdjustments }: { id: string; adjustments?: LayerAdjustments; width: number; height: number; compareOriginal?: boolean; exportAdjustments?: LayerAdjustments }) {
  const originalPipeline = adjustmentPipeline(adjustments)
  const pipeline = compareOriginal ? adjustmentPipeline({...adjustments!,curves:undefined,levels:undefined}) ?? {tables:[0,1,2].map(()=>Array.from({length:256},(_,i)=>i/255)),saturation:1,clarity:0,blur:0} : originalPipeline
  if (!pipeline) return null
  const exportTables = exportAdjustments ? adjustmentPipeline(exportAdjustments)?.tables ?? [0,1,2].map(()=>Array.from({length:256},(_,i)=>i/255)) : compareOriginal ? originalPipeline?.tables : undefined
  const s = pipeline.saturation, inverse = 1 - s
  const matrix = [0.2126, 0.7152, 0.0722].flatMap((_, channel) => [0.2126 * inverse + (channel === 0 ? s : 0), 0.7152 * inverse + (channel === 1 ? s : 0), 0.0722 * inverse + (channel === 2 ? s : 0), 0, 0]).concat([0, 0, 0, 1, 0])
  // Kernel support extends at most eighteen composed document pixels. Final scene clips to document.
  const padding = 24
  return <filter id={id} data-adjustment-filter="true" data-adjustments={JSON.stringify(compareOriginal ? {...adjustments,curves:undefined,levels:undefined} : adjustments)} data-export-adjustments={exportAdjustments ? JSON.stringify(exportAdjustments) : compareOriginal ? JSON.stringify(adjustments) : undefined} data-hsl={adjustments?.hsl ? JSON.stringify(adjustments.hsl) : undefined} data-color-balance={adjustments?.colorBalance ? JSON.stringify(adjustments.colorBalance) : undefined} colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x={-padding} y={-padding} width={width + padding * 2} height={height + padding * 2}>
    <feComponentTransfer in="SourceGraphic" result="transfer">
      <feFuncR type="table" data-export-table={exportTables?.[0].join(' ')} tableValues={pipeline.tables[0].join(' ')} />
      <feFuncG type="table" data-export-table={exportTables?.[1].join(' ')} tableValues={pipeline.tables[1].join(' ')} />
      <feFuncB type="table" data-export-table={exportTables?.[2].join(' ')} tableValues={pipeline.tables[2].join(' ')} />
      <feFuncA type="identity" />
    </feComponentTransfer>
    <feColorMatrix in="transfer" type="matrix" values={matrix.join(' ')} result="saturated" />
    {pipeline.clarity ? <>
      <Smooth input="saturated" result="clarity-low" sigma={CLARITY_SIGMA} />
      <feComposite in="saturated" in2="clarity-low" operator="arithmetic" k1={0} k2={1 + pipeline.clarity} k3={-pipeline.clarity} k4={0} result="clarity" />
    </> : null}
    {pipeline.blur ? <Smooth input={pipeline.clarity ? 'clarity' : 'saturated'} result="blurred" sigma={pipeline.blur} /> : null}
  </filter>
}
