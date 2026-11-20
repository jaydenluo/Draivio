import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {CloudAccountDialog} from './CloudAccountDialog'
import {MessageHost} from '../components/MessageHost'
import {RequestError} from '../lib/http'

vi.mock('./CloudServiceConfig',()=>({CloudServiceConfig:()=>null}))
const api=vi.hoisted(()=>({getOrigin:vi.fn(),codeLogin:vi.fn(),requestCode:vi.fn(),passwordLogin:vi.fn(),register:vi.fn(),registerWithoutCode:vi.fn(),resetPassword:vi.fn(),cancelPendingAuthentication:vi.fn()}))
vi.mock('./cloudAccount',()=>({cloudAccount:api}))
beforeEach(()=>{localStorage.clear();Object.values(api).forEach(fn=>fn.mockReset());api.getOrigin.mockReturnValue('https://cloud.test')})
afterEach(()=>vi.useRealTimers())

it('remembers a successful password login by default and closes only on success',async()=>{
 const close=vi.fn();render(<><CloudAccountDialog onClose={close}/><MessageHost/></>)
 expect(screen.queryByText(/使用与幕影相同的云端账号/)).not.toBeInTheDocument()
 expect(screen.queryByText('云服务地址')).not.toBeInTheDocument()
 expect(screen.getByRole('checkbox',{name:'记住账号与密码'})).toBeChecked()
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
 api.passwordLogin.mockRejectedValueOnce(new Error('邮箱或密码不正确'))
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await screen.findByRole('alert');expect(close).not.toHaveBeenCalled()
 expect(JSON.stringify(localStorage)).not.toContain('not-a-real-secret')
 api.passwordLogin.mockResolvedValueOnce(undefined)
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 expect(api.passwordLogin).toHaveBeenLastCalledWith('person@example.com','not-a-real-secret')
 expect(JSON.stringify(localStorage)).toContain('not-a-real-secret')
})

function fillLogin(){
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
}
async function rememberLogin(){
 const close=vi.fn(),view=render(<CloudAccountDialog onClose={close}/> )
 fillLogin();fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 view.unmount()
}

it('prefills remembered credentials when reopened and uses the shared checkbox',async()=>{
 await rememberLogin()
 render(<CloudAccountDialog onClose={vi.fn()}/> )
 expect(screen.getByRole('checkbox',{name:'记住账号与密码'})).toBeChecked()
 expect(screen.getByRole('checkbox')).toHaveClass('app-checkbox')
 expect(screen.getByLabelText('邮箱')).toHaveValue('person@example.com')
 expect(screen.getByLabelText('密码')).toHaveValue('not-a-real-secret')
 expect(screen.getByLabelText('密码')).toHaveAttribute('type','password')
 expect(api.passwordLogin).toHaveBeenCalledOnce()
})

it('clears saved credentials immediately on opting out and remembers the choice',async()=>{
 await rememberLogin()
 const view=render(<CloudAccountDialog onClose={vi.fn()}/> )
 fireEvent.click(screen.getByRole('checkbox',{name:'记住账号与密码'}))
 expect(JSON.stringify(localStorage)).not.toContain('not-a-real-secret')
 view.unmount();render(<CloudAccountDialog onClose={vi.fn()}/> )
 expect(screen.getByRole('checkbox',{name:'记住账号与密码'})).not.toBeChecked()
 expect(screen.getByLabelText('密码')).toHaveValue('')
 fillLogin();fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await waitFor(()=>expect(api.passwordLogin).toHaveBeenCalledTimes(2))
 expect(JSON.stringify(localStorage)).not.toContain('not-a-real-secret')
})

it('does not overwrite remembered credentials on failed login or unsubmitted changes',async()=>{
 await rememberLogin()
 const view=render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'wrong-password'}})
 api.passwordLogin.mockRejectedValueOnce(new Error('INVALID_CREDENTIALS'))
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await screen.findByRole('alert')
 view.unmount();render(<CloudAccountDialog onClose={vi.fn()}/> )
 expect(screen.getByLabelText('密码')).toHaveValue('not-a-real-secret')
 expect(JSON.stringify(localStorage)).not.toContain('wrong-password')
})

it('isolates remembered credentials by cloud service address',async()=>{
 await rememberLogin()
 api.getOrigin.mockReturnValue('https://another-cloud.test')
 render(<CloudAccountDialog onClose={vi.fn()}/> )
 expect(screen.getByRole('checkbox',{name:'记住账号与密码'})).toBeChecked()
 expect(screen.getByLabelText('邮箱')).toHaveValue('')
 expect(screen.getByLabelText('密码')).toHaveValue('')
})

it('blocks submitting remembered credentials if the service changes while the dialog is open',async()=>{
 await rememberLogin()
 render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 api.getOrigin.mockReturnValue('https://another-cloud.test')
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('云服务地址已变更，请关闭窗口后重新登录')
 expect(api.passwordLogin).toHaveBeenCalledOnce()
})

