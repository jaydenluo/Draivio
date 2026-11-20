import {render,screen,within} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {RulerOverlay} from './RulerOverlay'
it('aligns document zero with the canvas origin instead of adding the ruler gutter twice',()=>{
 const rect=(left:number,top:number,width:number,height:number)=>({left,top,width,height,right:left+width,bottom:top+height,x:left,y:top,toJSON(){}})
 const anchor=document.createElement('div')
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){return this===anchor?rect(100,80,500,400):rect(0,0,500,400)})
 render(<RulerOverlay width={500} height={400} zoom={100} anchorRef={{current:anchor}}/>)
 const horizontal=screen.getByLabelText('拖出水平参考线'),vertical=screen.getByLabelText('拖出垂直参考线')
 const x=within(horizontal).getByText('0').closest('[data-ruler-tick]')!,y=within(vertical).getByText('0').closest('[data-ruler-tick]')!
 expect(Number.parseFloat(horizontal.style.left)+Number.parseFloat((x as HTMLElement).style.left)).toBe(100)
 expect(Number.parseFloat(vertical.style.top)+Number.parseFloat((y as HTMLElement).style.top)).toBe(80)
})
