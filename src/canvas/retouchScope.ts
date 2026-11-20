import type { Layer } from '../state/editor'
import { effectiveLayerState, layerParentId } from '../state/layerHierarchy'
import { resolveSampleScope, type SampleScope } from '../retouch/cloneHeal'

/** Retains ancestor transforms, but only paints content belonging to sampled layers. */
export function retouchScopeSvg(source: SVGSVGElement, layers: Layer[], selectedId: string, scope: SampleScope, sourceIds?: readonly string[], preserveAppearance = false): SVGSVGElement {
  const svg = source.cloneNode(true) as SVGSVGElement
  const allowed = new Set(sourceIds ?? resolveSampleScope(layers.map(layer => ({ id: layer.id, ...effectiveLayerState(layers, layer.id) })), selectedId, scope))
  const hasAllowed = (element: Element) => Array.from(element.querySelectorAll('[data-layer-id]')).some(child =>
    (!preserveAppearance || !child.closest('[data-smart-source]')) && allowed.has(child.getAttribute('data-layer-id')!)
  )
  const visit = (element: Element, inherited = true) => {
    const id = element.getAttribute('data-layer-id')
    const own = id ? allowed.has(id) : inherited
    // Smart object sources have their own layer IDs and belong to the host layer as a whole.
    if (preserveAppearance && element.hasAttribute('data-smart-source')) {
      if (!own) element.remove()
      return
    }
    if (!own && !hasAllowed(element) && element.tagName.toLowerCase() !== 'defs') { element.remove(); return }
    for (const child of Array.from(element.children)) visit(child, own)
  }
  for (const child of Array.from(svg.children)) visit(child)
  // The result is inserted beside the target: ancestor paint styles are applied there once.
  // Keep ancestor geometry for document-space sampling, but sample its local RGBA.
  const visited = new Set<string>(); let parentId = preserveAppearance ? undefined : retouchParentId(layers, selectedId, scope)
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId)
    const ancestor = Array.from(svg.querySelectorAll<SVGElement>('[data-layer-id]')).find(node => node.getAttribute('data-layer-id') === parentId)
    if (ancestor) { ancestor.setAttribute('opacity', '1'); ancestor.style.filter = 'none'; ancestor.style.mixBlendMode = 'normal' }
    parentId = layerParentId(layers, parentId)
  }
  svg.querySelectorAll('[data-repair-id]').forEach(node => { if ((!preserveAppearance || !node.closest('[data-smart-source]')) && !allowed.has(node.getAttribute('data-repair-id')!)) node.remove() })
  svg.querySelectorAll('[data-mask-preview]').forEach(node => node.remove())
  return svg
}

/** The deepest shared compositing parent of sampled content. */
export function retouchParentId(layers: Layer[], selectedId: string, scope: SampleScope): string | undefined {
  const ids = resolveSampleScope(layers.map(layer => ({ id: layer.id, ...effectiveLayerState(layers, layer.id) })), selectedId, scope)
  const parents = (id: string) => { const result: string[] = []; const seen = new Set<string>(); let parent = layerParentId(layers, id); while (parent && !seen.has(parent)) { result.push(parent); seen.add(parent); parent = layerParentId(layers, parent) } return result }
  const chains = ids.map(parents)
  return chains[0]?.find(parent => chains.every(chain => chain.includes(parent)))
}
