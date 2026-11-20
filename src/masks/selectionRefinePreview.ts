import { rasterizeSvgPixels, type PixelImage } from '../canvas/rasterTools'
import type { Selection } from '../canvas/selectionGeometry'
import { runFullResolution, selectionToAlpha, type RefinementJob } from './refineAsync'
import { decontaminateFringe, refineMaskAlpha, type RefineMaskParameters } from './refineMask'

export type RefinePreview = { alpha: Uint8Array; width: number; height: number; rgba?: Uint8ClampedArray }

export function previewDimensions(width: number, height: number, cap: number) {
  const scale = Math.min(1, cap / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale }
}

export const selectionRefineParameters = (selection: Selection, params: RefineMaskParameters, scale = 1): RefineMaskParameters => ({
  ...params, feather: selection.feather * scale, shift: (params.shift ?? 0) * scale, smooth: (params.smooth ?? 0) * scale,
})

export async function renderRefinePreview(selection: Selection, width: number, height: number, params: RefineMaskParameters, cap: number, job: RefinementJob, readSource?: (width: number, height: number) => Promise<PixelImage>): Promise<RefinePreview | null> {
  const dimensions = previewDimensions(width, height, cap)
  const input = selectionToAlpha(selection, dimensions.width, dimensions.height)
  const localParams = selectionRefineParameters(selection, params, dimensions.scale)
  const alpha = cap <= 256 ? refineMaskAlpha(input, dimensions.width, dimensions.height, localParams)
    : await runFullResolution(input, dimensions.width, dimensions.height, localParams, job)
  if (!alpha || job.cancelled) return null
  let rgba: Uint8ClampedArray | undefined
  if (readSource && params.colorCorrection && params.decontaminate) {
    try {
      const source = await readSource(dimensions.width, dimensions.height)
      if (source.width === dimensions.width && source.height === dimensions.height) {
        rgba = decontaminateFringe(source.data, alpha, dimensions.width, dimensions.height, params.decontaminate, true)
      }
    } catch (error) {
      if (!job.cancelled) throw error
    }
  }
  return job.cancelled ? null : { alpha, width: dimensions.width, height: dimensions.height, rgba }
}

export function rasterizeRefineLayer(svg: SVGSVGElement, width: number, height: number, signal: AbortSignal) {
  const size = svg.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)
  const scale = size?.length === 4 ? `scale(${width / size[2]} ${height / size[3]})` : ''
  const group = svg.ownerDocument.createElementNS(svg.namespaceURI, 'g')
  group.setAttribute('transform', scale)
  group.append(...svg.childNodes)
  svg.append(group)
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  return rasterizeSvgPixels(svg, signal)
}
