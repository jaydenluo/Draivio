import { defaultEffect } from '../render/layerEffects'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { Inspector } from '../components/Inspector'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { createSmartFilter } from '../render/filterPipeline'
import { EditorProvider, useEditor, type EditorAction, type EditorState } from '../state/editor'

let latest: EditorState
let dispatch: (action: EditorAction) => void
function Observe() {
  const editor = useEditor()
  latest = editor.state
  dispatch = editor.dispatch
  const { newDocument } = useDocumentWorkspace()
  return <button onClick={() => newDocument()}>换文档</button>
}

const mount = () => render(<EditorProvider><CanvasViewport /><Inspector inspectorWidth={300} onResizeStart={() => {}} onResizeBy={() => {}} /><Observe /></EditorProvider>)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const choose = (name: string) => fireEvent.click(screen.getByRole('menuitem', { name }))
const change = (name: string, value: string) => fireEvent.change(screen.getByRole('spinbutton', { name }), { target: { value } })
const art = () => latest.layers.find(layer => layer.id === 'art')!
const blur = (root: ParentNode) => [...root.querySelectorAll('feGaussianBlur')].map(el => el.getAttribute('stdDeviation'))
const effectCanvas = () => screen.getByRole('img', { name: '画布内容' })
const add = (kind = '高斯模糊') => {
  const row = document.querySelector('[data-layer-row="art"]')!
  fireEvent.contextMenu(row)
  choose('添加智能滤镜')
  choose(kind)
}
const seed = (...items: NonNullable<ReturnType<typeof art>['smartFilters']>['items']) => act(() => dispatch({type: 'set-smart-filters', id: 'art', chain: { items }}))

it('edits both duotone colors and saves the recipe through the layer menu', () => {
  mount()
  add('双色调')
  fireEvent.change(screen.getByLabelText('阴影色'), { target: { value: '#224466' } })
  fireEvent.change(screen.getByLabelText('高光色'), { target: { value: '#ffee99' } })
  click('应用')
  expect(art().smartFilters?.items[0]).toMatchObject({ kind: 'duotone', shadowColor: '#224466', highlightColor: '#ffee99' })
  click('编辑双色调')
  expect(screen.getByLabelText('阴影色')).toHaveValue('#224466')
  expect(screen.getByLabelText('高光色')).toHaveValue('#ffee99')
})

beforeEach(() => localStorage.clear())

it('opens the grouped picker from the layer and previews only on the main canvas before one undoable apply', () => {
  mount()
  expect(screen.queryByRole('button', { name: /智能滤镜 · 0/ })).toBeNull()
  add()
  const before = latest
  const dialog = screen.getByRole('dialog', { name: '高斯模糊' })
  expect(dialog.parentElement).toBe(document.body)
  expect(within(dialog).getByRole('slider', { name: '半径滑杆' })).toBeInTheDocument()
  change('半径', '6')
  expect(blur(effectCanvas())).toContain('6')
  expect(blur(document.querySelector('.canvas-art')!)).not.toContain('6')
  expect(latest).toBe(before)
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(blur(effectCanvas())).not.toContain('6')
  expect(latest).toBe(before)
  add()
  change('半径', '6')
  click('应用')
  expect(art().smartFilters?.items[0].radius).toBe(6)
  expect(latest.undoStack).toHaveLength(before.undoStack.length + 1)
  act(() => dispatch({ type: 'undo' }))
  expect(art().smartFilters).toBeUndefined()
})

it('compares just the edited step and restores its draft on release', () => {
  mount()
  seed({ ...createSmartFilter('gaussian', 'one'), radius: 2 }, { ...createSmartFilter('gaussian', 'two'), radius: 3 })
  click('智能滤镜 · 2')
  fireEvent.click(screen.getAllByRole('button', { name: '编辑高斯模糊' })[0])
  change('半径', '7')
  const compare = screen.getByRole('button', { name: '按住对比' })
  fireEvent.keyDown(compare, { key: ' ' })
  expect(blur(effectCanvas())).toContain('3')
  expect(blur(effectCanvas())).not.toContain('7')
  fireEvent.keyUp(compare, { key: ' ' })
  expect(blur(effectCanvas())).toContain('7')
  click('关闭高斯模糊')
  expect(blur(effectCanvas())).toContain('2')
})

it('opens denoise with effective parameters and captures the current selection when starting a filter chain', () => {
  mount()
  act(() => dispatch({ type: 'set-selection-rect', rect: { x: 25, y: 25, width: 50, height: 50 } }))
  add('保边降噪')
  expect(screen.getByRole('spinbutton', { name: '阈值' })).toHaveValue(25)
  expect(screen.getByText('作用范围：当前选区')).toBeInTheDocument()
  click('应用')
  expect(art().smartFilters).toMatchObject({ items: [{ kind: 'denoise', threshold: 25, radius: 2, amount: .65 }], selection: { path: { type: 'affine' } } })
})

