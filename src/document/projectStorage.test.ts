import { describe, expect, it, vi } from 'vitest'
import { writeProjectFile } from './projectStorage'

describe('transactional project writing', () => {
  it('writes then closes before reporting success', async () => {
    const events: string[] = []
    const handle = { createWritable: async () => ({ write: async () => { events.push('write') }, close: async () => { events.push('close') }, abort: async () => { events.push('abort') } }) }
    await writeProjectFile(handle, 'new contents')
    expect(events).toEqual(['write', 'close'])
  })
  it('aborts an unsuccessful write and propagates failure', async () => {
    const abort = vi.fn()
    const handle = { createWritable: async () => ({ write: async () => { throw new Error('disk full') }, close: vi.fn(), abort }) }
    await expect(writeProjectFile(handle, 'new contents')).rejects.toThrow('disk full')
    expect(abort).toHaveBeenCalledOnce()
  })
})
