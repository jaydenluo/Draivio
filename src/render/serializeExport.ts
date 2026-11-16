import { renderToStaticMarkup } from 'react-dom/server'
import { serializeEditorSvg } from '../canvas/documentIO'
import { MaskDefinitions } from '../canvas/MaskOverlay'
import type { Selection, SelectionRect } from '../canvas/selectionGeometry'

export type ExportRange = 'canvas' | 'selection' | 'layer'
export function serializeExport(svg: SVGSVGElement, options: { range: ExportRange; selectedLayerId?: string; selection?: Selection; cropRect?: SelectionRect | null }): string {
  if (options.range === 'selection' && !options.selection) throw new Error('没有可导出的选区')
  const source = serializeEditorSvg(svg, options.range === 'selection' ? options.selection!.rect : options.cropRect)
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement
  for (const node of root.querySelectorAll('[data-export-table]')) {node.setAttribute('tableValues',node.getAttribute('data-export-table')!);node.removeAttribute('data-export-table')}
  for (const node of root.querySelectorAll('[data-export-adjustments]')) { node.setAttribute('data-adjustments', node.getAttribute('data-export-adjustments')!); node.removeAttribute('data-export-adjustments') }
  if (options.range === 'layer') {
    const layers = [...root.querySelectorAll('.scene-layer[data-layer-id]')]
    const selected = layers.find(layer => layer.getAttribute('data-layer-id') === options.selectedLayerId)
    if (!selected) throw new Error('当前图层不可见或没有可导出的内容')
    const tonalComposite = selected.closest('[data-tonal-layer]')
    for (const layer of layers) if (layer !== selected && !layer.contains(selected) && !selected.contains(layer) && !tonalComposite?.contains(layer)) layer.remove()
    // CanvasScene owns a direct root background rect; it is not part of any layer.
    for (const node of [...root.children]) if (node.localName === 'rect') node.remove()
  }
  if (options.range === 'selection') {
    const { width, height } = svg.viewBox.baseVal
    const markup = renderToStaticMarkup(MaskDefinitions({ selection: options.selection, strokes: [], inverted: false, applied: true }, 'export-selection', width, height))
    const defsDoc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><defs>${markup}</defs></svg>`, 'image/svg+xml')
    const content = doc.createElementNS('http://www.w3.org/2000/svg', 'g')
    content.setAttribute('mask', 'url(#export-selection)')
    while (root.firstChild) content.append(root.firstChild)
    root.append(doc.importNode(defsDoc.documentElement.firstChild!, true), content)
  }
  return new XMLSerializer().serializeToString(root)
}
