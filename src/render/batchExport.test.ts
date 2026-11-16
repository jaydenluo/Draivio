import { expect, it, vi } from 'vitest'
import { exportBatch } from './batchExport'

it('exports independent items with bounded concurrency and reports partial failures', async () => {
  let active = 0, peak = 0
  const result = await exportBatch([{ id: 'a' }, { id: 'b' }, { id: 'c' }], async item => {
    active++; peak = Math.max(peak, active); await Promise.resolve(); active--; if (item.id === 'b') throw new Error('bad'); return item.id
  }, 2)
  expect(peak).toBeLessThanOrEqual(2)
  expect(result).toEqual([{ id: 'a', status: 'succeeded', value: 'a' }, { id: 'b', status: 'failed', error: 'bad' }, { id: 'c', status: 'succeeded', value: 'c' }])
})

it('marks queued work cancelled without invoking exporters after abort', async () => {
  const controller = new AbortController(); const calls: string[] = []
  const promise = exportBatch([{ id: 'a' }, { id: 'b' }], async item => { calls.push(item.id); controller.abort(); return item.id }, 1, controller.signal)
  const result = await promise
  expect(calls).toEqual(['a']); expect(result[1].status).toBe('cancelled')
})
