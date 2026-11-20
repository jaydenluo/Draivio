import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import './layers-panel.css'
export type LayerMenuItem = {id:string;label:string;disabled?:boolean;danger?:boolean;section?:string;icon?:ReactNode;shortcut?:string;title?:string;children?:LayerMenuItem[]}
type Props={x:number;y:number;items:LayerMenuItem[];onAction:(id:string)=>void;onClose:()=>void;trigger?:HTMLElement;label?:string;heading?:ReactNode;className?:string;inline?:boolean;showSectionLabels?:boolean}
export function LayerMenu({x,y,items,onAction,onClose,trigger,label='图层操作',heading,className='',inline=false,showSectionLabels=false}:Props) {
 const ref=useRef<HTMLDivElement>(null),[position,setPosition]=useState({left:x,top:y})
 const [submenu,setSubmenu]=useState<{item:LayerMenuItem;trigger:HTMLButtonElement}|null>(null)
 const buttons=()=>Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[]).filter(button=>button.closest('[role="menu"]')===ref.current)
 useLayoutEffect(()=>{
  const rect=ref.current?.getBoundingClientRect(),width=rect?.width||220,height=rect?.height||360
  const left=inline&&x+width>window.innerWidth-8?(trigger?.getBoundingClientRect().left??x)-width:x
  setPosition({left:Math.max(8,Math.min(left,window.innerWidth-width-8)),top:Math.max(8,Math.min(y,window.innerHeight-height-8))})
  if(!inline)buttons()[0]?.focus({preventScroll:true})
 },[x,y,inline,trigger])
 useEffect(()=>{
  const outside=(e:PointerEvent)=>{if(!ref.current?.contains(e.target as Node)&&!trigger?.contains(e.target as Node))onClose()}
  const close=()=>onClose()
  const scroll=(event:Event)=>{if(!(event.target instanceof Node)||!ref.current?.contains(event.target))onClose()}
  if(!inline){document.addEventListener('pointerdown',outside,true);window.addEventListener('resize',close);window.addEventListener('blur',close);window.addEventListener('scroll',scroll,true)}
  return()=>{document.removeEventListener('pointerdown',outside,true);window.removeEventListener('resize',close);window.removeEventListener('blur',close);window.removeEventListener('scroll',scroll,true)}
 },[onClose,trigger,inline])
 const close=(focus=false)=>{onClose();if(focus)trigger?.focus({preventScroll:true})}
 const expand=(item:LayerMenuItem,element:HTMLButtonElement)=>{if(item.children&&!item.disabled)setSubmenu(current=>current?.item.id===item.id?current:{item,trigger:element})}
 const content=<div ref={ref} className={`layer-menu ${className}`.trim()} role="menu" aria-label={label} style={position} onPointerDown={e=>e.stopPropagation()} onWheel={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation()}} onKeyDown={e=>{
  if(e.key==='Escape'||inline&&e.key==='ArrowLeft'){e.preventDefault();e.stopPropagation();close(true);return}
  if(e.key==='Tab'){close();return}
  const target=e.target as HTMLElement,button=target.closest<HTMLButtonElement>('button'),item=items.find(item=>item.id===button?.dataset.menuItem)
  if(e.key==='ArrowRight'&&item?.children&&button){e.preventDefault();e.stopPropagation();expand(item,button);requestAnimationFrame(()=>ref.current?.querySelector<HTMLElement>('[role="menu"] button:not(:disabled)')?.focus());return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return
  e.preventDefault();e.stopPropagation();setSubmenu(null)
  const choices=buttons(),i=choices.indexOf(document.activeElement as HTMLButtonElement)
  choices[e.key==='Home'?0:e.key==='End'?choices.length-1:(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length]?.focus({preventScroll:true})
 }}>
  {heading?<div className="context-menu-heading">{heading}</div>:null}
  {items.map((item,index)=><div key={item.id}>{showSectionLabels&&item.section&&item.section!==items[index-1]?.section?<div className="layer-menu-section">{item.section}</div>:index>0&&item.section!==items[index-1].section?<div className="layer-menu-separator" role="separator"/>:null}<button data-menu-item={item.id} role="menuitem" type="button" disabled={item.disabled} className={item.danger?'danger':''} aria-label={item.label} aria-haspopup={item.children?'menu':undefined} aria-expanded={item.children?submenu?.item.id===item.id:undefined} title={item.title} onPointerEnter={event=>{if(item.children)expand(item,event.currentTarget);else setSubmenu(null)}} onClick={event=>{if(item.children){expand(item,event.currentTarget);return}close(true);onAction(item.id)}}>{item.icon?<span className="context-menu-icon" aria-hidden="true">{item.icon}</span>:null}<span className="context-menu-label">{item.label}</span>{item.shortcut?<kbd aria-hidden="true">{item.shortcut}</kbd>:null}{item.children?<span className="layer-menu-arrow" aria-hidden="true">›</span>:null}</button></div>)}
  {submenu?<LayerMenu inline x={submenu.trigger.getBoundingClientRect().right} y={submenu.trigger.getBoundingClientRect().top} items={submenu.item.children!} trigger={submenu.trigger} label={submenu.item.label} onClose={()=>setSubmenu(null)} onAction={id=>{onClose();onAction(id)}}/>:null}
 </div>
 return inline?content:createPortal(content,document.body)
}
