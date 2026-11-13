import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { BrushScene } from './BrushScene'
import { createBrushStroke } from './BrushEngine'

test('renders layer-scoped eraser masks and preserves stroke opacity', () => {
  const settings = { size: 20, color: '#ff765f', hardness: 80, opacity: 50, flow: 80, smoothing: 0 }
  const strokes = [createBrushStroke('paint', 'paint', 'art', { x: 20, y: 20 }, settings), createBrushStroke('erase', 'erase', 'art', { x: 20, y: 20 }, settings)]
  const view = render(<svg><BrushScene strokes={strokes} /></svg>)
  expect(view.container.querySelector('mask[data-eraser="erase"]')).toBeInTheDocument()
  expect(view.container.querySelector('[data-stroke="paint"]')).toHaveAttribute('opacity', '0.4')
  expect(view.container.querySelector('[data-layer="art"]')).toBeInTheDocument()
})

test.each(['paint', 'erase'] as const)('soft %s strokes have a nonzero filter region for horizontal and vertical paths', (mode) => {
  const settings = { size: 20, color: '#ff765f', hardness: 50, opacity: 100, flow: 100, smoothing: 0 }
  const strokes = [
    { ...createBrushStroke('horizontal', mode, 'art', { x: 20, y: 20 }, settings), points: [{ x: 20, y: 20 }, { x: 60, y: 20 }] },
    { ...createBrushStroke('vertical', mode, 'art', { x: 20, y: 20 }, settings), points: [{ x: 20, y: 20 }, { x: 20, y: 60 }] },
  ]
  const view = render(<svg><BrushScene strokes={strokes} /></svg>)
  for (const stroke of strokes) {
    const filter = view.container.querySelector(`[data-stroke="${stroke.id}"] filter`)!
    expect(filter).toHaveAttribute('filterUnits', 'userSpaceOnUse')
    expect(Number(filter.getAttribute('x'))).toBeLessThanOrEqual(90)
    expect(Number(filter.getAttribute('y'))).toBeLessThanOrEqual(115)
    expect(Number(filter.getAttribute('width'))).toBeGreaterThan(20)
    expect(Number(filter.getAttribute('height'))).toBeGreaterThan(20)
  }
})

test('an eraser affects earlier content and leaves later objects intact', () => {
  const erase = createBrushStroke('erase', 'erase', 'art', { x: 20, y: 20 }, { size: 20, color: '#000000', hardness: 100, opacity: 100, flow: 100, smoothing: 0 })
  const view = render(<svg><BrushScene strokes={[erase]} baseByLayer={{ art: <rect data-base="true" width="500" height="625" /> }} objectsByLayer={{ art: [{ id: 'after', node: <text data-after="true">later</text> }] }} order={['erase', 'after']} /></svg>)
  const erasedContent = view.container.querySelector('mask[data-eraser="erase"]')!.parentElement!.nextElementSibling!
  expect(erasedContent.querySelector('[data-base]')).toBeInTheDocument()
  expect(erasedContent.querySelector('[data-after]')).toBeNull()
  expect(view.container.querySelector('[data-after]')).toBeInTheDocument()
})
