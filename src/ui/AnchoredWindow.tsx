import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { FloatingSurface } from './FloatingSurface'
import './anchoredWindow.css'

/** A viewport-positioned window that escapes its trigger's stacking/clip context. */
export function AnchoredWindow({ anchor, title, label = title, onClose, width, className = '', dismissOnOutside = false, placement = 'below', modal = false, visible = true, rememberKey, resizable = false, children }: {
  anchor: RefObject<HTMLElement | null>; title: string; label?: string; onClose: () => void
  width: number; className?: string; modal?:boolean; visible?:boolean; rememberKey?:string; resizable?:boolean; dismissOnOutside?: boolean; placement?: 'above' | 'below' | 'right' | 'align-top'; children: ReactNode
}) {
  const root = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{left:number;top:number;width:number;maxHeight:number;height?:number}>({left:12,top:60,width,maxHeight:440})
  useLayoutEffect(() => {
    const update = () => {
      const rect = anchor.current?.getBoundingClientRect()
      if (!rect) return
      let saved:{left?:number;top?:number;width?:number;height?:number}={}
      try { if(rememberKey)saved=JSON.parse(localStorage.getItem(rememberKey)??'{}')??{} } catch { /* Ignore unavailable/corrupt window preferences. */ }
      const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)
      const actualWidth = Math.min(finite(saved.width)?Math.max(420,saved.width):width, window.innerWidth - 24)
      const height = root.current?.getBoundingClientRect().height || 300
      const preferredTop = finite(saved.top)?saved.top:placement === 'right' || placement === 'align-top' ? rect.top : placement === 'above' && rect.top >= 140 ? rect.top - height - 8 : rect.bottom + 8
      const bottomReserve = placement === 'right' ? Math.min(height, window.innerHeight - 24) + 12 : 120
      const top = Math.max(12, Math.min(preferredTop, window.innerHeight - bottomReserve))
      const preferredLeft = finite(saved.left)?saved.left:placement === 'right' ? rect.right + 8 : rect.right - actualWidth
      setPosition({left:Math.max(12, Math.min(preferredLeft, window.innerWidth - actualWidth - 12)),top,width:actualWidth,maxHeight:Math.max(80,window.innerHeight - top - 12),...(finite(saved.height)?{height:Math.min(Math.max(300,saved.height),window.innerHeight-top-12)}:{})})
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [anchor, width, placement,rememberKey])
  useEffect(() => {
    if(!visible)return
    const element = root.current
    element?.focus({preventScroll:true})
    return () => {
      if (document.activeElement === document.body || element?.contains(document.activeElement)) anchor.current?.focus({preventScroll:true})
    }
  }, [anchor,visible])
  useEffect(() => {
    if (!dismissOnOutside) return
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !anchor.current?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [anchor, dismissOnOutside, onClose])
  useEffect(()=>{
    if(!rememberKey)return
    let timer:ReturnType<typeof setTimeout>|undefined
    const save=()=>{const rect=root.current?.getBoundingClientRect();if(!rect||rect.width<=0)return;try{localStorage.setItem(rememberKey,JSON.stringify({left:rect.left,top:rect.top,width:rect.width,height:rect.height}))}catch{/* Window preferences are optional. */}}
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(()=>{clearTimeout(timer);timer=setTimeout(save,180)})
    if(root.current)observer?.observe(root.current)
    window.addEventListener('pointerup',save)
    return()=>{clearTimeout(timer);observer?.disconnect();window.removeEventListener('pointerup',save)}
  },[rememberKey])
  return createPortal(<FloatingSurface surfaceRef={root} reanchorOnResize role="dialog" aria-label={label} aria-modal={modal&&visible} aria-hidden={!visible||undefined} title={title} closeLabel={`关闭${label}`} onClose={onClose} tabIndex={-1} className={`anchored-window ${resizable?'resizable-window':''} ${className}`} onKeyDown={event=>{
    if(!modal||event.key!=='Tab')return
    const items=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled):not([type=hidden]),select:not(:disabled),[tabindex="0"]')??[]).filter(el=>el.getClientRects().length>0)
    const first=items[0],last=items.at(-1)
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus()}
  }} style={{...position,position:'fixed',right:'auto',...(!visible?{display:'none'}:{})}}>{children}</FloatingSurface>, document.body)
}
