import { expect, test } from 'vitest'
import { resolveGenerationOptions, validGenerationOptions } from './generationOptions'

test('legacy connections use single request defaults and models override source options', () => {
  expect(resolveGenerationOptions({}, 'image')).toEqual({ multiImage: 'single', concurrency: 2, sendSize: true, quality: 'omit' })
  expect(resolveGenerationOptions({ generation: { multiImage: 'split' }, modelGeneration: { image: { concurrency: 1, sendSize: false } } }, 'image')).toMatchObject({ multiImage: 'split', concurrency: 1, sendSize: false })
})
test('rejects malformed persisted options', () => {
  expect(validGenerationOptions({ concurrency: 9 })).toBe(false)
  expect(validGenerationOptions({ sendSize: 'no' })).toBe(false)
  expect(validGenerationOptions({ multiImage: 'split', quality: 'omit' })).toBe(true)
})
