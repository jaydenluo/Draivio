import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AIComposer } from './AIComposer'
import { EditorProvider } from '../state/editor'

afterEach(() => vi.restoreAllMocks())
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
