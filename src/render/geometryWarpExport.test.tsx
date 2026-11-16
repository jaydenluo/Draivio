import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { CanvasScene } from '../canvas/CanvasScene'
import { initialEditorState } from '../state/editor'
import { serializeExport } from './serializeExport'

it('keeps the committed warp recipe on the exported scene layer', () => {
  const state = { ...initialEditorState, layers: initialEditorState.layers.map(layer => layer.id === 'art' ? { ...layer, warpRecipe: { kind: 'radial' as const, distortion: .2 } } : layer) }
  const view = render(<CanvasScene state={state} />)
  const svg = view.container.querySelector('svg')!
  const serialized = serializeExport(svg, { range: 'canvas' })
  expect(serialized).toContain('data-warp-recipe')
  expect(serialized).toContain('distortion')
  view.unmount()
})
