import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FloatingSurface } from '../ui/FloatingSurface'
import { commands, eventShortcut, formatShortcut, readBindings, saveBindings, shortcutConflict, shortcutFor } from './shortcuts'

export function ShortcutSettings({onClose}:{onClose:()=>void}) {
 const root=useRef<HTMLDivElement>(null)
 useEffect(()=>{
   const previous=document.activeElement as HTMLElement|null
   root.current?.querySelector<HTMLInputElement>('input[type=search]')?.focus()
   return()=>{if(previous?.isConnected)previous.focus()}
 },[])
 const [bindings,setBindings]=useState(readBindings)
 const [query,setQuery]=useState('')
 const [error,setError]=useState('')
 const [saved,setSaved]=useState(false)
 return createPortal(<div className="shortcut-backdrop"><FloatingSurface title="键盘快捷键" closeLabel="关闭键盘快捷键" role="dialog" aria-modal="true" aria-label="键盘快捷键" className="shortcut-settings" surfaceRef={root} onClose={onClose} onKeyDown={event=>{
   if(event.key!=='Tab')return
   const controls=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')??[])
   const first=controls[0],last=controls[controls.length-1]
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
 }}>
   <p>默认采用 Photoshop 对应命令的快捷键。选中快捷键输入框，直接按下新的组合键。</p>
   <input type="search" aria-label="搜索快捷命令" placeholder="搜索命令或分类" value={query} onChange={e=>setQuery(e.target.value)}/>
   <div className="shortcut-list">{commands.filter(c=>(c.label+c.group).includes(query)).map(c=><label key={c.id} className="shortcut-row"><span><small>{c.group}</small>{c.label}</span><input aria-label={`${c.group}：${c.label}快捷键`} readOnly value={formatShortcut(shortcutFor(c.id,bindings))} placeholder="未分配" onKeyDown={e=>{
     if(e.key==='Tab'||e.key==='Escape')return
     e.preventDefault();e.stopPropagation()
     if(e.nativeEvent.isComposing||e.repeat)return
     const value=e.key==='Backspace'||e.key==='Delete'?'':eventShortcut(e.nativeEvent)
     if(!value&&e.key!=='Backspace'&&e.key!=='Delete')return
     if(['Space','Escape','Enter','Tab','Mod+Tab','Mod+Shift+Tab'].includes(value)){setError('此按键用于画布手势或界面导航，请使用其他组合键');return}
     const conflict=shortcutConflict(c.id,value,bindings)
     if(conflict){setError(`已用于「${conflict.group} · ${conflict.label}」，请先清除该命令的快捷键`);return}
     setBindings(old=>({...old,[c.id]:value}));setError('');setSaved(false)
   }}/><button type="button" aria-label={`清除${c.group}：${c.label}快捷键`} onClick={()=>{setBindings(old=>({...old,[c.id]:''}));setSaved(false);setError('')}}>清除</button></label>)}</div>
   {error?<p role="alert">{error}</p>:null}{saved?<p role="status">快捷键已保存</p>:null}
   <footer><button type="button" onClick={()=>{setBindings({});setSaved(false);setError('')}}>恢复 Photoshop 默认</button><span>Delete / Backspace 清除键位</span><button type="button" onClick={()=>{try{saveBindings(bindings);setSaved(true)}catch{setError('无法保存快捷键，请检查本地存储空间')}}}>保存设置</button></footer>
 </FloatingSurface></div>,document.body)
}
