import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { CanvasViewport } from './CanvasViewport'
function Setup() { const { dispatch } = useEditor(); return <><button onClick={() => { dispatch({ type: 'upsert-text', object: { id: 't', layerId: 'art', x: 50, y: 50, text: '可编辑文字', fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#000', align: 'left' } }); dispatch({ type: 'resize-document', width: 1000, height: 1000, mode: 'canvas' }) }}>准备扩边</button><CanvasViewport /></> }
it('keeps text editable at its transformed location after canvas expansion', () => {
 render(<EditorProvider><Setup /></EditorProvider>)
 fireEvent.click(screen.getByText('准备扩边'))
 fireEvent.doubleClick(screen.getByText('可编辑文字', { selector: 'span.canvas-text' }))
 expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('可编辑文字')
})
