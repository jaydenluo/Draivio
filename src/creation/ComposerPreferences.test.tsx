import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AIComposer } from './AIComposer'
import { readComposerPreferences, saveComposerPreferences } from './composerPreferences'
import { EditorProvider } from '../state/editor'

afterEach(() => vi.restoreAllMocks())
beforeEach(() => localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ id: 'preferences-source', provider: 'OpenAI', name: '偏好测试', baseUrl: 'https://preferences.example/v1', apiKey: 'test-key', protocol: 'openai_compatible', models: ['preferences-model'], modelCapabilities: { 'preferences-model': { image: true, text: false, vision: false } }, enabled: true }])))
const storageKey = 'draivio-generation-count'
function composer() { return render(<EditorProvider><AIComposer /></EditorProvider>) }

test('defaults to one result on first use', () => {
  composer()
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('1 张')
})

test('remembers the last selected result count when reopening the editor', () => {
  const first = composer()
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  fireEvent.click(screen.getByRole('button', { name: '6 张' }))
  expect(window.localStorage.getItem(storageKey)).toBe('6 张')
  first.unmount()
  composer()
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('6 张')
})

test('falls back to one when the saved count is unsupported', () => {
  window.localStorage.setItem(storageKey, '999 张')
  composer()
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('1 张')
})

test('keeps quantity selection usable when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable') })
  composer()
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('1 张')
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  fireEvent.click(screen.getByRole('button', { name: '8 张' }))
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('8 张')
})

test('remembers all composer choices', () => {
  saveComposerPreferences({ mode: 'generate', sourceId: 'openai-custom', model: 'gpt-image-2.5', ratio: '16:9', size: '1920 × 1080', count: '4 张', strength: '强度 72%' })
  expect(readComposerPreferences()).toEqual({ mode: 'generate', sourceId: 'openai-custom', model: 'gpt-image-2.5', ratio: '16:9', size: '1920 × 1080', count: '4 张', strength: '强度 72%' })
})

test('restores the selected composer controls after the editor is reopened', () => {
  const first = composer()
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'preferences-model · OpenAI · 偏好测试' }))
  fireEvent.click(screen.getByRole('button', { name: '选择比例与分辨率' }))
  fireEvent.click(screen.getByRole('button', { name: '比例 16:9' }))
  fireEvent.click(screen.getByRole('button', { name: '1920 × 1080' }))
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  fireEvent.click(screen.getByRole('button', { name: '6 张' }))
  first.unmount()

  composer()
  expect(screen.getByRole('button', { name: '生成图片' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '修改图片' })).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('preferences-model')
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('16:9 · 1920 × 1080')
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('6 张')
})

test('composer controls do not expose provider subtitle or trailing dropdown glyphs', () => {
  composer()
  expect(screen.getByRole('button', { name: '生成图片' })).toHaveTextContent('生成图片')
  expect(screen.queryByText('画布底部')).not.toBeInTheDocument()
  expect(screen.queryByText('预计 12 积分')).not.toBeInTheDocument()
  const model = screen.getByRole('button', { name: '选择模型' })
  expect(model).not.toHaveTextContent('Draivio')
  expect(model).not.toHaveTextContent('⌄')
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).not.toHaveTextContent('⌄')
  expect(screen.getByRole('button', { name: '选择数量' })).not.toHaveTextContent('⌄')
})

test('grows the prompt input with the text and caps overflow inside the field', () => {
  composer()
  const input = screen.getByRole('textbox', { name: 'AI 操作' }) as HTMLTextAreaElement
  expect(input.style.height).toBe('26px')
  Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 180 })
  fireEvent.change(input, { target: { value: '第一行\n第二行\n第三行' } })
  expect(input.style.height).toBe('180px')
  expect(input.style.overflowY).toBe('hidden')

  Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 320 })
  fireEvent.change(input, { target: { value: '很多很多内容' } })
  expect(input.style.height).toBe('220px')
  expect(input.style.overflowY).toBe('auto')
})

test('sends with Enter, keeps Shift+Enter for a newline, and ignores IME Enter', () => {
  composer()
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'preferences-model · OpenAI · 偏好测试' }))
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  const input = screen.getByRole('textbox', { name: 'AI 操作' })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeEnabled()

  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeEnabled()

  fireEvent.keyDown(input, { key: 'Enter' })
  expect(screen.getByRole('button', { name: '停止当前任务' })).toBeEnabled()
})


