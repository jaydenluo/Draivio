import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DockWorkspace, type DockPanelDefinition } from './DockWorkspace'
const panels:DockPanelDefinition[]=[
 {id:'one',title:'一',component:()=> <input aria-label="面板一输入" defaultValue="保留"/>},
 {id:'two',title:'二',component:()=> <p>内容二</p>},
 {id:'three',title:'三',component:()=> <p>内容三</p>},
]
it('restores independent groups and active tabs, activates externally, and admits new registered panels',()=>{
 localStorage.setItem('dock-test',JSON.stringify([{id:'x',tabs:['one'],active:'one',collapsed:false,weight:2},{id:'y',tabs:['two','three'],active:'three',collapsed:false,weight:1}]))
 const view=render(<DockWorkspace panels={panels} storageKey="dock-test" selectedPanel="one"/>)
 expect(screen.getByText('内容三')).toBeVisible()
 expect(screen.getByText('内容二')).not.toBeVisible()
 const input=screen.getByRole('textbox',{name:'面板一输入'})
 fireEvent.change(input,{target:{value:'已修改'}})
 view.rerender(<DockWorkspace panels={[...panels,{id:'four',title:'四',component:()=> <p>内容四</p>}]} storageKey="dock-test" selectedPanel="two"/>)
 expect(screen.getByText('内容二')).toBeVisible()
 expect(screen.getByRole('button',{name:'四'})).toBeInTheDocument()
 expect(screen.getByRole('textbox',{name:'面板一输入'})).toBe(input)
 expect(input).toHaveValue('已修改')
 view.unmount()
 const next=render(<DockWorkspace panels={panels} storageKey="dock-test" selectedPanel="one"/>)
 expect(screen.getByText('内容二')).toBeVisible()
 expect(screen.queryByRole('button',{name:'四'})).not.toBeInTheDocument()
 next.unmount();localStorage.removeItem('dock-test')
})
it('removes a registered panel without leaving its previous content visible',()=>{
 const view=render(<DockWorkspace panels={panels}/>)
 view.rerender(<DockWorkspace panels={panels.slice(1)}/>)
 expect(screen.queryByRole('textbox',{name:'面板一输入'})).not.toBeInTheDocument()
 expect(screen.getByText('内容二')).toBeVisible()
})