it('shows concise summaries, supports visibility, reorder and deletion, and locates the stack from Properties', () => {
  mount()
  seed({ ...createSmartFilter('gaussian', 'one'), radius: 2 }, { ...createSmartFilter('grain', 'two'), amount: .2 })
  expect(screen.queryByRole('button', { name: '编辑颗粒' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '属性' }))
  click('定位智能滤镜 · 2')
  expect(screen.getByRole('button', { name: '图层' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('强度 20%')).toBeInTheDocument()
  click('停用颗粒')
  expect(art().smartFilters?.items[1].enabled).toBe(false)
  click('颗粒更多操作')
  choose('上移')
  expect(art().smartFilters?.items.map(item => item.id)).toEqual(['two', 'one'])
  const grain = screen.getByRole('button', { name: '编辑颗粒' }).closest('li')!
  const gaussian = screen.getByRole('button', { name: '编辑高斯模糊' }).closest('li')!
  fireEvent.dragStart(grain)
  fireEvent.dragOver(gaussian)
  fireEvent.drop(gaussian)
  expect(art().smartFilters?.items.map(item => item.id)).toEqual(['one', 'two'])
  click('颗粒更多操作')
  choose('删除滤镜')
  expect(art().smartFilters?.items.map(item => item.id)).toEqual(['one'])
})

it('edits the chain scope as a draft and stores the captured selection and rectangle together', () => {
  mount()
  seed({ ...createSmartFilter('gaussian', 'one'), radius: 4 })
  act(() => dispatch({ type: 'set-selection-rect', rect: { x: 20, y: 20, width: 40, height: 40 } }))
  click('智能滤镜 · 1')
  const scope = screen.getByRole('button', { name: '作用范围：全图层' })
  expect(scope.nextElementSibling).toBe(screen.getByRole('button', { name: '添加智能滤镜' }))
  fireEvent.click(scope)
  expect(screen.getByRole('menuitem', { name: '全图层' })).toBeDisabled()
  choose('设置局部范围…')
  const before = latest
  click('使用当前选区')
  click('清除选区')
  click('使用当前选区')
  fireEvent.click(screen.getByRole('checkbox', { name: '矩形蒙版' }))
  change('宽度', '50')
  expect(latest).toBe(before)
  click('应用')
  expect(art().smartFilters?.mask?.rect.width).toBe(50)
  expect(art().smartFilters?.selection?.path.type).toBe('affine')
  click('作用范围：选区与矩形')
  choose('全图层')
  expect(art().smartFilters?.selection).toBeUndefined()
  expect(art().smartFilters?.mask).toMatchObject({ enabled: false, rect: { width: 50 } })
  expect(art().smartFilters?.items).toHaveLength(1)
  expect(screen.getByRole('button', { name: '作用范围：全图层' })).toBeInTheDocument()
  act(() => dispatch({ type: 'undo' }))
  expect(screen.getByRole('button', { name: '作用范围：选区与矩形' })).toBeInTheDocument()
})

it('suppresses stale drafts and closes the editor when changing documents', () => {
  mount()
  add()
  change('半径', '7')
  act(() => dispatch({ type: 'set-layer-opacity', id: 'art', opacity: 35 }))
  expect(screen.getByRole('button', { name: '应用' })).toBeDisabled()
  expect(screen.getByText('文档或源内容已更改，请重新打开滤镜。')).toBeInTheDocument()
  expect(blur(effectCanvas())).not.toContain('7')
  click('换文档')
  expect(screen.queryByRole('dialog', { name: '高斯模糊' })).toBeNull()
})

it('keeps filter-specific values and blocks adding to a locked layer', () => {
  mount()
  act(() => dispatch({ type: 'toggle-layer-lock', id: 'art' }))
  fireEvent.contextMenu(document.querySelector('[data-layer-row="art"]')!)
  expect(screen.getByRole('menuitem', { name: '添加智能滤镜' })).toBeDisabled()
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  act(() => dispatch({ type: 'toggle-layer-lock', id: 'art' }))
  add('方向运动模糊')
  change('半径', '3')
  change('方向', '90')
  click('应用')
  expect(art().smartFilters?.items[0]).toMatchObject({ kind: 'motion', radius: 3, angle: 90 })
  click('添加智能滤镜')
  choose('像素化')
  expect(screen.queryByRole('spinbutton', { name: '半径' })).toBeNull()
  change('像素块', '4')
  click('应用')
  expect(art().smartFilters?.items[1]).toMatchObject({ kind: 'pixelate', size: 4 })
})

it('opens the filter list from the layer icon immediately before fx', () => {
  mount()
  seed({ ...createSmartFilter('gaussian', 'one'), radius: 2 })
  act(() => dispatch({ type: 'set-layer-effects', id: 'art', effects: { version: 1, items: [defaultEffect('colorOverlay')] } }))
  const row = document.querySelector('[data-layer-row="art"]') as HTMLElement
  const toggle = within(row).getByRole('button', { name: '智能滤镜 · 1' })
  expect(toggle.nextElementSibling).toHaveClass('layer-fx')
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: '编辑高斯模糊' })).toBeNull()
  fireEvent.click(toggle)
  expect(screen.getByRole('button', { name: '编辑高斯模糊' })).toBeInTheDocument()
  fireEvent.click(toggle)
  expect(screen.queryByRole('button', { name: '编辑高斯模糊' })).toBeNull()
})

it('adds the first new filter directly from the selected layer icon', () => {
  mount()
  const row = document.querySelector('[data-layer-row="art"]') as HTMLElement
  fireEvent.click(within(row).getByRole('button', { name: '添加智能滤镜' }))
  choose('黑白')
  change('强度', '70')
  click('应用')
  expect(art().smartFilters?.items[0]).toMatchObject({ kind: 'grayscale', amount: .7 })
  expect(within(row).getByRole('button', { name: '智能滤镜 · 1' })).toHaveAttribute('aria-expanded', 'true')
})
