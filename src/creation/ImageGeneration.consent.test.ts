import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestUploadConsent } from './ImageGeneration'

describe('image upload consent', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('allows generation without an upload prompt', () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    expect(requestUploadConsent('generate', 'provider')).toBe(true)
    expect(confirm).not.toHaveBeenCalled()
  })
  it('returns the user decision for edit uploads', () => {
    const confirm = vi.fn(() => false)
    vi.stubGlobal('window', { confirm })
    expect(requestUploadConsent('edit', 'provider')).toBe(false)
    expect(confirm).toHaveBeenCalledTimes(1)
  })
})
