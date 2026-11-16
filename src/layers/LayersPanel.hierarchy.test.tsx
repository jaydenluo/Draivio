import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import { LayersPanel } from './LayersPanel'

function HierarchyControls() {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => dispatch({ type: 'restore-project', document: { ...initialEditorState, layers: [
    { ...initialEditorState.layers[0], id: 'root', name: '根组', className: 'layer-group', children: ['nested'], opacity: 50, locked: true, source: undefined },
    { ...initialEditorState.layers[0], id: 'nested', name: '内组', className: 'layer-group', groupId: 'root', children: ['child'], opacity: 50, source: undefined },
    { ...initialEditorState.layers[0], id: 'child', name: '子层', groupId: 'nested', source: 'fixture' },
  ], selectedLayerId: 'child', selectedLayerIds: ['child'] } })}>载入组</button><output>{state.notice}</output><LayersPanel /></>
}

test('labels inherited locks and visibility, renders thumbnails through the scene and collapses all descendants', () => {
  const view = render(<EditorProvider><HierarchyControls /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '载入组' }))
  expect(screen.getByRole('button', { name: '子层图层' })).toHaveTextContent('继承锁定')
  expect(screen.getByRole('button', { name: '子层继承锁定' })).toBeDisabled()
  const thumbnail = screen.getByRole('button', { name: '子层图层' }).querySelector('svg.layer-thumbnail-art')!
  expect(thumbnail).toBeInTheDocument()
  expect(thumbnail.querySelector('[data-layer-id="root"]')).toHaveAttribute('opacity', '0.5')
  expect(thumbnail.querySelector('[data-layer-id="nested"]')).toHaveAttribute('opacity', '0.5')
  expect(thumbnail.querySelector('[data-layer-id="child"]')).toBeInTheDocument()
  expect(view.container.querySelector('.canvas-art')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '根组解锁' }))
  fireEvent.click(screen.getByRole('button', { name: '根组隐藏' }))
  expect(screen.getByRole('button', { name: '子层图层' })).toHaveTextContent('继承隐藏')
  expect(screen.getByRole('button', { name: '子层图层' }).querySelector('[data-layer-id="child"]')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '根组显示' }))
  fireEvent.click(screen.getByRole('button', { name: '根组折叠' }))
  expect(screen.queryByRole('button', { name: '内组图层' })).toBeNull()
  expect(screen.queryByRole('button', { name: '子层图层' })).toBeNull()
})

test('a keyboard duplicate inside the layer list creates exactly one independent copy', () => {
  render(<EditorProvider><HierarchyControls /></EditorProvider>)
  const layerButton = screen.getByRole('button', { name: '春日海报 · 变体 1图层' })
  fireEvent.keyDown(layerButton, { key: 'd', ctrlKey: true })
  expect(screen.getAllByRole('button', { name: '春日海报 · 变体 1 副本图层' })).toHaveLength(1)
})

test('each layer row exposes a delete button beside the layer controls', () => {
  render(<EditorProvider><LayersPanel /></EditorProvider>)
  const deleteButton = screen.getByRole('button', { name: '春日海报 · 变体 1删除' })
  expect(deleteButton).toBeInTheDocument()
  fireEvent.click(deleteButton)
  expect(screen.queryByRole('button', { name: '春日海报 · 变体 1图层' })).toBeNull()
})
