import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { PropertiesPanel } from './PropertiesPanel'
import { EditorProvider, useEditor } from '../state/editor'

const text = {
  id: 'text-1', layerId: 'text-1', x: 20, y: 20, text: '标题', layout: 'paragraph' as const,
  width: 240, height: 80, fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#ffffff', align: 'left' as const,
  lineHeight: 1.4, letterSpacing: 0,
}

function Fixture() {
  const { state, dispatch } = useEditor()
  return <>
    <button onClick={() => dispatch({ type: 'create-text-layer', object: text })}>载入文字</button>
    <output data-testid="text-properties-state">{JSON.stringify(state.canvasTexts)}</output>
  </>
}

test('selected text layer exposes typography controls and commits edits', () => {
  render(<EditorProvider><PropertiesPanel /><Fixture /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '载入文字' }))

  expect(screen.getByLabelText('文字内容')).toHaveValue('标题')
  expect(screen.getByLabelText('字号')).toHaveValue(24)
  expect(screen.getByLabelText('字体')).toHaveValue('sans-serif')
  expect(screen.getByLabelText('文字颜色')).toHaveValue('#ffffff')
  expect(screen.getByLabelText('文字对齐')).toHaveValue('left')
  expect(screen.getByLabelText('行高')).toHaveValue(1.4)
  expect(screen.getByLabelText('字距')).toHaveValue(0)

  fireEvent.change(screen.getByLabelText('文字内容'), { target: { value: '新标题' } })
  fireEvent.change(screen.getByLabelText('字号'), { target: { value: '36' } })
  fireEvent.change(screen.getByLabelText('字体'), { target: { value: 'Inter' } })
  fireEvent.change(screen.getByLabelText('文字对齐'), { target: { value: 'center' } })

  const current = JSON.parse(screen.getByTestId('text-properties-state').textContent ?? '[]') as Array<typeof text>
  expect(current[0]).toMatchObject({ text: '新标题', fontSize: 36, fontFamily: 'Inter', align: 'center' })
})
