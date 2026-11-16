import { describe, expect, it } from 'vitest'
import { shouldRenderWindowControls } from './WindowControls'

describe('shouldRenderWindowControls', () => {
  it('uses native macOS traffic lights instead of app controls', () => {
    expect(shouldRenderWindowControls(true, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)')).toBe(false)
  })

  it('uses app-drawn controls for Windows desktop builds', () => {
    expect(shouldRenderWindowControls(true, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(true)
  })

  it('does not render desktop controls in the browser preview', () => {
    expect(shouldRenderWindowControls(false, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })
})
