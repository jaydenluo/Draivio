import { fireEvent,render,screen } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { defaultLevels,createLevelsSampler,validateLevels } from '../adjustments/levels'
import { LevelsGraph,levelsHandlePosition,moveLevelsHandle } from './LevelsGraph'
import { CurveEditor } from './CurveEditor'
import { defaultCurves } from '../adjustments/curves'
it('uses the actual gamma midpoint, follows input endpoints and matches pixel sampling',()=>{
 const p={...defaultLevels(),inputBlack:.2,inputWhite:.8,gamma:2}
 expect(levelsHandlePosition(p,'gamma')).toBeCloseTo(.35)
 expect(createLevelsSampler(p)(levelsHandlePosition(p,'gamma'))).toBeCloseTo(.5)
 expect(moveLevelsHandle(defaultLevels(),'gamma',.25).gamma).toBe(2)
 expect(moveLevelsHandle(defaultLevels(),'gamma',.75).gamma).toBeLessThan(1)
})
it('clamps input/output endpoints and keeps every extreme drag valid',()=>{
 for(const key of ['inputBlack','inputWhite','gamma','outputBlack','outputWhite'] as const)for(const x of [-10,0,.5,1,10])expect(()=>validateLevels(moveLevelsHandle(defaultLevels(),key,x))).not.toThrow()
 expect(moveLevelsHandle(defaultLevels(),'inputBlack',1).inputBlack).toBeCloseTo(254/255)
 expect(moveLevelsHandle(defaultLevels(),'inputWhite',0).inputWhite).toBeCloseTo(1/255)
 const p={...defaultLevels(),outputWhite:.4};expect(moveLevelsHandle(p,'outputBlack',.9).outputBlack).toBe(.4)
})
it('keeps handles synchronized with externally changed numeric values and renders supplied bins',()=>{
 const props={levels:defaultLevels(),histogram:[0,4,2],onPreview:vi.fn(),onCommit:vi.fn(),onCancel:vi.fn()}
 const view=render(<LevelsGraph {...props}/>);expect(screen.getByLabelText('输入色阶直方图').querySelectorAll('.levels-histogram-bin')).toHaveLength(3)
 view.rerender(<LevelsGraph {...props} levels={{...defaultLevels(),inputBlack:.2}}/>)
 expect(screen.getByRole('slider',{name:'输入黑场滑块'})).toHaveAttribute('aria-valuenow','51')
 expect(screen.getByRole('slider',{name:'输入黑场滑块'})).toHaveStyle({left:'20%'})
})
it('cancels on pointer loss and blur without committing, and never edits disabled controls',()=>{
 const commit=vi.fn(),preview=vi.fn(),cancel=vi.fn(),props={levels:defaultLevels(),onPreview:preview,onCommit:commit,onCancel:cancel}
 const view=render(<LevelsGraph {...props}/>),rail=screen.getByTestId('input-levels-rail'),black=screen.getByRole('slider',{name:'输入黑场滑块'})
 vi.spyOn(rail,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:255,height:20,right:255,bottom:20,x:0,y:0,toJSON(){}})
 fireEvent.pointerDown(black,{button:0,pointerId:1,clientX:0});fireEvent.pointerMove(rail,{pointerId:1,clientX:50});fireEvent.pointerCancel(rail,{pointerId:1})
 expect(cancel).toHaveBeenLastCalledWith(defaultLevels());expect(commit).not.toHaveBeenCalled()
 fireEvent.pointerDown(black,{button:0,pointerId:2,clientX:0});fireEvent.pointerMove(rail,{pointerId:2,clientX:40});fireEvent.blur(window)
 expect(cancel).toHaveBeenCalledTimes(2)
 view.rerender(<LevelsGraph {...props} disabled/>);preview.mockClear()
 fireEvent.pointerDown(black,{button:0,pointerId:3,clientX:0});fireEvent.pointerMove(rail,{pointerId:3,clientX:60});fireEvent.keyDown(black,{key:'ArrowRight'})
 expect(preview).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled();expect(black).toBeDisabled()
})
it('clicks the histogram to move the nearest handle and resets through the editor',()=>{
 const commit=vi.fn();render(<CurveEditor curves={defaultCurves()} levels={defaultLevels()} onCurves={vi.fn()} onLevels={commit}/>)
 fireEvent.click(screen.getByRole('tab',{name:'色阶'}));const rail=screen.getByTestId('input-levels-rail')
 vi.spyOn(rail,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:255,height:20,right:255,bottom:20,x:0,y:0,toJSON(){}})
 const histogram=screen.getByLabelText('输入色阶直方图')
 fireEvent.pointerDown(histogram,{button:0,pointerId:4,clientX:20});fireEvent.pointerUp(histogram,{pointerId:4})
 expect(commit).toHaveBeenLastCalledWith({...defaultLevels(),inputBlack:20/255})
 fireEvent.click(screen.getByRole('button',{name:'重置色阶'}));expect(commit).toHaveBeenLastCalledWith(defaultLevels())
})
