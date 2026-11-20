import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useState } from 'react'
import { CurveGraph, constrainCurvePoint } from './CurveGraph'
import { createCurveSampler, validateCurve, type CurvePoint } from '../adjustments/curves'
const identity = [{x:0,y:0},{x:1,y:1}]
function setup(initial: CurvePoint[] = identity, disabled = false) {
 const live = vi.fn(), commit = vi.fn(), cancel = vi.fn()
 function Harness() {
  const [points, setPoints] = useState(initial), [selected, setSelected] = useState(0)
  return <CurveGraph points={points} selected={selected} onSelect={setSelected} disabled={disabled} onPreview={next=>{setPoints(next);live(next)}} onCommit={next=>{setPoints(next);commit(next)}} onCancel={next=>{setPoints(next);cancel(next)}} />
 }
 render(<Harness />)
 const graph = screen.getByRole('group',{name:'曲线编辑区域'})
 vi.spyOn(graph,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:256,height:256,right:256,bottom:256,x:0,y:0,toJSON(){}})
 return {graph,live,commit,cancel}
}
it('adds and drags a point with live preview, then commits exactly once',()=>{
 const {graph,live,commit}=setup()
 fireEvent.pointerDown(graph,{button:0,pointerId:1,clientX:128,clientY:128})
 fireEvent.pointerMove(graph,{pointerId:1,clientX:151.2,clientY:81.6})
 expect(live).toHaveBeenCalled();expect(commit).not.toHaveBeenCalled()
 fireEvent.pointerUp(graph,{pointerId:1,clientX:151.2,clientY:81.6})
 expect(commit).toHaveBeenCalledTimes(1)
 expect(commit.mock.calls[0][0][1].x).toBeCloseTo(.6)
 expect(commit.mock.calls[0][0][1].y).toBeCloseTo(.7)
})
it('cancels a drag with Escape, pointercancel and window blur',()=>{
 const {graph,commit,cancel}=setup()
 for(const event of ['escape','pointercancel','blur']){
  fireEvent.pointerDown(graph,{button:0,pointerId:1,clientX:128,clientY:128})
  fireEvent.pointerMove(graph,{pointerId:1,clientX:151,clientY:80})
  if(event==='escape')fireEvent.keyDown(graph,{key:'Escape'})
  if(event==='pointercancel')fireEvent.pointerCancel(graph,{pointerId:1})
  if(event==='blur')fireEvent(window,new Event('blur'))
  expect(cancel.mock.calls.at(-1)?.[0]).toEqual(identity)
 }
 expect(commit).not.toHaveBeenCalled()
})
it('constrains points to neighbours, keeps endpoint x fixed and supports keyboard deletion',()=>{
 const {graph,commit}=setup([{x:0,y:0},{x:.5,y:.5},{x:1,y:1}])
 const middle=screen.getByRole('button',{name:'曲线控制点 2'})
 fireEvent.pointerDown(middle,{button:0,pointerId:1,clientX:128,clientY:128})
 fireEvent.pointerMove(graph,{pointerId:1,clientX:400,clientY:-20})
 fireEvent.pointerUp(graph,{pointerId:1})
 expect(commit.mock.calls[0][0][1].x).toBeLessThan(1)
 const endpoint=screen.getByRole('button',{name:'曲线控制点 1'})
 fireEvent.keyDown(endpoint,{key:'ArrowRight'})
 expect(commit.mock.calls.at(-1)?.[0][0].x).toBe(0)
 fireEvent.keyDown(middle,{key:'Delete'})
 expect(commit.mock.calls.at(-1)?.[0]).toHaveLength(2)
})
it('plots the same smooth curve as the pixel sampler and never edits disabled graphs',()=>{
 const points=[{x:0,y:0},{x:.5,y:.25},{x:1,y:1}]
 const {graph,live,commit}=setup(points,true)
 const path=graph.querySelector('[data-curve-path]')!
 const coordinates=path.getAttribute('points')!.split(' ').map(pair=>pair.split(',').map(Number))
 expect(coordinates[64][1]).toBeCloseTo(244-createCurveSampler(points)(.25)*232,3)
 fireEvent.pointerDown(graph,{button:0,pointerId:1,clientX:100,clientY:100})
 fireEvent.pointerMove(graph,{pointerId:1,clientX:200,clientY:20});fireEvent.pointerUp(graph,{pointerId:1})
 expect(live).not.toHaveBeenCalled();expect(commit).not.toHaveBeenCalled()
})

it('keeps tightly spaced imported anchors valid when there is no horizontal drag room',()=>{
 const points=[{x:0,y:0},{x:.5,y:.2},{x:.5000011,y:.3},{x:.5000022,y:.4},{x:1,y:1}]
 const next=constrainCurvePoint(points,2,{x:.9,y:.35})
 expect(()=>validateCurve(next)).not.toThrow()
 expect(next[2].x).toBe(points[2].x)
 expect(next[2].y).toBe(.35)
})
