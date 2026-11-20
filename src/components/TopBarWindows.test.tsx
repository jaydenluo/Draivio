import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider } from '../state/editor'
import { TopBar } from './TopBar'

afterEach(() => vi.restoreAllMocks())

test('opens board tools beside the shortcut strip outside header stacking and supports dragging and closing', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({left:840,top:12,right:950,bottom:44,width:110,height:32,x:840,y:12,toJSON(){}})
  render(<EditorProvider><TopBar /></EditorProvider>)
  fireEvent.click(screen.getByRole('menuitem',{name:'工具'}))
  fireEvent.click(screen.getByRole('menuitem',{name:'画板管理'}))
  const panel = screen.getByRole('dialog', {name:'画板管理'})
  expect(panel.parentElement).toBe(document.body)
  expect(panel.style.position).toBe('fixed')
  expect(parseFloat(panel.style.left)).toBeGreaterThan(200)
  expect(parseFloat(panel.style.top)).toBe(52)
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({left:310,top:52,right:950,bottom:352,width:640,height:300,x:310,y:52,toJSON(){}})
  fireEvent.pointerDown(within(panel).getByText('画板管理',{selector:'strong'}), {pointerId:1,button:0,clientX:400,clientY:70})
  fireEvent.pointerMove(window,{pointerId:1,clientX:300,clientY:140})
  fireEvent.pointerUp(window,{pointerId:1})
  expect(panel.style.translate).toBe('-100px 70px')
  fireEvent.click(within(panel).getByRole('button',{name:'关闭画板管理'}))
  expect(screen.queryByRole('dialog',{name:'画板管理'})).toBeNull()
  expect(screen.getByRole('toolbar',{name:'快捷操作'})).toHaveFocus()
})

test.each(['RAW 显影','画布大小'])('%s opens an independent window from its image menu', name => {
  render(<EditorProvider><TopBar /></EditorProvider>)
  fireEvent.click(screen.getByRole('menuitem',{name:'图像'}))
  fireEvent.click(screen.getByRole('menuitem',{name}))
  const child = screen.getByRole('dialog',{name:name==='画布大小'?'文档尺寸设置':name})
  expect(child.closest('.app-titlebar')).toBeNull()
  expect(child.parentElement?.parentElement).toBe(document.body)
  fireEvent.keyDown(child,{key:'Escape'})
  expect(child).not.toBeInTheDocument()
})

test('board duplication opens above the parent window',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 fireEvent.click(screen.getByRole('menuitem',{name:'工具'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'画板管理'}))
 const parent=screen.getByRole('dialog',{name:'画板管理'})
 fireEvent.click(within(parent).getByRole('button',{name:'复制规格'}))
 const child=screen.getByRole('dialog',{name:'画板规格复制'})
 expect(parent).not.toContainElement(child)
 expect(child.parentElement?.parentElement).toBe(document.body)
 fireEvent.keyDown(child,{key:'Escape'})
 expect(child).not.toBeInTheDocument()
 expect(parent).toBeInTheDocument()
})

test('account window also escapes the header and dismisses on outside click', () => {
  render(<EditorProvider><TopBar /></EditorProvider>)
  fireEvent.click(screen.getByRole('button',{name:'账户设置'}))
  const panel=screen.getByRole('dialog',{name:'账户设置'})
  expect(panel.parentElement).toBe(document.body)
  expect(panel.style.position).toBe('fixed')
  fireEvent.pointerDown(document.body)
  expect(screen.queryByRole('dialog',{name:'账户设置'})).toBeNull()
})
