import {render,screen,fireEvent} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {ImageCapabilityEditor} from './ImageCapabilityEditor'
import type {ServiceConnection} from './serviceConnections'
const connection:ServiceConnection={id:'one',provider:'Custom',name:'custom',baseUrl:'https://provider.example/v1',apiKey:'fixture',protocol:'openai_compatible',models:['custom'],enabled:true}
it('requires explicit reference and mask semantics, with editable request encoding',()=>{
 const onChange=vi.fn();const view=render(<ImageCapabilityEditor connection={connection} model="custom" onChange={onChange}/> )
 expect(screen.getByText(/参考图未启用/)).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('custom 启用参考图编辑'))
 const caps=onChange.mock.calls[0][0];expect(caps).toMatchObject({edit:true,reference:true});expect(caps.maskedEdit).toBeUndefined()
 view.rerender(<ImageCapabilityEditor connection={{...connection,imageCapabilities:{custom:caps}}} model="custom" onChange={onChange}/> )
 fireEvent.change(screen.getByLabelText('custom 蒙版方向'),{target:{value:'white-edit'}})
 expect(onChange.mock.calls.at(-1)?.[0].maskedEdit).toEqual({semantics:'white-edit'})
 fireEvent.change(screen.getByLabelText('custom 图像传输'),{target:{value:'multipart'}})
 expect(onChange.mock.calls.at(-1)?.[0].encoding).toBe('multipart')
})
it('explains presets without an implemented adapter',()=>{
 render(<ImageCapabilityEditor connection={{...connection,protocol:'bfl'}} model="custom" onChange={vi.fn()}/> )
 expect(screen.getByText(/尚未接入图片适配器/)).toBeInTheDocument()
 expect(screen.queryByLabelText('custom 启用参考图编辑')).not.toBeInTheDocument()
})
