import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { CurveEditor } from './CurveEditor'
import { defaultCurves } from '../adjustments/curves'
import { defaultLevels } from '../adjustments/levels'
it('edits curve and levels through keyboard-accessible numeric controls', () => {
 const onCurves=vi.fn(), onLevels=vi.fn(); render(<CurveEditor curves={defaultCurves()} levels={defaultLevels()} onCurves={onCurves} onLevels={onLevels}/>)
 fireEvent.change(screen.getAllByLabelText('Y')[0],{target:{value:'0.25'}}); expect(onCurves).toHaveBeenCalled()
 fireEvent.change(screen.getByLabelText('色阶黑场'),{target:{value:'0.1'}}); expect(onLevels).toHaveBeenCalledWith({...defaultLevels(),inputBlack:.1})
})
it('keeps edits out of the document and export while preview is disabled, then applies them when enabled', () => {
 const onCurves=vi.fn(),onLevels=vi.fn();render(<CurveEditor curves={defaultCurves()} levels={defaultLevels()} onCurves={onCurves} onLevels={onLevels}/>)
 fireEvent.click(screen.getByLabelText('预览曲线'))
 fireEvent.change(screen.getAllByLabelText('Y')[0],{target:{value:'.2'}})
 fireEvent.change(screen.getByLabelText('色阶中间调'),{target:{value:'2'}})
 expect(onCurves).not.toHaveBeenCalled();expect(onLevels).not.toHaveBeenCalled()
 fireEvent.click(screen.getByLabelText('预览曲线'))
 expect(onCurves).toHaveBeenCalledWith(expect.objectContaining({rgb:[{x:0,y:.2},{x:1,y:1}]}))
 expect(onLevels).toHaveBeenCalledWith({...defaultLevels(),gamma:2})
})
it('adds ordered distinct anchors repeatedly, rejects crossing edits, renders histogram and applies a preset',()=>{
 const onCurves=vi.fn(),onLevels=vi.fn();render(<CurveEditor curves={defaultCurves()} levels={defaultLevels()} histogram={[0,4,2]} onCurves={onCurves} onLevels={onLevels}/>)
 fireEvent.click(screen.getByText('添加锚点'));fireEvent.click(screen.getByText('添加锚点'))
 const c=onCurves.mock.calls.at(-1)![0];expect(c.rgb.map((p:any)=>p.x)).toEqual([0,.25,.5,1])
 const calls=onCurves.mock.calls.length
 fireEvent.change(screen.getAllByLabelText('X')[1],{target:{value:'.5'}})
 expect(onCurves).toHaveBeenCalledTimes(calls);expect(screen.getByRole('alert')).toHaveTextContent('横坐标')
 fireEvent.change(screen.getByLabelText('色阶黑场'),{target:{value:'1'}});expect(onLevels).not.toHaveBeenCalled()
 expect(screen.getByLabelText('曲线直方图背景').querySelectorAll('rect')).toHaveLength(3)
 fireEvent.click(screen.getByText('提亮预设'));expect(onCurves.mock.calls.at(-1)![0].rgb[1]).toEqual({x:.5,y:.65})
})
