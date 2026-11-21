import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {EditorProvider} from '../state/editor'
import {TopBar} from '../components/TopBar'
import {BillingDialog} from '../components/BillingDialog'
const account=vi.hoisted(()=>({snapshot:{authenticated:false,user:null as {email:string}|null,balance:null as number|null,models:[]},refreshAccount:vi.fn(),logout:vi.fn()}))
vi.mock('./cloudAccount',()=>({cloudAccount:{getOrigin:()=>'https://www.moviviz.com',getSnapshot:()=>account.snapshot,subscribe:()=>()=>{},refreshAccount:account.refreshAccount,logout:account.logout,cancelPendingAuthentication:vi.fn()}}))
beforeEach(()=>{account.snapshot={authenticated:false,user:null,balance:null,models:[]};account.refreshAccount.mockReset();account.logout.mockReset().mockResolvedValue(undefined)})
it('offers the real login form from the account menu while signed out',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 expect(screen.getByRole('button',{name:'账户设置'})).toHaveTextContent('登')
 expect(screen.getByRole('button',{name:'账户设置'})).not.toHaveTextContent('登录')
 fireEvent.click(screen.getByLabelText('账户设置'))
 expect(screen.queryByRole('button',{name:'退出登录'})).not.toBeInTheDocument()
 expect(screen.queryByText('当前未登录')).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:'登录 / 注册'})).toHaveClass('account-menu-item')
 expect(screen.getByText('登录后，快速使用AI能力')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'登录 / 注册'}))
 expect(screen.getByRole('dialog',{name:'Draivio 云端账号'})).toBeInTheDocument()
 expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
})
it('opens login directly from recharge when signed out and closes the account menu',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'账户设置'}))
 fireEvent.click(screen.getByRole('button',{name:'云服务充值'}))
 expect(screen.getByRole('dialog',{name:'Draivio 云端账号'})).toBeInTheDocument()
 expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
 expect(screen.queryByRole('dialog',{name:'云服务充值'})).not.toBeInTheDocument()
 expect(screen.queryByRole('dialog',{name:'账户设置'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'取消'}))
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('shows zero as a real queried balance, supports refresh, and exposes logout',async()=>{
 account.snapshot={authenticated:true,user:{email:'person@example.com'},balance:0,models:[]}
 const view=render(<EditorProvider><TopBar/></EditorProvider>)
 expect(screen.getByText('0 积分')).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('账户设置'))
 expect(screen.getByText('person@example.com')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'退出登录'}))
 await waitFor(()=>expect(account.logout).toHaveBeenCalledOnce())
 view.unmount();render(<BillingDialog onClose={vi.fn()}/>)
 expect(screen.getByRole('dialog',{name:'云服务充值'})).toHaveTextContent('当前余额 0 积分')
 fireEvent.click(screen.getByRole('button',{name:'刷新余额'}))
 await waitFor(()=>expect(account.refreshAccount).toHaveBeenCalledOnce())
})
it('keeps refresh failures visible without inventing a new balance',async()=>{
 account.snapshot={authenticated:true,user:{email:'person@example.com'},balance:12.5,models:[]}
 account.refreshAccount.mockRejectedValueOnce(new Error('offline'))
 render(<BillingDialog onClose={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'刷新余额'}))
 await screen.findByRole('alert')
 expect(screen.getByRole('dialog',{name:'云服务充值'})).toHaveTextContent('当前余额 12.5 积分')
})


it('opens login directly from the cloud recharge button in service sources',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 act(()=>window.dispatchEvent(new Event('draivio:service-settings')))
 fireEvent.click(screen.getByRole('button',{name:'充值'}))
 expect(screen.queryByRole('dialog',{name:'服务来源管理'})).not.toBeInTheDocument()
 expect(screen.getByRole('dialog',{name:'Draivio 云端账号'})).toBeInTheDocument()
 expect(screen.queryByRole('dialog',{name:'云服务充值'})).not.toBeInTheDocument()
})
it('opens the existing recharge window from cloud sources when authenticated',async()=>{
 account.snapshot={authenticated:true,user:{email:'person@example.com'},balance:0,models:[]}
 vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('fixture offline'))
 render(<EditorProvider><TopBar/></EditorProvider>)
 act(()=>window.dispatchEvent(new Event('draivio:service-settings')))
 fireEvent.click(screen.getByRole('button',{name:'充值'}))
 expect(screen.queryByRole('dialog',{name:'服务来源管理'})).not.toBeInTheDocument()
 expect(screen.getByRole('dialog',{name:'云服务充值'})).toBeInTheDocument()
 expect(screen.queryByRole('dialog',{name:'Draivio 云端账号'})).not.toBeInTheDocument()
 await screen.findByRole('alert')
})
