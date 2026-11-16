import { describe, expect, it, vi } from 'vitest'
import { createUpdateController, type UpdateApi, type UpdateStorage } from './updateClient'

function storage(initial = ''): UpdateStorage & { values: Record<string, string> } {
  const values: Record<string, string> = initial ? { 'draivio.update.last-check': initial } : {}
  return { values, get: key => values[key] ?? null, set: (key, value) => { values[key] = value } }
}

function updateApi(overrides: Partial<UpdateApi> = {}): UpdateApi {
  return {
    check: vi.fn().mockResolvedValue(null),
    isDesktop: () => true,
    now: () => 1_000_000,
    ...overrides,
  }
}

describe('update controller', () => {
  it('does not check in a browser runtime', async () => {
    const api = updateApi({ isDesktop: () => false })
    const controller = createUpdateController(api, storage())
    await expect(controller.checkForUpdate()).resolves.toBeNull()
    expect(api.check).not.toHaveBeenCalled()
  })

  it('checks at most once per 24 hours', async () => {
    const store = storage(String(1_000_000 - 60_000))
    const api = updateApi()
    const controller = createUpdateController(api, store)
    await expect(controller.checkForUpdate()).resolves.toBeNull()
    expect(api.check).not.toHaveBeenCalled()
  })

  it('downloads, installs, and relaunches an available update', async () => {
    const install = vi.fn().mockResolvedValue(undefined)
    const downloadAndInstall = vi.fn().mockResolvedValue(undefined)
    const relaunch = vi.fn().mockResolvedValue(undefined)
    const update = { version: '0.2.0', body: '修复稳定性', downloadAndInstall, install }
    const api = updateApi({ check: vi.fn().mockResolvedValue(update), relaunch })
    const controller = createUpdateController(api, storage())
    await expect(controller.checkForUpdate()).resolves.toEqual(update)
    await controller.install(update)
    expect(downloadAndInstall).toHaveBeenCalled()
    expect(install).not.toHaveBeenCalled()
    expect(relaunch).toHaveBeenCalled()
  })

  it('preserves update errors for the UI', async () => {
    const error = new Error('网络不可用')
    const api = updateApi({ check: vi.fn().mockRejectedValue(error) })
    const controller = createUpdateController(api, storage())
    await expect(controller.checkForUpdate()).rejects.toThrow('网络不可用')
  })
})
