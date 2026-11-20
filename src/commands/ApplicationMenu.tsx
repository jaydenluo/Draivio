import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { commands, formatShortcut, shortcutFor, useShortcutVersion } from './shortcuts'
export const menuGroups:Record<string,string[]>={
 文件:['new','open','importImage','save','saveAs','close','export'],
 编辑:['undo','redo','transform','fillForeground','fillBackground','shortcuts'],
 图像:['size','canvasSize','cmyk','raw'],
 图层:['addLayer','duplicate','deleteLayer','group','ungroup'],
 选择:['all','deselect','invert'],
 视图:['zoomIn','zoomOut','fit','actual','proof','layers','properties','results'],
 工具:['creative','batch','artboards','precision','sources'],
}
export function ApplicationMenu({onCommand,disabled,compact=false}:{onCommand:(id:string)=>void;disabled?:(id:string)=>boolean;compact?:boolean}){
 useShortcutVersion()
 const names=Object.keys(menuGroups)
 const [open,setOpen]=useState<string|null>(null)
 const [position,setPosition]=useState({left:0,top:0})
 const root=useRef<HTMLElement>(null),menu=useRef<HTMLDivElement>(null)
 const compactTrigger=useRef<HTMLButtonElement>(null)
 const triggers=useRef<Record<string,HTMLButtonElement|null>>({})
 const close=(focus=false)=>{if(focus&&open)(compact?compactTrigger.current:triggers.current[open])?.focus();setOpen(null)}
 useLayoutEffect(()=>{
  if(!open)return
  const rect=(compact?compactTrigger.current:triggers.current[open])?.getBoundingClientRect()
  if(rect)setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-264)),top:Math.min(rect.bottom+4,Math.max(8,window.innerHeight-(menu.current?.offsetHeight||300)-8))})
  menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
 },[open,compact])
 useEffect(()=>{
  if(!open)return
  const outside=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!menu.current?.contains(e.target as Node))close()}
  const resize=()=>close()
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',resize);window.addEventListener('blur',resize)
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',resize);window.removeEventListener('blur',resize)}
 },[open])
 return <nav ref={root} className="application-menubar" role="menubar" aria-label="主菜单">{compact ? <button ref={compactTrigger} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={!!open} onClick={()=>setOpen(open?null:'categories')} onKeyDown={e=>{
  if(e.key==='ArrowDown'){e.preventDefault();setOpen('categories')}
 }}>菜单 <span aria-hidden="true">▾</span></button> : names.map(name=><button ref={node=>{triggers.current[name]=node}} key={name} type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open===name} onClick={()=>setOpen(open===name?null:name)} onPointerEnter={()=>{if(open)setOpen(name)}} onKeyDown={e=>{
  if(['ArrowDown','Enter',' '].includes(e.key)){e.preventDefault();setOpen(name)}
  if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();triggers.current[names[(names.indexOf(name)+(e.key==='ArrowRight'?1:-1)+names.length)%names.length]]?.focus()}
 }}>{name}</button>)}{open?createPortal(<div ref={menu} className="application-menu" role="menu" aria-label={open==='categories'?'主菜单分类':`${open}菜单`} style={position} onKeyDown={e=>{
   const items=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])
   const current=items.indexOf(document.activeElement as HTMLButtonElement)
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(compact&&open!=='categories')setOpen('categories');else close(true);return}
   if(e.key==='Tab'){close();return}
   if(e.key==='ArrowDown'||e.key==='ArrowUp'||e.key==='Home'||e.key==='End'){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(current+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus()}
   if(!compact && (e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();setOpen(names[(names.indexOf(open)+(e.key==='ArrowRight'?1:-1)+names.length)%names.length])}
   if(compact && open!=='categories' && e.key==='ArrowLeft'){e.preventDefault();setOpen('categories')}
 }}>{open==='categories' ? names.map(name=><button type="button" role="menuitem" key={name} onClick={()=>setOpen(name)} onKeyDown={e=>{
  if(e.key==='ArrowRight'){e.preventDefault();setOpen(name)}
 }}><span>{name}</span><span aria-hidden="true">›</span></button>) : <>
  {compact ? <button type="button" role="menuitem" onClick={()=>setOpen('categories')}><span aria-hidden="true">‹</span><span>返回主菜单</span></button> : null}
  {menuGroups[open].map(id=>{const c=commands.find(c=>c.id===id)!;return <button type="button" role="menuitem" key={id} disabled={disabled?.(id)} aria-label={c.label} onClick={()=>{close(true);onCommand(id)}}><span>{c.label}{['importImage','shortcuts','size','cmyk','raw','export','creative','batch','artboards','precision','sources','proof'].includes(id)?'…':''}</span><kbd>{formatShortcut(shortcutFor(id))}</kbd></button>})}
 </>}</div>,document.body):null}</nav>
}
