import { describe, expect, it } from 'vitest'
import { TOOL_GROUPS, getTool, getToolGroup, toolRegistry } from './toolRegistry'
import { editorReducer, initialEditorState } from '../state/editor'
import { render, screen } from '@testing-library/react'
import { EditorProvider } from '../state/editor'
import { ToolRail } from '../components/ToolRail'
import { createElement } from 'react'

describe('tool registry', () => {
  it('defines the nine Photoshop-style tool groups', () => {
    expect(TOOL_GROUPS).toHaveLength(11)
    expect(TOOL_GROUPS.map((group) => group.id)).toEqual([
      'select-move', 'selection', 'brush', 'erase-heal', 'mask', 'crop-transform', 'text-shape', 'color-fill', 'navigation', 'cutout', 'upscale',
    ])
  })

  it('exposes defaults, sub-tools, and shortcuts through the registry', () => {
    expect(toolRegistry['select-move'].defaultToolId).toBe('select')
    expect(getTool('brush')?.shortcut).toBe('B')
    expect(getToolGroup('pan')?.id).toBe('navigation')
    expect(getTool('rectangle-select')?.groupId).toBe('selection')
  })

  it('exposes the complete planned selection, painting, mask and shape sub-tools', () => {
    for (const id of ['polygon-select', 'bezier-select', 'subject-select']) expect(getTool(id)?.groupId).toBe('selection')
    for (const id of ['brush-line', 'soft-brush', 'smudge']) expect(getTool(id)?.groupId).toBe('brush')
    expect(getTool('background-eraser')?.groupId).toBe('erase-heal')
    for (const id of ['mask-gradient', 'mask-subject']) expect(getTool(id)?.groupId).toBe('mask')
    for (const id of ['shape-ellipse', 'shape-line', 'shape-arrow']) expect(getTool(id)?.groupId).toBe('text-shape')
    expect(getTool('bezier-select')?.shortcut).toBe('P')
  })

  it('keeps group defaults valid and tool IDs unique and correctly assigned', () => {
    const definitions = TOOL_GROUPS.flatMap((group) => group.tools)
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(definitions.length)
    for (const group of TOOL_GROUPS) {
      expect(group.tools.some((definition) => definition.id === group.defaultToolId)).toBe(true)
      for (const definition of group.tools) expect(definition.groupId).toBe(group.id)
    }
    expect(getTool('unknown-tool')).toBeUndefined()
  })

  it('keeps the legacy activeTool while updating the normalized tool state', () => {
    const next = editorReducer(initialEditorState, { type: 'select-tool', tool: 'brush' })
    expect(next.activeTool).toBe('brush')
    expect(next.activeToolGroup).toBe('brush')
    expect(next.activeToolId).toBe('brush')
    expect(next.recentToolByGroup.brush).toBe('brush')
  })

  it('syncs the active group and recent tool when selecting a non-default sub-tool', () => {
    const next = editorReducer(initialEditorState, { type: 'select-tool', tool: 'rectangle-select' })
    expect(next.activeTool).toBe('rectangle-select')
    expect(next.activeToolGroup).toBe('selection')
    expect(next.activeToolId).toBe('rectangle-select')
    expect(next.recentToolByGroup.selection).toBe('rectangle-select')
  })

  it('renders all registry groups and tools from the active group', () => {
    render(createElement(EditorProvider, null, createElement(ToolRail)))
    expect(screen.getAllByRole('button', { name: /^工具组：/ })).toHaveLength(11)
    expect(screen.getByRole('button', { name: '打开工具组菜单：选择/移动' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '工具组：选择/移动' })).toBeInTheDocument()
  })
})
