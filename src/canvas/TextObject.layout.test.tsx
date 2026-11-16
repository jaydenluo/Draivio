import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TextObject, type CanvasTextObject } from './TextObject'
import { CanvasViewport } from './CanvasViewport'
import { EditorProvider } from '../state/editor'

const object: CanvasTextObject = { id: 'text', layerId: 'art', x: 20, y: 20, text: '中', fontFamily: 'sans-serif', fontSize: 120, fontWeight: '400', color: '#890707', align: 'left', width: 960, height: 180, lineHeight: 1.4 }
let stylesheet: HTMLStyleElement

beforeEach(() => {
  stylesheet = document.createElement('style')
  stylesheet.textContent = readFileSync('src/styles/theme.css', 'utf8')
  document.head.append(stylesheet)
})
afterEach(() => stylesheet.remove())

test('canvas overflow remains visible within the fixed, non-scrolling workspace', () => {
  render(<EditorProvider><div className="app-shell"><CanvasViewport /></div></EditorProvider>)
  expect(getComputedStyle(document.querySelector('.canvas-area')!).overflow).toBe('clip')
  for (const selector of ['.canvas-crop-window', '.canvas-art']) {
    expect(getComputedStyle(document.querySelector(selector)!).overflow).toBe('visible')
  }
  expect(getComputedStyle(document.querySelector('.canvas-area')!).minHeight).toBe('0px')
  expect(getComputedStyle(document.querySelector('.app-shell')!).position).toBe('fixed')
})

test('entering text editing focuses the input without scrolling the canvas into view', () => {
  const focus = vi.spyOn(HTMLTextAreaElement.prototype, 'focus')
  try {
    render(<TextObject object={{ ...object, text: '很长的文字应当直接超出画布'.repeat(10), fontSize: 400 }} selected onCommit={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText('很长的文字应当直接超出画布'.repeat(10)))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  } finally {
    focus.mockRestore()
  }
})

test('selection controls float outside text layout instead of adding an empty row', () => {
  render(<TextObject object={object} selected onCommit={vi.fn()} />)
  for (const control of screen.getAllByRole('button')) {
    expect(getComputedStyle(control).position).toBe('absolute')
  }
})

test('point text ignores saved placeholder height and preserves font line spacing', () => {
  render(<TextObject object={object} selected onCommit={vi.fn()} />)
  const root = document.querySelector('.canvas-text-object')!
  expect(getComputedStyle(root).lineHeight).toBe('168px')
  expect((root as HTMLElement).style.width).toBe('max-content')
  expect((root as HTMLElement).style.minHeight).toBe('')
})

test('the editor overlays the text without adding height or a default second row', () => {
  render(<TextObject object={object} selected onCommit={vi.fn()} />)
  fireEvent.doubleClick(screen.getByText('中'))
  const editor = screen.getByRole('textbox', { name: '编辑画布文字' }) as HTMLTextAreaElement
  expect(getComputedStyle(editor).position).toBe('absolute')
  expect(getComputedStyle(editor).minHeight).toBe('120px')
  expect(getComputedStyle(editor).resize).toBe('none')
  expect(editor.rows).toBe(1)
})

test('point editor follows the content box even when textarea scroll height includes font overflow', () => {
  const measuredHeight = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(120)
  const scrollHeight = vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(144)
  try {
    render(<TextObject object={object} selected onCommit={vi.fn()} />)
    fireEvent.doubleClick(screen.getByText('中'))
    expect((screen.getByRole('textbox', { name: '编辑画布文字' }) as HTMLElement).style.height).toBe('120px')
  } finally {
    measuredHeight.mockRestore()
    scrollHeight.mockRestore()
  }
})

test('paragraph boxes and multiline point text retain their configured line spacing', () => {
  const view = render(<TextObject object={{ ...object, layout: 'paragraph', width: 300, height: 400, lineHeight: 1.8 }} selected onCommit={vi.fn()} />)
  expect((document.querySelector('.canvas-text-object') as HTMLElement).style.minHeight).toBe('400px')
  expect(getComputedStyle(document.querySelector('.canvas-text-object')!).lineHeight).toBe('216px')
  view.rerender(<TextObject object={{ ...object, text: '第一行\n第二行', lineHeight: 1.8 }} selected onCommit={vi.fn()} />)
  expect(getComputedStyle(document.querySelector('.canvas-text-object')!).lineHeight).toBe('216px')
})
