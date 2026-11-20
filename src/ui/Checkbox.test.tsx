import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Checkbox } from './Checkbox'
it('keeps native labeling, change events, disabled state and refs',()=>{
 const change=vi.fn(),ref=createRef<HTMLInputElement>()
 const view=render(<label><Checkbox ref={ref} defaultChecked onChange={change}/>锁定比例</label>)
 const box=screen.getByRole('checkbox',{name:'锁定比例'})
 expect(ref.current).toBe(box);expect(box).toBeChecked();expect(box).toHaveClass('app-checkbox')
 fireEvent.click(screen.getByText('锁定比例'))
 expect(change).toHaveBeenCalledOnce();expect(box).not.toBeChecked()
 view.rerender(<label><Checkbox disabled indeterminate/>锁定比例</label>)
 expect(box).toBeDisabled();expect((box as HTMLInputElement).indeterminate).toBe(true)
 view.rerender(<label><Checkbox/>锁定比例</label>)
 expect((box as HTMLInputElement).indeterminate).toBe(false)
})
