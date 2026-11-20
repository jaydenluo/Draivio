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

  it('supports title dragging and closing without installing', async () => {
    const update = {version:'0.2.0', downloadAndInstall:vi.fn(), close:vi.fn()}
    const client = controller(update)
    render(<UpdateManager controller={client} delayMs={0} />)
    const dialog = await screen.findByRole('dialog')
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({left:200,top:100,right:500,bottom:300,width:300,height:200,x:200,y:100,toJSON(){}})
    fireEvent.pointerDown(screen.getByText('发现新版本 v0.2.0'),{pointerId:1,button:0,clientX:230,clientY:120})
    fireEvent.pointerMove(window,{pointerId:1,clientX:280,clientY:150})
    fireEvent.pointerUp(window,{pointerId:1})
    expect(dialog.style.translate).toBe('50px 30px')
    fireEvent.click(screen.getByRole('button',{name:'关闭更新提示'}))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(update.close).toHaveBeenCalledOnce()
    expect(client.install).not.toHaveBeenCalled()
  })
})
