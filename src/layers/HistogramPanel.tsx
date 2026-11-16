import { useMemo } from 'react'
import { clippingWarning, histogramRGBA, type HistogramOptions } from '../adjustments/histogram'
export function HistogramPanel({ pixels, width, height, options = {}, revision = 0 }: { pixels: Uint8ClampedArray; width: number; height: number; options?: HistogramOptions; revision?: number }) {
 const histogram = useMemo(() => histogramRGBA(pixels, width, height, options), [pixels, width, height, options, revision])
 const warning = clippingWarning(histogram)
 return <section aria-label="直方图" data-revision={revision}><div className="histogram-summary">样本 {histogram.samples} · 透明 {histogram.alpha[0]}{warning.message ? <span role="status">{warning.message}</span> : null}</div><div className="histogram-bars" aria-hidden="true">{histogram.luma.map((value, index) => <i key={index} style={{ height: `${Math.min(100, value)}%` }} />)}</div><div className="histogram-rgb" aria-label="RGB 通道直方图" data-export-hidden="true">{(['red','green','blue'] as const).map(channel => <span key={channel} data-channel={channel}>{histogram[channel].reduce((a,b)=>a+b,0)}</span>)}</div>{warning.message ? <div aria-label="剪裁预览提示" data-export-hidden="true" className="histogram-clipping-overlay">{warning.message}</div> : null}</section>
}
