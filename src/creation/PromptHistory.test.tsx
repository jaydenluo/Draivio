import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { AIComposer } from './AIComposer'
import { GenerationPanel } from './GenerationPanel'
function Probe() { const { state, dispatch } = useEditor(); return <><output data-testid="prompt-history">{JSON.stringify({ undo: state.undoStack.length, history: state.history.length, prompt: state.prompt })}</output><button onClick={() => dispatch({ type: 'undo' })}>撤销提示词</button></> }
for (const [name, Component] of [['composer', AIComposer], ['generation', GenerationPanel]] as const) test(`${name} groups forty prompt characters into one edit`, () => {
  render(<EditorProvider><Component /><Probe /></EditorProvider>)
  const before = JSON.parse(screen.getByTestId('prompt-history').textContent!)
  const input = screen.getByRole('textbox')
  fireEvent.focus(input)
  for (let length = 1; length <= 40; length++) fireEvent.change(input, { target: { value: '字'.repeat(length) } })
  expect(JSON.parse(screen.getByTestId('prompt-history').textContent!).undo).toBe(0)
  fireEvent.blur(input)
  expect(JSON.parse(screen.getByTestId('prompt-history').textContent!)).toMatchObject({ undo: 1, history: 2, prompt: '字'.repeat(40) })
  fireEvent.click(screen.getByText('撤销提示词'))
  expect(JSON.parse(screen.getByTestId('prompt-history').textContent!).prompt).toBe(before.prompt)
})
