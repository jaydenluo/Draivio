import {fireEvent,render,screen,within} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {LayerMenu} from './LayerMenu'
const items=[{id:'styles',label:'图层样式',children:[{id:'shadow',label:'投影…'},{id:'stroke',label:'描边…'}]},{id:'copy',label:'复制'}]
it('opens a submenu with hover or keyboard, closes only the submenu on Escape and dispatches once',()=>{
 const action=vi.fn(),close=vi.fn()
 render(<LayerMenu x={100} y={100} items={items} onAction={action} onClose={close}/>)
 const trigger=screen.getByRole('menuitem',{name:'图层样式'})
 fireEvent.pointerEnter(trigger)
 let child=screen.getByRole('menu',{name:'图层样式'})
 expect(trigger).toHaveAttribute('aria-expanded','true')
 fireEvent.pointerDown(within(child).getByRole('menuitem',{name:'投影…'}));expect(close).not.toHaveBeenCalled()
 fireEvent.keyDown(within(child).getByRole('menuitem',{name:'投影…'}),{key:'Escape'})
 expect(screen.queryByRole('menu',{name:'图层样式'})).not.toBeInTheDocument();expect(trigger).toHaveFocus();expect(close).not.toHaveBeenCalled()
 fireEvent.keyDown(trigger,{key:'ArrowRight'});child=screen.getByRole('menu',{name:'图层样式'})
 fireEvent.click(within(child).getByRole('menuitem',{name:'描边…'}))
 expect(action).toHaveBeenCalledExactlyOnceWith('stroke');expect(close).toHaveBeenCalledTimes(1)
})
it('clamps the nested menu and keeps disabled submenus closed',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:850,top:750,width:220,height:100,right:1070,bottom:850,x:850,y:750,toJSON(){}})
 const view=render(<LayerMenu x={1000} y={650} items={items} onAction={()=>{}} onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('menuitem',{name:'图层样式'}))
 expect(screen.getByRole('menu',{name:'图层样式'})).toHaveStyle({left:'630px',top:`${window.innerHeight-108}px`})
 view.unmount()
 render(<LayerMenu x={10} y={10} items={[{...items[0],disabled:true}]} onAction={()=>{}} onClose={()=>{}}/>)
 fireEvent.pointerEnter(screen.getByRole('menuitem',{name:'图层样式'}))
 expect(screen.queryByRole('menu',{name:'图层样式'})).not.toBeInTheDocument()
})
