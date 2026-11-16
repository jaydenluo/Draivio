import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ToolGroupEntry, ToolRail } from './ToolRail'
import { ToolFlyout } from './ToolFlyout'
import { TOOL_GROUPS } from '../tools/toolRegistry'

function renderRail() {
  return render(<EditorProvider><ToolRail /><StateProbe /></EditorProvider>)
}

function StateProbe() {
  const { state } = useEditor()
  return <output data-testid="active-tool">{state.activeTool}</output>
}

test('opens a group flyout from its corner trigger and lists child tools', () => {
  renderRail()

  const trigger = screen.getByRole('button', { name: '打开工具组菜单：画笔' })
  expect(trigger).not.toHaveClass('expanded')
  fireEvent.click(trigger)

  expect(screen.getByRole('menu', { name: '画笔工具' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '打开工具组菜单：画笔' })).toHaveClass('expanded')
  expect(screen.getByRole('menuitem', { name: /铅笔/ })).toBeInTheDocument()
  expect(screen.getByRole('menuitem', { name: /渐变画笔/ })).toBeInTheDocument()
})

test('clicking a group main button selects that group recent tool', () => {
  renderRail()

  fireEvent.click(screen.getByRole('button', { name: '工具组：画笔' }))

  expect(screen.getByRole('button', { name: '工具组：画笔' })).toHaveAttribute('aria-pressed', 'true')
})

test('selecting a child tool updates the active tool and closes the flyout', () => {
  renderRail()
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))

  fireEvent.click(screen.getByRole('menuitem', { name: /铅笔/ }))

  expect(screen.getByRole('button', { name: '工具组：画笔' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByTestId('active-tool')).toHaveTextContent('pencil')
  expect(screen.queryByRole('menu', { name: '画笔工具' })).not.toBeInTheDocument()
})

test('closes the current flyout when another tool group is selected', () => {
  renderRail()
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  expect(screen.getByRole('menu', { name: '画笔工具' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '工具组：选区' }))

  expect(screen.queryByRole('menu', { name: '画笔工具' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '工具组：选区' })).toHaveAttribute('aria-pressed', 'true')
})

test('closes a flyout on outside click or Escape', async () => {
  renderRail()
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  expect(screen.getByRole('menu', { name: '画笔工具' })).toBeInTheDocument()

  fireEvent.pointerDown(document.body)
  await waitFor(() => expect(screen.queryByRole('menu', { name: '画笔工具' })).not.toBeInTheDocument())

  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('menu', { name: '画笔工具' })).not.toBeInTheDocument()
})

test('opens a flyout after holding a group button for about 250ms', () => {
  vi.useFakeTimers()
  renderRail()
  const button = screen.getByRole('button', { name: '工具组：画笔' })
  fireEvent.pointerDown(button)
  act(() => vi.advanceTimersByTime(249))
  expect(screen.queryByRole('menu', { name: '画笔工具' })).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('menu', { name: '画笔工具' })).toBeInTheDocument()
  vi.useRealTimers()
})

test('does not render a menu trigger for a group without child tools', () => {
  const group = { id: 'brush', label: '单工具', defaultToolId: 'brush', tools: [TOOL_GROUPS[2].tools[0]] } as const
  render(<ToolGroupEntry group={group} active selectedToolId="brush" onSelect={() => undefined} onOpen={() => undefined} />)
  expect(screen.getByRole('button', { name: '工具组：单工具' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '打开工具组菜单：单工具' })).not.toBeInTheDocument()
})

test('positions a flyout to the right and flips it left near the viewport edge', () => {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ left: 20, right: 60, top: 40, bottom: 80, width: 40, height: 40, x: 20, y: 40, toJSON: () => ({}) })
  const view = render(<ToolFlyout group={TOOL_GROUPS[2]} selectedToolId="brush" anchor={anchor} onSelect={() => undefined} onClose={() => undefined} />)
  expect(view.container.firstElementChild).toHaveClass('tool-flyout-right')
  expect(view.container.firstElementChild).toHaveStyle({ left: '68px' })
  const edgeAnchor = document.createElement('button')
  document.body.append(edgeAnchor)
  vi.spyOn(edgeAnchor, 'getBoundingClientRect').mockReturnValue({ left: 900, right: 940, top: 40, bottom: 80, width: 40, height: 40, x: 900, y: 40, toJSON: () => ({}) })
  view.rerender(<ToolFlyout group={TOOL_GROUPS[2]} selectedToolId="brush" anchor={edgeAnchor} onSelect={() => undefined} onClose={() => undefined} />)
  expect(view.container.firstElementChild).toHaveClass('tool-flyout-left')
})

test('cancels a pending long press on leave, blur, right click, and unmount', () => {
  vi.useFakeTimers()
  const onOpen = vi.fn()
  const group = TOOL_GROUPS[2]
  const view = render(<ToolGroupEntry group={group} active={false} selectedToolId="brush" onSelect={() => undefined} onOpen={onOpen} />)
  const button = screen.getByRole('button', { name: '工具组：画笔' })
  fireEvent.pointerDown(button, { button: 2 })
  act(() => vi.advanceTimersByTime(250))
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.pointerDown(button, { button: 0 })
  fireEvent.pointerLeave(button)
  act(() => vi.advanceTimersByTime(250))
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.pointerDown(button, { button: 0 })
  fireEvent.blur(window)
  act(() => vi.advanceTimersByTime(250))
  expect(onOpen).not.toHaveBeenCalled()
  fireEvent.pointerDown(button, { button: 0 })
  view.unmount()
  act(() => vi.advanceTimersByTime(250))
  expect(onOpen).not.toHaveBeenCalled()
  vi.useRealTimers()
})

test('focuses current item and navigates menu with arrow and edge keys', () => {
  renderRail()
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  const items = screen.getAllByRole('menuitem')
  expect(items[0]).toHaveFocus()
  fireEvent.keyDown(items[0], { key: 'ArrowDown' })
  expect(items[1]).toHaveFocus()
  fireEvent.keyDown(items[1], { key: 'End' })
  expect(items.at(-1)).toHaveFocus()
  fireEvent.keyDown(items.at(-1)!, { key: 'ArrowDown' })
  expect(items[0]).toHaveFocus()
  fireEvent.keyDown(items[0], { key: 'ArrowUp' })
  expect(items.at(-1)).toHaveFocus()
  fireEvent.keyDown(items.at(-1)!, { key: 'Home' })
  expect(items[0]).toHaveFocus()
})

test('returns focus to trigger on Escape and item selection, but not outside click', () => {
  renderRail()
  const trigger = screen.getByRole('button', { name: '打开工具组菜单：画笔' })
  fireEvent.click(trigger)
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  fireEvent.click(screen.getByRole('menuitem', { name: '铅笔' }))
  expect(trigger).toHaveFocus()
  fireEvent.click(trigger)
  const outside = document.createElement('button')
  document.body.append(outside)
  outside.focus()
  fireEvent.pointerDown(outside)
  expect(outside).toHaveFocus()
  expect(trigger).toHaveAttribute('aria-expanded', 'false')
  outside.remove()
})
