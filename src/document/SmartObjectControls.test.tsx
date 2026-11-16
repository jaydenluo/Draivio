import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { SmartObjectControls } from './SmartObjectControls'

function Fixture() {
  const { state, dispatch } = useEditor()
  return <>
    <button onClick={() => { dispatch({ type: 'create-text-layer', object: { id: 'child-text', layerId: 'child', text: '源文字', x: 10, y: 10, fontFamily: 'sans-serif', fontSize: 20, fontWeight: '400', color: '#000000', align: 'left' } }); dispatch({ type: 'convert-to-smart-object', id: 'child' }) }}>准备智能对象</button>
    <button onClick={() => dispatch({ type: 'undo' })}>父文档撤销</button>
    <SmartObjectControls layerId={state.selectedLayerId} />
    <output data-testid="sources">{JSON.stringify(state.smartObjectSources)}</output>
  </>
}

test('internal edit is isolated until save and cancel preserves parent; parent undo restores source', () => {
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<EditorProvider><Fixture /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '准备智能对象' }))
  fireEvent.click(screen.getByRole('button', { name: '打开内部文档' }))
  fireEvent.change(screen.getByLabelText('内部文字 child-text'), { target: { value: '未保存' } })
  expect(screen.getByTestId('sources').textContent).not.toContain('未保存')
  fireEvent.click(screen.getByRole('button', { name: '取消关闭' }))
  expect(screen.queryByRole('dialog', { name: '智能对象内部文档' })).not.toBeInTheDocument()
  expect(screen.getByTestId('sources').textContent).not.toContain('未保存')
  fireEvent.click(screen.getByRole('button', { name: '打开内部文档' }))
  fireEvent.change(screen.getByLabelText('内部文字 child-text'), { target: { value: '已保存' } })
  fireEvent.click(screen.getByRole('button', { name: '保存并回写' }))
  expect(screen.getByTestId('sources').textContent).toContain('已保存')
  fireEvent.click(screen.getByRole('button', { name: '父文档撤销' }))
  expect(screen.getByTestId('sources').textContent).toContain('源文字')
  expect(screen.getByTestId('sources').textContent).not.toContain('已保存')
  confirm.mockRestore()
})
