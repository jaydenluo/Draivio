import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { GuideControls } from './GuideControls'

afterEach(() => vi.restoreAllMocks())
function Probe() { const { state } = useEditor(); return <output data-testid="guides-state">{JSON.stringify(state.guideSettings)}</output> }
function setup() { render(<EditorProvider><GuideControls /><Probe /></EditorProvider>); return screen.getByRole('button', { name: '视图' }) }
function state() { return JSON.parse(screen.getByTestId('guides-state').textContent!) }
function menu() { return screen.getByRole('menu', { name: '画布视图' }) }
function settings() { fireEvent.click(screen.getByRole('button', { name: '视图' })); fireEvent.click(screen.getByRole('menuitem', { name: '参考线与网格设置…' })); return screen.getByRole('dialog', { name: '参考线与网格' }) }

it('opens a detached menu with checked view options and applies one toggle without inline forms', () => {
 const trigger = setup()
 expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
 fireEvent.click(trigger)
 expect(menu().parentElement).toBe(document.body)
 expect(trigger).toHaveAttribute('aria-expanded', 'true')
 expect(screen.getByRole('menuitemcheckbox', { name: '吸附' })).toHaveAttribute('aria-checked', 'true')
 fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '吸附' }))
 expect(state().snapEnabled).toBe(false)
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
 expect(trigger).toHaveFocus()
 fireEvent.click(trigger)
 expect(screen.getByRole('menuitemcheckbox', { name: '吸附' })).toHaveAttribute('aria-checked', 'false')
})

it('supports keyboard navigation, Escape, outside dismissal and trigger toggling', () => {
 const trigger = setup()
 fireEvent.keyDown(trigger, { key: 'ArrowDown' })
 expect(screen.getByRole('menuitemcheckbox', { name: '标尺' })).toHaveFocus()
 fireEvent.keyDown(menu(), { key: 'End' })
 expect(screen.getByRole('menuitem', { name: '参考线与网格设置…' })).toHaveFocus()
 fireEvent.keyDown(menu(), { key: 'ArrowDown' })
 expect(screen.getByRole('menuitemcheckbox', { name: '标尺' })).toHaveFocus()
 fireEvent.keyDown(menu(), { key: 'Escape' })
 expect(trigger).toHaveFocus()
 fireEvent.click(trigger); fireEvent.pointerDown(document.body)
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
 fireEvent.click(trigger); fireEvent.click(trigger)
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('opens above the bottom toolbar and stays inside the viewport', () => {
 const trigger = setup()
 vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 1000, right: 1060, top: 700, bottom: 726, width: 60, height: 26, x: 1000, y: 700, toJSON() {} })
 fireEvent.click(trigger)
 expect(parseFloat(menu().style.top)).toBeLessThan(700)
 expect(parseFloat(menu().style.left)).toBeGreaterThanOrEqual(8)
 expect(parseFloat(menu().style.left) + 224).toBeLessThanOrEqual(window.innerWidth - 8)
 fireEvent(window, new Event('resize'))
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
})

it('keeps quick guide creation and view visibility in the menu', () => {
 const trigger = setup()
 fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '显示参考线' }))
 expect(state().guidesVisible).toBe(false)
 fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitem', { name: '新增垂直参考线' }))
 expect(state().guidesVisible).toBe(true)
 expect(state().guides).toMatchObject([{ axis: 'x', position: 250, locked: false }])
 fireEvent.click(trigger); fireEvent.click(screen.getByRole('menuitem', { name: '新增水平参考线' }))
 expect(state().guides[1]).toMatchObject({ axis: 'y', position: 312.5 })
})

it('edits grid and guide coordinates, locks and deletes in a separate settings window', () => {
 setup()
 const dialog = settings()
 expect(dialog.parentElement).toBe(document.body)
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
 fireEvent.change(within(dialog).getByRole('spinbutton', { name: '横向间距' }), { target: { value: '32' } })
 expect(state().grid.spacingX).toBe(32)
 expect(state().grid.spacingY).toBe(20)
 fireEvent.click(within(dialog).getByRole('button', { name: '新增垂直参考线' }))
 const id = state().guides[0].id
 const position = within(dialog).getByRole('spinbutton', { name: `参考线位置 ${id}` })
 fireEvent.change(position, { target: { value: '125' } })
 expect(state().guides[0].position).toBe(125)
 fireEvent.click(within(dialog).getByRole('button', { name: `锁定参考线 ${id}` }))
 expect(position).toBeDisabled()
 expect(within(dialog).getByRole('button', { name: `删除参考线 ${id}` })).toBeDisabled()
 fireEvent.click(within(dialog).getByRole('button', { name: `解锁参考线 ${id}` }))
 fireEvent.click(within(dialog).getByRole('button', { name: `删除参考线 ${id}` }))
 expect(state().guides).toHaveLength(0)
 fireEvent.click(within(dialog).getByRole('button', { name: '关闭参考线与网格' }))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
 expect(screen.getByRole('button', { name: '视图' })).toHaveFocus()
})

it('drags only from the settings title, clamps to the screen and closes with Escape', () => {
 setup(); const dialog = settings()
 vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({ left: 200, top: 100, right: 540, bottom: 400, width: 340, height: 300, x: 200, y: 100, toJSON() {} })
 fireEvent.pointerDown(within(dialog).getByText('参考线与网格'), { pointerId: 1, button: 0, clientX: 230, clientY: 120 })
 fireEvent.pointerMove(window, { pointerId: 1, clientX: 280, clientY: 150 })
 fireEvent.pointerUp(window, { pointerId: 1 })
 expect(dialog.style.translate).toBe('50px 30px')
 fireEvent.pointerDown(within(dialog).getByRole('spinbutton', { name: '横向间距' }), { pointerId: 2, button: 0, clientX: 300, clientY: 200 })
 fireEvent.pointerMove(window, { pointerId: 2, clientX: 500, clientY: 400 })
 fireEvent.pointerUp(window, { pointerId: 2 })
 expect(dialog.style.translate).toBe('50px 30px')
 vi.mocked(dialog.getBoundingClientRect).mockReturnValue({ left: 250, top: 130, right: 590, bottom: 430, width: 340, height: 300, x: 250, y: 130, toJSON() {} })
 fireEvent.pointerDown(within(dialog).getByText('参考线与网格'), { pointerId: 3, button: 0, clientX: 280, clientY: 150 })
 fireEvent.pointerMove(window, { pointerId: 3, clientX: -1000, clientY: -1000 })
 fireEvent.pointerUp(window, { pointerId: 3 })
 expect(dialog.style.translate).toBe('-192px -92px')
 fireEvent.keyDown(dialog, { key: 'Escape' })
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})


it('opens detailed settings above its bottom toolbar trigger', () => {
 const trigger = setup()
 vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ left: 600, right: 660, top: 700, bottom: 726, width: 60, height: 26, x: 600, y: 700, toJSON() {} })
 const dialog = settings()
 expect(parseFloat(dialog.style.top)).toBeLessThan(600)
})

it('disables view actions and closes open surfaces while the canvas is busy', () => {
 const app = (disabled: boolean) => <EditorProvider><GuideControls disabled={disabled} /></EditorProvider>
 const { rerender } = render(app(false))
 const trigger = screen.getByRole('button', { name: '视图' })
 fireEvent.click(trigger)
 rerender(app(true))
 expect(trigger).toBeDisabled()
 expect(screen.queryByRole('menu')).not.toBeInTheDocument()
 rerender(app(false)); settings(); rerender(app(true))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
