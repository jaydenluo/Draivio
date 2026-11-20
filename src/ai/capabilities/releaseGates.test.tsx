import {fireEvent,render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {EditorProvider} from '../../state/editor'
import {TopBar} from '../../components/TopBar'
import {releaseGates,providerGate} from './releaseGates'
it('requires configured credentials and implemented protocol while keeping release approval separate from runtime integration',()=>{
 expect(releaseGates.officialCloud.available).toBe(true)
 expect(releaseGates.fullTarget.status).toBe('pending-verification')
 expect(providerGate({enabled:true,apiKey:'',protocol:'openai_compatible'}).available).toBe(false)
 expect(providerGate({enabled:true,apiKey:'session-secret',protocol:'openai_compatible'}).available).toBe(true)
 expect(providerGate({enabled:false,apiKey:'session-secret',protocol:'openai_compatible'}).available).toBe(false)
})
it('actual account UI offers login without fabricated balance or recharge packages',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 expect(screen.queryByText('1,280 积分')).not.toBeInTheDocument()
 expect(screen.getByText('登录云端')).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('账户设置'));fireEvent.click(screen.getByLabelText('云服务充值'))
 expect(screen.getByText(/登录共用云端账号后查询实际余额和可用模型/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'确认充值'})).not.toBeInTheDocument()
 expect(screen.queryByRole('group',{name:'积分套餐'})).not.toBeInTheDocument()
})

it('keeps file controls outside overflow tools and allows cancelling a document-size edit',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 expect(screen.getByRole('button',{name:'新建'}).closest('details')).toBeNull()
 expect(screen.getByRole('button',{name:'打开'}).closest('details')).toBeNull()
 fireEvent.click(screen.getByRole('menuitem',{name:'图像'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'画布大小'}))
 fireEvent.change(screen.getByLabelText('文档宽度'),{target:{value:'777'}})
 fireEvent.click(screen.getByRole('button',{name:'取消'}))
 expect(screen.queryByRole('dialog',{name:'文档尺寸设置'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('menuitem',{name:'图像'}));fireEvent.click(screen.getByRole('menuitem',{name:'画布大小'}))
 expect(screen.getByLabelText('文档宽度')).not.toHaveValue(777)
})
