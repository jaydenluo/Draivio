/** Select one layer/subtree from the shared canvas scene without deleting its ancestors.
 * Visual output keeps ancestor compositing; raster sources exclude ancestor effects and
 * neutralize the selected layer's opacity/blend/filter, which remain in document state.
 * Its own transform and applied mask are baked, matching rasterize-layer's reset policy.
 */
export function extractLayerScene(svg: SVGSVGElement, layerId: string, options: { mode?: 'visual' | 'raster-source'; previewIds?: string[] } = {}): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  // React's HTML-created xmlns attribute lacks the XMLNS namespace; normalize it
  // before XMLSerializer so standalone SVGs do not contain duplicate declarations.
  clone.removeAttribute('xmlns')
  clone.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
  clone.querySelectorAll('[data-editor-overlay], [data-mask-preview], .mask-preview').forEach((node) => node.remove())
  for (const id of options.previewIds ?? []) clone.querySelectorAll('[data-stroke], [data-shape]').forEach((node) => {
    if (node.getAttribute('data-stroke') === id || node.getAttribute('data-shape') === id) node.remove()
  })
  const selected = [...clone.querySelectorAll<SVGGElement>('[data-layer-id]')].find((node) => node.getAttribute('data-layer-id') === layerId)
  if (!selected) { clone.replaceChildren(); return clone }
  if (options.mode === 'raster-source') {
    // Retain shared SVG definitions without copying unrelated rendered content.
    const sharedDefinitions = [...clone.querySelectorAll('defs')].filter((node) => !selected.contains(node) && !node.parentElement?.closest('defs')).map((node) => node.cloneNode(true))
    selected.setAttribute('opacity', '1')
    selected.style.removeProperty('filter')
    selected.removeAttribute('filter')
    selected.style.mixBlendMode = 'normal'
    clone.replaceChildren(...sharedDefinitions, selected)
  } else {
    const ancestors = new Set<Element>()
    let parent: Element | null = selected.parentElement
    while (parent && parent !== clone) { ancestors.add(parent); parent = parent.parentElement }
    const prune = (node: Element) => {
      for (const child of [...node.children]) {
        if (child === selected || child.tagName.toLowerCase() === 'defs') continue
        if (ancestors.has(child)) prune(child)
        else child.remove()
      }
    }
    prune(clone)
  }
  return clone
}
