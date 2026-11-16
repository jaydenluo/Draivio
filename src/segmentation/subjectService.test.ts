import { describe, expect, it, vi } from 'vitest'
import { createSubjectAdapter, mapMaskToDocument, maskToSelection, SubjectServiceError, validateSubjectResponse } from './subjectService'

const circle = (w: number, h: number) => { const mask = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x - w / 2) ** 2 + (y - h / 2) ** 2 < (w / 3) ** 2) mask[y * w + x] = 255; return mask }
describe('subject service contract', () => {
  it.each(['portrait', 'product', 'multi-subject'])('accepts non-rectangular %s masks and maps without edge drift', () => {
    const response = validateSubjectResponse({ width: 4, height: 4, mask: circle(4, 4) }); const mapped = mapMaskToDocument(response, 8, 8)
    expect(mapped.some(v => v === 0)).toBe(true); expect(mapped.some(v => v === 255)).toBe(true); expect(maskToSelection(mapped, 8, 8)).toMatchObject({ width: expect.any(Number) })
  })
  it('rejects malformed masks', () => expect(() => validateSubjectResponse({ width: 2, height: 2, mask: new Uint8Array([1]) })).toThrow(SubjectServiceError))
  it('normalizes auth, size, cancellation and network failures', async () => {
    const auth = createSubjectAdapter(vi.fn(async () => new Response('', { status: 401 })), '/subject'); await expect(auth({ image: 'x', width: 1, height: 1 })).rejects.toMatchObject({ code: 'unauthorized' })
    const cancel = createSubjectAdapter(vi.fn(async () => { throw new DOMException('cancel', 'AbortError') }), '/subject'); await expect(cancel({ image: 'x', width: 1, height: 1 })).rejects.toMatchObject({ code: 'cancelled' })
  })
})
