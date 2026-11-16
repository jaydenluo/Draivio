import { describe, expect, it } from 'vitest'
import { applyDevelopSettings, cacheKey, detectRawFormat, validateRawBytes, validateDevelopSettings, RAW_SUPPORT_MATRIX, fromRawSourceRecord, toRawSourceRecord, validateRawSourceRecord } from './rawPipeline'
describe('RAW capability and non-destructive develop contract', () => {
  it('detects extensions and exposes honest unsupported matrix', () => { expect(detectRawFormat('camera.NEF')).toBe('nef'); expect(RAW_SUPPORT_MATRIX.nef.decode).toBe(true); expect(RAW_SUPPORT_MATRIX.cr3.decode).toBe(false) })
  it('rejects JPEG disguised as RAW, unknown and corrupt bytes', () => { expect(() => validateRawBytes('nef', new Uint8Array([0xff,0xd8,...new Array(20).fill(0)]))).toThrow(/JPEG/); expect(() => validateRawBytes('unknown', new Uint8Array(32))).toThrow(/不支持/) })
  it('validates settings, builds stable cache key and applies exposure/WB without mutation', () => { const s={exposureEV:1,whiteBalance:{r:1,g:2,b:1},highlightRecovery:.2}; expect(validateDevelopSettings(s)).toEqual(s); expect(cacheKey('abc',s,2,2)).toContain('abc:2x2'); const src=new Uint8ClampedArray([100,100,100,255]); expect([...applyDevelopSettings(src,s)]).not.toEqual([...src]); expect(src[0]).toBe(100); expect(() => validateDevelopSettings({...s,exposureEV:99})).toThrow() })
  it('cancels bounded development without committing partial output', () => { const controller=new AbortController(); controller.abort(); expect(() => applyDevelopSettings(new Uint8ClampedArray([10,20,30,255]),{exposureEV:0,whiteBalance:{r:1,g:1,b:1},highlightRecovery:0},controller.signal)).toThrow(/取消/) })
  it('round trips original bytes and rejects malformed persisted records', () => {
    const source = { bytes: Uint8Array.from([1, 2, 3, 4]), metadata: { format: 'nef' as const, orientation: 6 as const, width: 2, height: 2, make: 'Fixture', model: 'Camera' }, settings: { exposureEV: 1, whiteBalance: { r: 1, g: 2, b: 1 }, highlightRecovery: .2 }, checksum: 'abcdef12' }
    const record = toRawSourceRecord(source)
    expect(record.bytes).toEqual([1, 2, 3, 4])
    expect(Array.from(fromRawSourceRecord(record).bytes)).toEqual([1, 2, 3, 4])
    expect(() => validateRawSourceRecord({ ...record, bytes: [256] })).toThrow(/字节/)
    expect(() => validateRawSourceRecord({ ...record, checksum: 'bad' })).toThrow(/校验和/)
  })
})
