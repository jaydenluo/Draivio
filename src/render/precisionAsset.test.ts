import { describe, expect, it } from 'vitest'
import { createPixelBuffer, readNormalized } from './pixelBuffer'
import { packPrecisionAsset, unpackPrecisionAsset, validatePrecisionAsset } from './precisionAsset'

describe('original high precision resource transport', () => {
  it('stores little-endian16 samples exactly and survives JSON project transport', () => {
    const source = createPixelBuffer(2, 1, 'rgba16', [1,12345,65534,65535,257,32768,45678,12345])
    const asset = JSON.parse(JSON.stringify(packPrecisionAsset(source)))
    expect([...unpackPrecisionAsset(asset).data]).toEqual([...source.data])
    expect(atob(asset.data).charCodeAt(0)).toBe(1)
    expect(atob(asset.data).charCodeAt(1)).toBe(0)
  })
  it('preserves scene-linear values above one and negatives without byte conversion', () => {
    const source = createPixelBuffer(1, 1, 'rgba32f', [2.5,1.125,-0.25,0.5])
    expect(readNormalized(unpackPrecisionAsset(packPrecisionAsset(source)),0)).toEqual([2.5,1.125,-0.25,0.5])
  })
  it('rejects invalid lengths and nonfinite values before importing a resource', () => {
    const asset = packPrecisionAsset(createPixelBuffer(1,1,'rgba16'))
    expect(() => validatePrecisionAsset({...asset,width:2})).toThrow(/长度/)
    expect(() => validatePrecisionAsset({...asset,width:16385})).toThrow(/尺寸/)
    expect(() => packPrecisionAsset(createPixelBuffer(1,1,'rgba32f',[NaN,0,0,1]))).toThrow(/有限/)
    expect(() => validatePrecisionAsset({...asset,data:'bad'})).toThrow()
  })
})
