import {fireEvent,render,screen} from '@testing-library/react'
import {describe,expect,it,vi} from 'vitest'
import {TransformOverlay} from './TransformOverlay'
it('renders affine overlay transform for nested layer preview',()=>{render(<TransformOverlay draft={{kind:'transform',rect:{x:10,y:20,width:30,height:40},rotation:15,flipX:false,flipY:false,affine:[.8,.2,-.1,1.1,5,7]}} onChange={vi.fn()} onCommit={vi.fn()} onCancel={vi.fn()} toPoint={()=>({x:0,y:0})}/>);expect(screen.getByLabelText('自由变换边框')).toHaveStyle('transform: matrix(0.8, 0.2, -0.1, 1.1, 5, 7) rotate(15deg)')})