it('does not fill saved passwords in registration or recovery, and restores them only for the same login email',async()=>{
 await rememberLogin()
 render(<CloudAccountDialog onClose={vi.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:'注册账户'}))
 expect(screen.getByLabelText('密码')).toHaveValue('')
 expect(screen.queryByRole('checkbox',{name:'记住账号与密码'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'找回密码'}))
 expect(screen.getByLabelText('新密码')).toHaveValue('')
 fireEvent.click(screen.getByRole('button',{name:'登录账户'}))
 expect(screen.getByLabelText('密码')).toHaveValue('not-a-real-secret')
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'someone-else@example.com'}})
 expect(screen.getByLabelText('密码')).toHaveValue('')
})

it('still closes after login if storage is unavailable and reports the save failure',async()=>{
 const close=vi.fn();render(<><CloudAccountDialog onClose={close}/><MessageHost/></>)
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('test storage unavailable')})
 try{
  fillLogin();fireEvent.click(screen.getByRole('button',{name:'登录'}))
  await waitFor(()=>expect(close).toHaveBeenCalledOnce())
  expect(screen.getByText('已登录，但未能记住账号与密码')).toBeInTheDocument()
 }finally{storage.mockRestore()}
})

it('removes an old remembered password after resetting the same account',async()=>{
 await rememberLogin()
 const view=render(<CloudAccountDialog onClose={vi.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:'找回密码'}))
 fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'a-replacement-password'}})
 fireEvent.change(screen.getByLabelText('验证码'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'重置密码'}))
 await screen.findByText('密码已重置，请使用新密码登录')
 expect(JSON.stringify(localStorage)).not.toContain('not-a-real-secret')
 view.unmount();render(<CloudAccountDialog onClose={vi.fn()}/> )
 expect(screen.getByLabelText('邮箱')).toHaveValue('person@example.com')
 expect(screen.getByLabelText('密码')).toHaveValue('')
})

it('does not claim stored credentials were cleared when the storage update fails',async()=>{
 await rememberLogin()
 render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('test storage unavailable')})
 try{
  fireEvent.click(screen.getByRole('checkbox',{name:'记住账号与密码'}))
  expect(screen.getByRole('checkbox')).toBeChecked()
  expect(screen.getByText('未能更新记住密码设置，请重试')).toBeInTheDocument()
 }finally{storage.mockRestore()}
})

it('shows a credential error when the cloud returns INVALID_PASSWORD',async()=>{
 const close=vi.fn();render(<><CloudAccountDialog onClose={close}/><MessageHost/></>)
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
 api.passwordLogin.mockRejectedValueOnce(new Error('INVALID_PASSWORD'))
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码不正确')
 expect(close).not.toHaveBeenCalled()
})

it.each(['login','code'] as const)('shows %s request failures only in the shared message',async mode=>{
 render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 if(mode==='login'){
  fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
  api.passwordLogin.mockRejectedValueOnce(new Error('RATE_LIMITED'))
  fireEvent.click(screen.getByRole('button',{name:'登录'}))
 }else{
  fireEvent.click(screen.getByRole('button',{name:'验证码登录'}))
  api.requestCode.mockRejectedValueOnce(new Error('RATE_LIMITED'))
  fireEvent.click(screen.getByRole('button',{name:'发送验证码'}))
 }
 await waitFor(()=>expect(screen.getAllByText('操作过于频繁，请稍后再试')).toHaveLength(1))
 expect(screen.getByRole('alert')).toHaveClass('app-message')
 expect(screen.getByRole('button',{name:mode==='login'?'登录':'发送验证码'})).toBeEnabled()
})

it('keeps local validation in the form without sending a request or message',()=>{
 render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 fireEvent.submit(screen.getByRole('dialog').querySelector('form')!)
 expect(screen.getByRole('alert')).toHaveTextContent('请输入有效邮箱')
 expect(screen.getByRole('alert')).not.toHaveClass('app-message')
 expect(api.passwordLogin).not.toHaveBeenCalled()
 expect(api.requestCode).not.toHaveBeenCalled()
})

it.each([
 [new Error('DEVICE_LIMIT_REACHED'),'登录设备已达 3 台上限，请在已登录设备中移除旧设备后重试'],
 [new RequestError('network','private response'),'无法连接云服务，请检查服务地址、网络或跨域设置'],
 [new RequestError('timeout','private response'),'云服务请求超时，请稍后重试'],
 [new Error('HTTP_503'),'云服务请求失败（HTTP 503），请稍后重试'],
 [Object.assign(new Error('UNRECOGNIZED_SERVER_CODE'),{name:'CloudAccountError'}),'云服务未能完成账号请求，请稍后重试'],
 [new RequestError('native','private response'),'本机未能完成云服务请求，请重试或更新客户端'],
 [new TypeError('private response'),'客户端未能完成登录请求，请刷新页面后重试'],
])('distinguishes login failures without showing raw error text: %s',async(reason,text)=>{
 render(<><CloudAccountDialog onClose={vi.fn()}/><MessageHost/></>)
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
 api.passwordLogin.mockRejectedValueOnce(reason)
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 expect(await screen.findByRole('alert')).toHaveTextContent(text)
 expect(screen.queryByText(/private response/)).not.toBeInTheDocument()
 expect(screen.getAllByRole('alert')).toHaveLength(1)
})

