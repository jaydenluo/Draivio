import {useEffect, useRef, useState, type FormEvent} from 'react'
import {SettingsDialog} from '../components/SettingsDialog'
import {DialogTitlebar} from '../ui/DialogTitlebar'
import {message} from '../ui/message'
import {cloudAccount} from './cloudAccount'
import './cloudAccount.css'
import {CloudServiceConfig} from './CloudServiceConfig'

type Mode='login'|'code'|'register'|'reset'
const accountErrors:Record<string,string>={
 INVALID_CREDENTIALS:'邮箱或密码不正确',INVALID_EMAIL:'请输入有效邮箱',INVALID_PASSWORD:'密码需要 8 至 128 位',INVALID_CODE:'验证码不正确或已过期',INVALID_RESET:'重置验证码不正确或已过期',ACCOUNT_EXISTS:'该邮箱已注册，请直接登录',ACCOUNT_NOT_FOUND:'该邮箱尚未注册',ACCOUNT_SUSPENDED:'该账号暂时不可用，请联系服务方',RATE_LIMITED:'操作过于频繁，请稍后再试',EMAIL_SENDER_BLOCKED:'验证码邮件暂时无法发送，请联系服务方',EMAIL_UNAVAILABLE:'验证码邮件服务暂时不可用，请稍后再试',SESSION_CHANGED:'登录操作已取消，请重试',INVALID_MODEL_CATALOG:'账号已验证，但模型目录读取失败，请稍后重新登录',INVALID_ACCOUNT_RESPONSE:'账号信息读取失败，请稍后重新登录',
}
export function CloudAccountDialog({onClose}:{onClose:()=>void}){
 const [mode,setMode]=useState<Mode>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState(''),[code,setCode]=useState('')
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[remaining,setRemaining]=useState(0)
 const mounted=useRef(true),epoch=useRef(0)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;epoch.current++;cloudAccount.cancelPendingAuthentication()}},[])
 useEffect(()=>{if(remaining<=0)return;const timer=setTimeout(()=>setRemaining(n=>n-1),1000);return()=>clearTimeout(timer)},[remaining])
 const switchMode=(next:Mode)=>{epoch.current++;cloudAccount.cancelPendingAuthentication();setMode(next);setPassword('');setCode('');setError('');setNotice('');setBusy(false)}
 const fail=(reason:unknown)=>{const text=reason instanceof Error?(accountErrors[reason.message]??'账号请求失败，请检查网络后重试'):'账号请求失败，请稍后重试';setError(text);message.error(text,{key:'cloud-account'})}
 const send=async()=>{
  if(busy||remaining)return
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('请输入有效邮箱');return}
  const attempt=epoch.current;setBusy(true);setError('')
  try{await cloudAccount.requestCode(email.trim(),mode==='register'?'register':mode==='code'?'login':'password_reset');if(mounted.current&&attempt===epoch.current){setRemaining(30);setNotice('验证码发送请求已受理，请检查邮箱（不保证邮件送达）')}}
  catch(reason){if(mounted.current&&attempt===epoch.current)fail(reason)}
  finally{if(mounted.current&&attempt===epoch.current)setBusy(false)}
 }
 const submit=async(event:FormEvent)=>{
  event.preventDefault();if(busy)return
  if(!/^\S+@\S+\.\S+$/.test(email.trim())){setError('请输入有效邮箱');return}
  if(mode!=='code'&&(!password||(mode!=='login'&&(password.length<8||password.length>128)))){setError(mode==='login'?'请输入密码':'密码需要 8 至 128 位');return}
  if(mode!=='login'&&!/^\d{6}$/.test(code)){setError('请输入 6 位验证码');return}
  const attempt=epoch.current;setBusy(true);setError('');setNotice('')
  try{
   if(mode==='login')await cloudAccount.passwordLogin(email.trim(),password)
   else if(mode==='code')await cloudAccount.codeLogin(email.trim(),code)
   else if(mode==='register')await cloudAccount.register(email.trim(),code,password)
   else await cloudAccount.resetPassword(email.trim(),code,password)
   if(!mounted.current||attempt!==epoch.current)return
   setPassword('');setCode('')
   if(mode==='reset'){setMode('login');setNotice('密码已重置，请使用新密码登录')}
   else onClose()
  }catch(reason){if(mounted.current&&attempt===epoch.current)fail(reason)}
  finally{if(mounted.current&&attempt===epoch.current)setBusy(false)}
 }
 return <SettingsDialog label="Draivio 云端账号" onClose={onClose} className="cloud-account-dialog">
  <DialogTitlebar title="Draivio 云端账号" onClose={onClose}/>
  <div className="cloud-account-tabs" aria-label="账户操作">{([['login','登录账户'],['code','验证码登录'],['register','注册账户'],['reset','找回密码']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={mode===value} disabled={busy} onClick={()=>switchMode(value)}>{label}</button>)}</div>
  <p>使用与幕影相同的云端账号。登录后查询实际余额和可用模型，编辑器可继续离线使用。</p>
  <CloudServiceConfig onChanged={()=>{switchMode('login');setNotice('云服务地址已更新，请重新登录')}} disabled={busy}/>
  <form onSubmit={submit}>
   <label>邮箱<input type="email" name="email" autoComplete="username" required value={email} disabled={busy} onChange={e=>setEmail(e.target.value)}/></label>
   {mode!=='code'?<label>{mode==='reset'?'新密码':'密码'}<input type="password" name="password" autoComplete={mode==='login'?'current-password':'new-password'} required maxLength={128} minLength={mode==='login'?1:8} value={password} disabled={busy} onChange={e=>setPassword(e.target.value)}/></label>:null}
   {mode!=='login'?<label>验证码<div className="cloud-account-code"><input aria-label="验证码" name="code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={code} disabled={busy} onChange={e=>setCode(e.target.value)}/><button type="button" disabled={busy||remaining>0} onClick={()=>void send()}>{remaining>0?`${remaining} 秒后重发`:'发送验证码'}</button></div></label>:null}
   {error?<p role="alert">{error}</p>:null}{notice?<p role="status">{notice}</p>:null}
   <footer><button type="button" onClick={onClose}>取消</button><button type="submit" disabled={busy}>{busy?'处理中…':mode==='login'||mode==='code'?'登录':mode==='register'?'注册':'重置密码'}</button></footer>
  </form>
 </SettingsDialog>
}
