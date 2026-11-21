import {useEffect, useRef, useState, type FormEvent} from 'react'
import {SettingsDialog} from '../components/SettingsDialog'
import {DialogTitlebar} from '../ui/DialogTitlebar'
import {Checkbox} from '../ui/Checkbox'
import {message} from '../ui/message'
import {RequestError} from '../lib/http'
import {cloudAccount} from './cloudAccount'
import {readRememberedLogin,writeRememberedLogin} from './rememberedLogin'
import {supportsRememberedSession} from './cloudSessionStorage'
import './cloudAccount.css'

type Mode='login'|'code'|'register'|'reset'
const accountErrors:Record<string,string>={
 DEVICE_LIMIT_REACHED:'登录设备已达 3 台上限，请在已登录设备中移除旧设备后重试',
 CLOUD_NETWORK_UNAVAILABLE:'无法连接云服务，请检查服务地址、网络或跨域设置',CLOUD_TIMEOUT:'云服务请求超时，请稍后重试',
 INVALID_CLOUD_ORIGIN:'云服务地址无效，请检查服务配置',INVALID_CLOUD_PATH:'客户端请求路径无效，请更新客户端后重试',
 INVALID_CLOUD_RESPONSE:'云服务返回格式异常，请稍后重试',CLOUD_RESPONSE_INTERRUPTED:'云服务响应中断，请稍后重试',
 RATE_LIMIT_UNAVAILABLE:'登录保护服务暂时不可用，请稍后重试',INVALID_SESSION_RESPONSE:'云服务返回的登录信息不完整，请稍后重试',
 INVALID_REGISTRATION_DEVICE:'客户端注册信息无效，请刷新页面或更新客户端后重试',
 INVALID_CREDENTIALS:'邮箱或密码不正确',INVALID_EMAIL:'请输入有效邮箱',INVALID_PASSWORD:'密码需要 8 至 128 位',INVALID_CODE:'验证码不正确或已过期',INVALID_RESET:'重置验证码不正确或已过期',ACCOUNT_EXISTS:'该邮箱已注册，请直接登录',ACCOUNT_NOT_FOUND:'该邮箱尚未注册',ACCOUNT_SUSPENDED:'该账号暂时不可用，请联系服务方',RATE_LIMITED:'操作过于频繁，请稍后再试',EMAIL_SENDER_BLOCKED:'验证码邮件暂时无法发送，请联系服务方',EMAIL_UNAVAILABLE:'验证码邮件服务暂时不可用，请稍后再试',SESSION_CHANGED:'登录操作已取消，请重试',INVALID_MODEL_CATALOG:'账号已验证，但模型目录读取失败，请稍后重新登录',INVALID_ACCOUNT_RESPONSE:'账号信息读取失败，请稍后重新登录',
}
function accountErrorText(reason:unknown,mode:Mode){
 const code=reason instanceof Error?reason.message:''
 if(code==='INVALID_PASSWORD'&&mode==='login')return '邮箱或密码不正确'
 if(accountErrors[code])return accountErrors[code]
 if(reason instanceof RequestError){
  if(reason.kind==='network')return accountErrors.CLOUD_NETWORK_UNAVAILABLE
  if(reason.kind==='timeout')return accountErrors.CLOUD_TIMEOUT
  if(reason.kind==='cancelled')return '登录请求已取消'
  if(reason.kind==='invalid-response')return accountErrors.INVALID_CLOUD_RESPONSE
 }
 const http=/^HTTP_(\d{3})$/.exec(code)
 if(http)return `云服务请求失败（HTTP ${http[1]}），请稍后重试`
 if(reason instanceof Error&&reason.name==='CloudAccountError')return '云服务未能完成账号请求，请稍后重试'
 if(reason instanceof RequestError)return '本机未能完成云服务请求，请重试或更新客户端'
 return '客户端未能完成登录请求，请刷新页面后重试'
}
export function CloudAccountDialog({onClose}:{onClose:()=>void}){
 const [origin]=useState(()=>cloudAccount.getOrigin())
 const canRemember=supportsRememberedSession()
 const [remembered,setRemembered]=useState(()=>readRememberedLogin(origin))
 const [mode,setMode]=useState<Mode>('login'),[email,setEmail]=useState(remembered.email),[password,setPassword]=useState(''),[code,setCode]=useState('')
 const [skipRegistrationCode,setSkipRegistrationCode]=useState(false)
 const needsCode=mode==='code'||mode==='reset'||(mode==='register'&&!skipRegistrationCode)
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[remaining,setRemaining]=useState(0)
 const mounted=useRef(true),epoch=useRef(0)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;cloudAccount.cancelPendingAuthentication()}},[])
 useEffect(()=>{if(remaining<=0)return;const timer=setTimeout(()=>setRemaining(n=>n-1),1000);return()=>clearTimeout(timer)},[remaining])
 const switchMode=(next:Mode)=>{epoch.current++;cloudAccount.cancelPendingAuthentication();setMode(next);setSkipRegistrationCode(false);setPassword('');setCode('');setError('');setNotice('');setBusy(false)}
 const changeRemember=(remember:boolean)=>{
  const next={remember,email:remembered.email}
  if(writeRememberedLogin(origin,next))setRemembered(next)
  else message.warning('未能更新保持登录设置，请重试',{key:'cloud-account'})
 }
 const fail=(reason:unknown)=>message.error(accountErrorText(reason,mode),{key:'cloud-account'})
 const sameOrigin=()=>{
  if(cloudAccount.getOrigin()===origin)return true
  message.error('云服务地址已变更，请关闭窗口后重新登录',{key:'cloud-account'})
  return false
 }
 const send=async()=>{
  if(busy||remaining)return
  if(!sameOrigin())return
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('请输入有效邮箱');return}
  const attempt=epoch.current;setBusy(true);setError('')
  try{await cloudAccount.requestCode(email.trim(),mode==='register'?'register':mode==='code'?'login':'password_reset');if(mounted.current&&attempt===epoch.current){setRemaining(30);setNotice('验证码发送请求已受理，请检查邮箱（不保证邮件送达）')}}
  catch(reason){if(mounted.current&&attempt===epoch.current)fail(reason)}
  finally{if(mounted.current&&attempt===epoch.current)setBusy(false)}
 }
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return
  if(!sameOrigin())return
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('请输入有效邮箱');return}
  if(mode!=='code'&&(!password||(mode!=='login'&&(password.length<8||password.length>128)))){setError(mode==='login'?'请输入密码':'密码需要 8 至 128 位');return}
  if(needsCode&&!/^\d{6}$/.test(code)){setError('请输入 6 位验证码');return}
  const attempt=epoch.current;setBusy(true);setError('');setNotice('')
  try{
   const remember=canRemember&&remembered.remember
   let result: {sessionStorageFailed?: boolean} | undefined
   if(mode==='login')result=await cloudAccount.passwordLogin(email.trim(),password,remember)
   else if(mode==='code')result=await cloudAccount.codeLogin(email.trim(),code,remember)
   else if(mode==='register'){
    result=skipRegistrationCode
      ? await cloudAccount.registerWithoutCode(email.trim(),password,remember)
      : await cloudAccount.register(email.trim(),code,password,remember)
   }
   else await cloudAccount.resetPassword(email.trim(),code,password)
   if(!mounted.current||attempt!==epoch.current)return
   setPassword('');setCode('')
   if(mode==='reset'){
    setMode('login');setNotice('密码已重置，请使用新密码登录')
   }
   else {
    writeRememberedLogin(origin,{remember:remembered.remember,email:email.trim().toLowerCase()})
    if(result?.sessionStorageFailed)message.warning('已登录，但系统凭据库未能保存登录状态',{key:'cloud-account-session'})
    if(mode==='register')message.success('注册成功，已自动登录',{key:'cloud-account'})
    onClose()
   }
  }catch(reason){if(mounted.current&&attempt===epoch.current)fail(reason)}
  finally{if(mounted.current&&attempt===epoch.current)setBusy(false)}
 }
 return <SettingsDialog label="Draivio 云端账号" onClose={onClose} className="cloud-account-dialog">
  <DialogTitlebar title="Draivio 云端账号" onClose={onClose}/>
  <div className="cloud-account-tabs" aria-label="账户操作">{([['login','登录账户'],['code','验证码登录'],['register','注册账户'],['reset','找回密码']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} disabled={busy} onClick={()=>switchMode(value)}>{label}</button>)}</div>
  <form onSubmit={submit}>
   <label>邮箱<input type="email" name="email" autoComplete="username" required value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
   {mode!=='code'?<label>{mode==='reset'?'新密码':'密码'}<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} required maxLength={128} minLength={mode==='login'?1:8} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>:null}
   {canRemember&&mode!=='reset'?<label className="cloud-remember-toggle"><Checkbox checked={remembered.remember} disabled={busy} onChange={e=>changeRemember(e.target.checked)}/>保持登录</label>:null}
   {mode==='register'?<div className="cloud-registration-option">
    <label className="cloud-register-toggle"><Checkbox checked={skipRegistrationCode} disabled={busy} aria-describedby={skipRegistrationCode?'registration-email-warning':undefined} onChange={e=>{setSkipRegistrationCode(e.target.checked);setCode('');setError('');setNotice('')}}/>免验证码注册</label>
    {skipRegistrationCode?<p id="registration-email-warning">请确保邮箱地址正确，否则无法找回密码。</p>:null}
   </div>:null}
   {needsCode?<label>验证码<div className="cloud-account-code"><input aria-label="验证码" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={e=>setCode(e.target.value)}/><button type="button" disabled={busy||remaining>0} onClick={()=>void send()}>{remaining>0?`${remaining} 秒后重发`:'发送验证码'}</button></div></label>:null}
   {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
   <footer><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>{busy?'处理中…':mode==='login'||mode==='code'?'登录':mode==='register'?'注册':'重置密码'}</button></footer>
  </form>
 </SettingsDialog>
}
