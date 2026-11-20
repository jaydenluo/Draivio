import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {EditorProvider} from '../state/editor'
import {TopBar} from '../components/TopBar'
import {MessageHost} from '../components/MessageHost'
import {cloudAccount} from './cloudAccount'

const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status})
const calls:Array<{path:string;authorization?:string;body:Record<string,unknown>}> = []
let registration:()=>Response|Promise<Response>
beforeEach(async()=>{
 await cloudAccount.logout()
 calls.length=0
 registration=()=>reply({accessToken:'registration-access',refreshToken:'registration-refresh'},201)
 vi.spyOn(globalThis,'fetch').mockImplementation(async(url,init)=>{
  const path=new URL(String(url)).pathname
  calls.push({path,authorization:(init?.headers as Record<string,string>)?.Authorization,body:init?.body?JSON.parse(String(init.body)):{}})
  if(path==='/api/auth/register'||path==='/api/auth/email-codes/verify')return registration()
  if(path==='/api/auth/me')return reply({email:'new@example.test'})
  if(path.endsWith('/balance'))return reply({balance:'0'})
  if(path.endsWith('/models'))return reply({data:[]})
  if(path==='/api/auth/logout')return reply({})
  throw new Error(`Unexpected request: ${path}`)
 })
})
afterEach(async()=>{await act(async()=>{await cloudAccount.logout()});vi.restoreAllMocks();localStorage.clear()})

function openRegistration(withoutCode:boolean){
 render(<EditorProvider><TopBar/><MessageHost/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'账户设置'}))
 fireEvent.click(screen.getByRole('button',{name:'登录 / 注册'}))
 fireEvent.click(screen.getByRole('button',{name:'注册账户'}))
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'new@example.test'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'a-test-password'}})
 if(withoutCode)fireEvent.click(screen.getByRole('checkbox',{name:'免验证码注册'}))
 else fireEvent.change(screen.getByLabelText('验证码'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'注册'}))
}

it.each([false,true])('automatically signs in after registration (without code: %s)',async withoutCode=>{
 openRegistration(withoutCode)
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Draivio 云端账号'})).not.toBeInTheDocument())
 expect(cloudAccount.getSnapshot()).toMatchObject({authenticated:true,user:{email:'new@example.test'},balance:0})
 expect(screen.getByText('0 积分')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'账户设置'})).toHaveTextContent('NE')
 expect(screen.getAllByText('注册成功，已自动登录')).toHaveLength(1)
 expect(calls[0]).toMatchObject({path:withoutCode?'/api/auth/register':'/api/auth/email-codes/verify',body:{email:'new@example.test',password:'a-test-password'}})
 if(!withoutCode)expect(calls[0].body).toMatchObject({purpose:'register',code:'123456'})
 expect(calls.some(call=>call.path==='/api/auth/password-login')).toBe(false)
 // Closing the registration dialog must preserve the session for subsequent requests.
 await cloudAccount.request('/api/auth/me')
 expect(calls.at(-1)?.authorization).toBe('Bearer registration-access')
 fireEvent.click(screen.getByRole('button',{name:'账户设置'}))
 expect(screen.getByText('new@example.test')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'退出登录'})).toBeInTheDocument()
})

it('keeps a failed registration open and does not sign into an existing account',async()=>{
 registration=()=>reply({code:'ACCOUNT_EXISTS'},409)
 openRegistration(true)
 expect(await screen.findByRole('alert')).toHaveTextContent('该邮箱已注册，请直接登录')
 expect(screen.getByRole('dialog',{name:'Draivio 云端账号'})).toBeInTheDocument()
 expect(cloudAccount.getSnapshot().authenticated).toBe(false)
 expect(screen.queryByText('注册成功，已自动登录')).not.toBeInTheDocument()
 expect(calls).toHaveLength(1)
})

it('does not restore a session or show success after registration is cancelled',async()=>{
 let finish!:(response:Response)=>void
 registration=()=>new Promise(resolve=>{finish=resolve})
 openRegistration(true)
 await waitFor(()=>expect(calls).toHaveLength(1))
 fireEvent.click(screen.getByRole('button',{name:'取消'}))
 await act(async()=>finish(reply({accessToken:'late-access',refreshToken:'late-refresh'},201)))
 expect(cloudAccount.getSnapshot().authenticated).toBe(false)
 expect(screen.queryByText('注册成功，已自动登录')).not.toBeInTheDocument()
 expect(calls).toHaveLength(1)
})
