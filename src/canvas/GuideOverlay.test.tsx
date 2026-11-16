import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { GuideOverlay } from './GuideOverlay'
import { defaultGuideSettings } from '../document/guides'
it('previews a guide drag and commits once, but rejects locked guides', () => {
 const commit=vi.fn(); const settings={...defaultGuideSettings(),guides:[{id:'a',axis:'x' as const,position:10,locked:false},{id:'b',axis:'y' as const,position:20,locked:true}]}
 render(<GuideOverlay settings={settings} width={100} height={100} toPoint={(x,y)=>({x,y})} onMove={commit}/> )
 const a=screen.getByLabelText('拖动参考线 a');fireEvent.pointerDown(a,{pointerId:1,clientX:10,clientY:0});fireEvent.pointerMove(a,{pointerId:1,clientX:30,clientY:0});expect(commit).not.toHaveBeenCalled();fireEvent.pointerUp(a,{pointerId:1,clientX:30,clientY:0});expect(commit).toHaveBeenCalledWith('a',30)
 const b=screen.getByLabelText('拖动参考线 b');fireEvent.pointerDown(b,{pointerId:2,clientX:0,clientY:20});fireEvent.pointerMove(b,{pointerId:2,clientX:0,clientY:50});fireEvent.pointerUp(b,{pointerId:2});expect(commit).toHaveBeenCalledTimes(1)
})

it('deletes an unlocked guide when its drag ends outside the document', () => {
 const move=vi.fn(); const remove=vi.fn(); const settings={...defaultGuideSettings(),guides:[{id:'a',axis:'x' as const,position:10,locked:false}]}
 render(<GuideOverlay settings={settings} width={100} height={100} toPoint={(x,y)=>({x,y})} onMove={move} onDelete={remove}/> )
 const line=screen.getByLabelText('拖动参考线 a')
 fireEvent.pointerDown(line,{pointerId:4,clientX:10,clientY:0})
 fireEvent.pointerMove(line,{pointerId:4,clientX:-20,clientY:0})
 fireEvent.pointerUp(line,{pointerId:4,clientX:-20,clientY:0})
 expect(remove).toHaveBeenCalledWith('a')
 expect(move).not.toHaveBeenCalled()
})