it('uses the same register and password-reset purposes as the shared cloud',async()=>{
 render(<CloudAccountDialog onClose={vi.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:'注册账户'}))
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'new@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'a-long-password'}})
 fireEvent.click(screen.getByRole('button',{name:'发送验证码'}))
 await waitFor(()=>expect(api.requestCode).toHaveBeenCalledWith('new@example.com','register'))
 fireEvent.change(screen.getByLabelText('验证码'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'注册'}))
 await waitFor(()=>expect(api.register).toHaveBeenCalledWith('new@example.com','123456','a-long-password'))
 fireEvent.click(screen.getByRole('button',{name:'找回密码'}))
 fireEvent.change(screen.getByLabelText('新密码'),{target:{value:'replacement-password'}})
 fireEvent.change(screen.getByLabelText('验证码'),{target:{value:'654321'}})
 fireEvent.click(screen.getByRole('button',{name:'重置密码'}))
 await waitFor(()=>expect(api.resetPassword).toHaveBeenCalledWith('new@example.com','654321','replacement-password'))
 await screen.findByText('密码已重置，请使用新密码登录')
})

it('registers without a code only after opting in and warns about email recovery',async()=>{
 const close=vi.fn();render(<CloudAccountDialog onClose={close}/>)
 fireEvent.click(screen.getByRole('button',{name:'注册账户'}))
 const skip=screen.getByRole('checkbox',{name:'免验证码注册'})
 expect(skip).not.toBeChecked()
 expect(skip).toHaveClass('app-checkbox')
 fireEvent.click(skip)
 expect(screen.getByText('请确保邮箱地址正确，否则无法找回密码。')).toBeInTheDocument()
 expect(screen.queryByLabelText('验证码')).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'发送验证码'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'new@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'a-long-password'}})
 fireEvent.click(screen.getByRole('button',{name:'注册'}))
 await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 expect(api.registerWithoutCode).toHaveBeenCalledWith('new@example.com','a-long-password')
 expect(api.requestCode).not.toHaveBeenCalled();expect(api.register).not.toHaveBeenCalled()
})

it('restores code validation on opt-out and keeps password recovery verified',()=>{
 render(<CloudAccountDialog onClose={vi.fn()}/>)
 fireEvent.click(screen.getByRole('button',{name:'注册账户'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'免验证码注册'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'免验证码注册'}))
 expect(screen.getByLabelText('验证码')).toBeRequired()
 expect(screen.queryByText('请确保邮箱地址正确，否则无法找回密码。')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:'免验证码注册'}))
 fireEvent.click(screen.getByRole('button',{name:'找回密码'}))
 expect(screen.getByLabelText('验证码')).toBeRequired()
 expect(screen.queryByRole('checkbox',{name:'免验证码注册'})).not.toBeInTheDocument()
})

it('invalidates pending authentication on close and ignores its late UI completion',async()=>{
 let finish!:()=>void;api.passwordLogin.mockImplementation(()=>new Promise<void>(r=>{finish=r}))
 const close=vi.fn(),view=render(<CloudAccountDialog onClose={close}/> )
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'person@example.com'}})
 fireEvent.change(screen.getByLabelText('密码'),{target:{value:'not-a-real-secret'}})
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await waitFor(()=>expect(api.passwordLogin).toHaveBeenCalledOnce())
 view.unmount();expect(api.cancelPendingAuthentication).toHaveBeenCalled()
 await act(async()=>finish());expect(close).not.toHaveBeenCalled()
 expect(JSON.stringify(localStorage)).not.toContain('not-a-real-secret')
})

it('supports code login without asking for a password',async()=>{
 const close=vi.fn();render(<CloudAccountDialog onClose={close}/>)
 fireEvent.click(screen.getByRole('button',{name:'验证码登录'}))
 expect(screen.queryByLabelText('密码')).not.toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('邮箱'),{target:{value:'member@example.com'}})
 fireEvent.click(screen.getByRole('button',{name:'发送验证码'}))
 await waitFor(()=>expect(api.requestCode).toHaveBeenCalledWith('member@example.com','login'))
 fireEvent.change(screen.getByLabelText('验证码'),{target:{value:'123456'}})
 fireEvent.click(screen.getByRole('button',{name:'登录'}))
 await waitFor(()=>expect(api.codeLogin).toHaveBeenCalledWith('member@example.com','123456'))
 expect(close).toHaveBeenCalledOnce();expect(api.passwordLogin).not.toHaveBeenCalled()
})
