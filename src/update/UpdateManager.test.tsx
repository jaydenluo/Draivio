import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpdateManager } from './UpdateManager'
import type { UpdateController, UpdateLike } from './updateClient'

function controller(update: UpdateLike | null): UpdateController {
  return { checkForUpdate: vi.fn().mockResolvedValue(update), install: vi.fn().mockResolvedValue(undefined) }
}

describe('UpdateManager', () => {
  it('shows an available update and installs after confirmation', async () => {
    const update = { version: '0.2.0', body: '更稳定', downloadAndInstall: vi.fn().mockResolvedValue(undefined) }
    const updateController = controller(update)
    render(<UpdateManager controller={updateController} delayMs={0} />)
    expect(await screen.findByRole('dialog', { name: '发现新版本 v0.2.0' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '现在更新' }))
    await waitFor(() => expect(updateController.install).toHaveBeenCalledWith(update, expect.any(Function)))
  })

  it('does not render when no update is available', async () => {
    render(<UpdateManager controller={controller(null)} delayMs={0} />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
