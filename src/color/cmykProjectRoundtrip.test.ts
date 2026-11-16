import { describe, expect, it } from 'vitest'
import { decodeProject, encodeProject } from '../document/projectFormat'

describe('CMYK project metadata', () => {
  it('round trips mode, profile and embedded ICC bytes without a second conversion', async () => {
    const state = {
      documentWidth: 1,
      documentHeight: 1,
      layers: [{ id: 'layer-1', name: '背景', type: 'image', blendMode: 'normal', source: 'data:image/png;base64,AA==' }],
      colorModel: 'rgb' as const,
      cmykProfile: { id: 'test-cmyk', name: 'Test CMYK', totalInkLimit: 3, iccBytes: new Uint8Array([1, 2, 3]) },
    }
    const restored = decodeProject(await encodeProject(state as never, { id: 'cmyk', name: 'CMYK' }))
    expect(restored.document.colorModel).toBe('rgb')
    expect(restored.document.cmykProfile?.totalInkLimit).toBe(3)
    expect(restored.document.cmykProfile?.iccBytes).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('rejects a CMYK document without a valid profile', async () => {
    await expect(encodeProject({ documentWidth: 1, documentHeight: 1, layers: [], colorModel: 'cmyk' } as never, { id: 'bad', name: 'bad' })).rejects.toThrow(/四通道/)
  })
})
