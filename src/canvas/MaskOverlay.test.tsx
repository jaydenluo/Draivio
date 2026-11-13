import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { MaskDefinitions, MaskOverlay } from './MaskOverlay'
import { createSelection } from './selectionGeometry'
import { createBrushStroke } from './BrushEngine'
import type { LayerMask } from './documentTypes'

test('uses a luminance mask that retains the selection, paints holes and supports gradient inversion', () => {
  const mask: LayerMask = { selection: createSelection('ellipse', { x: 20, y: 20, width: 50, height: 50 }), strokes: [createBrushStroke('mask-brush', 'mask', 'art', { x: 30, y: 40 }, { size: 20, hardness: 50, opacity: 50, flow: 80, smoothing: 0, color: '#123456' })], gradient: { from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }, inverted: true, applied: false }
  const view = render(<svg><defs>{MaskDefinitions(mask, 'test-mask')}</defs></svg>)
  expect(view.container.querySelector('#test-mask')).toHaveStyle({ maskType: 'luminance' })
  expect(view.container.querySelector('#test-mask')).toHaveAttribute('data-inverted', 'true')
  expect(view.container.querySelector('[data-mask-stroke="mask-brush"]')).toHaveAttribute('opacity', '0.4')
  expect(view.container.querySelector('[data-mask-stroke="mask-brush"] circle')).toHaveAttribute('fill', 'black')
  expect(view.container.querySelector('filter')).toHaveAttribute('filterUnits', 'userSpaceOnUse')
  expect(view.container.querySelector('linearGradient')).toHaveAttribute('gradientUnits', 'userSpaceOnUse')
  expect(view.container.querySelector('ellipse')).toBeInTheDocument()
})

test('shows an independently inverted red preview and removes it once applied', () => {
  const mask: LayerMask = { strokes: [], inverted: false, applied: false }
  const view = render(<MaskOverlay mask={mask} transform="translate(10 20)" />)
  const preview = view.container.querySelector('[aria-label="蒙版红色预览"]')!
  expect(preview).toHaveAttribute('data-editor-overlay', 'true')
  expect(preview.querySelector('[data-mask-preview-transform]')).toHaveAttribute('transform', 'translate(10 20)')
  expect(preview.querySelector('[data-mask-red]')).toHaveAttribute('fill', '#ff4d5b')
  expect(preview.querySelector('[data-mask-red]')).toHaveAttribute('mask', expect.stringContaining('url(#'))
  view.rerender(<MaskOverlay mask={{ ...mask, applied: true }} />)
  expect(view.container.firstChild).toBeNull()
})
