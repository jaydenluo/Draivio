import {fireEvent,render,screen,waitFor} from '@testing-library/react'
import {beforeEach,expect,it,vi} from 'vitest'
import {EditorProvider} from '../state/editor'
import {TopBar} from '../components/TopBar'
import {BillingDialog} from '../components/BillingDialog'
const account=vi.hoisted(()=>({snapshot:{authenticated:false,user:null as {email:string}|null,balance:null as number|null,models:[]},refreshAccount:vi.fn(),logout:vi.fn()}))
vi.mock('./cloudAccount',()=>({cloudAccount:{getOrigin:()=>'https://www.moviviz.com',getSnapshot:()=>account.snapshot,subscribe:()=>()=>{},refreshAccount:account.refreshAccount,logout:account.logout,cancelPendingAuthentication:vi.fn()}}))
beforeEach(()=>{account.snapshot={authenticated:false,user:null,balance:null,models:[]};account.refreshAccount.mockReset();account.logout.mockReset().mockResolvedValue(undefined)})
it('offers the real login form from the account menu while signed out',()=>{
 render(<EditorProvider><TopBar/></EditorProvider>)
 fireEvent.click(screen.getByLabelText('账户设置'))
 fireEvent.click(screen.getByRole('button',{name:'登录 / 注册'}))
 expect(screen.getByRole('dialog',{name:'Draivio 云端账号'})).toBeInTheDocument()
 expect(screen.getByLabelText('邮箱')).toBeInTheDocument()
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
 expect(screen.getByText('当前余额：0 积分')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'刷新余额'}))
 await waitFor(()=>expect(account.refreshAccount).toHaveBeenCalledOnce())
})
it('keeps refresh failures visible without inventing a new balance',async()=>{
 account.snapshot={authenticated:true,user:{email:'person@example.com'},balance:12.5,models:[]}
 account.refreshAccount.mockRejectedValueOnce(new Error('offline'))
 render(<BillingDialog onClose={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'刷新余额'}))
 await screen.findByRole('alert')
 expect(screen.getByText('当前余额：12.5 积分')).toBeInTheDocument()
})
