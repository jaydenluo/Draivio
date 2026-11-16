import { useLayoutEffect, useRef, useState } from 'react'
import { exportSvgImage, prepareSvgExport, validateExportDimensions, type ImageExportFormat } from './exportImage'
import { exportBatch } from './batchExport'
import type { ExportRange } from '../canvas/exportScene'
import { message } from '../ui/message'
import JSZip from 'jszip'
import './exportDialog.css'

type Dimensions = {width:number;height:number}
type ExportSettings = Dimensions & {format: ImageExportFormat|'svg';range:ExportRange;lockRatio:boolean;quality:number;background:string}
const STORAGE_KEY='draivio-export-settings'
function readSettings(width:number,height:number,hasSelection:boolean):ExportSettings {
  const base:ExportSettings={format:'png',range:'canvas',width,height,lockRatio:true,quality:90,background:'transparent'}
  try {
    const saved:unknown=JSON.parse(localStorage.getItem(STORAGE_KEY)??'{}')
    if (!saved || typeof saved!=='object' || Array.isArray(saved)) return base
    const value=saved as Record<string,unknown>
    if (typeof value.format==='string' && ['png','jpeg','webp','svg'].includes(value.format)) base.format=value.format as ExportSettings['format']
    if (typeof value.range==='string' && (['canvas','layer'].includes(value.range) || value.range==='selection' && hasSelection)) base.range=value.range as ExportRange
    if (typeof value.lockRatio==='boolean') base.lockRatio=value.lockRatio
    if (typeof value.quality==='number'&&Number.isFinite(value.quality)&&value.quality>=1&&value.quality<=100) base.quality=value.quality
    if (typeof value.background==='string'&&(value.background==='transparent'||/^#[0-9a-f]{6}$/i.test(value.background))) base.background=value.background
    // Dimensions belong to the current range/document; never carry them across documents.
    return base
  } catch {return base}
}
export function ExportDialog({open,svgSource,documentWidth,documentHeight,selectionDimensions,hasSelection,selectedLayerName,documentKey='',onClose,onExport}:{
  open:boolean;svgSource:(range:ExportRange)=>string;documentWidth:number;documentHeight:number;selectionDimensions?:Dimensions;hasSelection:boolean;selectedLayerName?:string;documentKey?:string;onClose:()=>void;onExport?:(range:ExportRange)=>void
}) {
  const [settings,setSettings]=useState<ExportSettings>(()=>readSettings(documentWidth,documentHeight,hasSelection))
  const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null)
  const [batchMode,setBatchMode]=useState(false)
  const [batchFormats,setBatchFormats]=useState<ImageExportFormat[]>(['png','jpeg','webp'])
  const modal=useRef<HTMLElement>(null)
  const closeLatest=useRef<()=>void>(()=>{})
  const generation=useRef(0);const pending=useRef<AbortController|null>(null)
  const identity=useRef({open,documentKey});identity.current={open,documentKey}
  const rangeDimensions=(range:ExportRange)=>range==='selection'&&selectionDimensions?selectionDimensions:{width:documentWidth,height:documentHeight}
  useLayoutEffect(()=>{
    generation.current++;pending.current?.abort();pending.current=null;setBusy(false)
    if(open){const next=readSettings(documentWidth,documentHeight,hasSelection);setSettings({...next,...rangeDimensions(next.range)});setError(null)}
    return ()=>{generation.current++;pending.current?.abort()}
  // documentKey contains document/session/revision and cancels stale callbacks even for same-ID reopen.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open,documentKey,documentWidth,documentHeight])
  const close=()=>{generation.current++;pending.current?.abort();pending.current=null;setBusy(false);onClose()}
  closeLatest.current=close
  useLayoutEffect(()=>{
    if(!open)return
    const element=modal.current!
    const previous=document.activeElement as HTMLElement|null
    const focusables=()=>[...element.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')].filter(item=>!item.matches(':disabled')&&item.tabIndex>=0)
    const focusFirst=()=>{(focusables()[0]??element).focus()}
    focusFirst()
    const keydown=(event:KeyboardEvent)=>{
      // Canvas and layer shortcuts are global; block their propagation while leaving
      // native control defaults (typing, number arrows, button Enter/Space) intact.
      event.stopPropagation()
      if(event.key==='Escape'){event.preventDefault();closeLatest.current();return}
      if(!element.contains(event.target as Node)){event.preventDefault();focusFirst();return}
      if(event.key!=='Tab')return
      const items=focusables();const first=items[0],last=items.at(-1)
      if(!first){event.preventDefault();element.focus();return}
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===element)){event.preventDefault();last?.focus()}
      else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===element)){event.preventDefault();first.focus()}
    }
    const focusin=(event:FocusEvent)=>{if(!element.contains(event.target as Node))focusFirst()}
    document.addEventListener('keydown',keydown,true)
    document.addEventListener('focusin',focusin,true)
    return ()=>{
      document.removeEventListener('keydown',keydown,true)
      document.removeEventListener('focusin',focusin,true)
      if(previous?.isConnected&&previous!==document.body)previous.focus()
    }
  },[open])
  if(!open)return null
  const ratioDimensions=rangeDimensions(settings.range);const ratio=ratioDimensions.width/Math.max(1,ratioDimensions.height)
  const update=(patch:Partial<ExportSettings>)=>setSettings(current=>({...current,...patch}))
  const updateWidth=(width:number)=>update({width,...(settings.lockRatio?{height:Math.max(1,Math.round(width/ratio))}:{})})
  const updateHeight=(height:number)=>update({height,...(settings.lockRatio?{width:Math.max(1,Math.round(height*ratio))}:{})})
  const runExport=async()=>{
    if(pending.current)return
    const token=++generation.current;const key=documentKey;const controller=new AbortController();pending.current=controller
    const active=()=>generation.current===token&&!controller.signal.aborted&&identity.current.open&&identity.current.documentKey===key
    setBusy(true);setError(null)
    try {
      validateExportDimensions(settings.width,settings.height)
      if(settings.range==='selection'&&!hasSelection)throw new Error('没有可导出的选区')
      const source=svgSource(settings.range)
      const background=settings.format==='jpeg'&&settings.background==='transparent'?'#ffffff':settings.background
      const options={width:settings.width,height:settings.height,background,signal:controller.signal}
      const encode = async (format: ImageExportFormat) => format==='jpeg' && background==='transparent'
        ? exportSvgImage(source,{...options,format,background:'#ffffff',quality:settings.quality})
        : exportSvgImage(source,{...options,format,quality:settings.quality})
      if (batchMode) {
        const formats = [...new Set(batchFormats)]
        if (!formats.length) throw new Error('请至少选择一种批量格式')
        const results = await exportBatch(formats.map(format => ({id: format})), item => encode(item.id), Math.min(3, formats.length), controller.signal)
        if(!active())return
        const failed=results.filter(item=>item.status==='failed')
        const archive = new JSZip()
        for (const item of results) if(item.status==='succeeded'&&item.value) archive.file(`draivio-${settings.range}.${item.id}`, item.value)
        if(failed.length) throw new Error(`批量导出完成，但 ${failed.length} 个格式失败`)
        await downloadBlob(await archive.generateAsync({type:'blob'}), `draivio-${settings.range}-batch.zip`)
        try {localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))} catch {/* best effort */}
        onExport?.(settings.range);close();return
      }
      const blob=settings.format==='svg'?new Blob([await prepareSvgExport(source,options)],{type:'image/svg+xml;charset=utf-8'}):await encode(settings.format)
      if(!active())return
      try {localStorage.setItem(STORAGE_KEY,JSON.stringify(settings))} catch {/* Export succeeds even when preferences cannot be stored. */}
      downloadBlob(blob,`draivio-${settings.range}.${settings.format}`)
      onExport?.(settings.range);close()
    } catch(cause) {
      if(active()){const text=cause instanceof Error?cause.message:'导出失败';setError(text);message.error(text,{key:'image-export-error'})}
    } finally {if(generation.current===token){pending.current=null;setBusy(false)}}
  }
  const estimate=Math.max(0,settings.width*settings.height*(settings.format==='png'?2:settings.format==='svg'?.3:.4+(settings.quality/100)*.8)/1024/1024)
  return <div className="export-dialog-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)close()}}><section ref={modal} tabIndex={-1} className="export-dialog" role="dialog" aria-modal="true" aria-label="导出图像">
    <header><strong>导出</strong><button aria-label="关闭导出" onClick={close}>×</button></header>
    <fieldset disabled={busy} className="export-controls"><div className="export-grid">
      <label>格式<select value={settings.format} onChange={event=>update({format:event.target.value as ExportSettings['format']})}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="svg">SVG</option></select></label>
      <label>范围<select value={settings.range} onChange={event=>{const range=event.target.value as ExportRange;update({range,...rangeDimensions(range)})}}><option value="canvas">整画布</option><option value="selection" disabled={!hasSelection}>选区{hasSelection?'':'（无选区）'}</option><option value="layer">当前图层{selectedLayerName?` · ${selectedLayerName}`:''}</option></select></label>
      <label>宽度<input aria-label="宽度" type="number" min="1" max="16384" value={settings.width} onChange={event=>updateWidth(Number(event.target.value))}/> px</label>
      <label>高度<input aria-label="高度" type="number" min="1" max="16384" value={settings.height} onChange={event=>updateHeight(Number(event.target.value))}/> px</label>
    </div><label className="export-check"><input type="checkbox" checked={settings.lockRatio} onChange={event=>update({lockRatio:event.target.checked})}/>锁定比例</label>
    <div className="export-inline">{settings.format==='jpeg'||settings.format==='webp'?<label>质量<input aria-label="质量" type="number" min="1" max="100" value={settings.quality} onChange={event=>update({quality:Number(event.target.value)})}/>%</label>:null}
      {settings.format!=='jpeg'?<label><input type="checkbox" checked={settings.background==='transparent'} onChange={event=>update({background:event.target.checked?'transparent':'#ffffff'})}/>透明背景</label>:null}
      {settings.format==='jpeg'||settings.background!=='transparent'?<label>背景<input aria-label="背景" type="color" value={settings.background==='transparent'?'#ffffff':settings.background} onChange={event=>update({background:event.target.value})}/></label>:null}
    </div></fieldset>
    <label className="export-check"><input type="checkbox" checked={batchMode} onChange={event=>setBatchMode(event.target.checked)}/>批量导出多种格式</label>
    {batchMode?<div className="export-inline" role="group" aria-label="批量格式"><span>格式</span>{(['png','jpeg','webp'] as ImageExportFormat[]).map(format=><label key={format}><input type="checkbox" checked={batchFormats.includes(format)} onChange={event=>setBatchFormats(current=>event.target.checked?[...new Set([...current,format])]:current.filter(item=>item!==format))}/>{format.toUpperCase()}</label>)}</div>:null}
    <small className="export-hint">{settings.width} × {settings.height} px · {batchMode?batchFormats.map(format=>format.toUpperCase()).join(' / '):settings.format.toUpperCase()} · 8bit sRGB<br/>预计约 {estimate.toFixed(1)} MB，实际体积取决于内容{settings.range==='layer'?<><br/>可见画布大小 · 包含父组效果</>:null}{settings.format==='jpeg'?<><br/>JPEG 不支持透明，将使用所选背景</>:null}</small>
    {error?<p className="export-error" role="alert">{error}</p>:null}
    <footer><button onClick={close}>取消</button><button className="primary" onClick={runExport} disabled={busy}>{busy?'导出中…':'导出'}</button></footer>
  </section></div>
}
async function downloadBlob(blob:Blob,filename:string) {
  const url=URL.createObjectURL(blob)
  try {const link=document.createElement('a');link.href=url;link.download=filename;link.click(); await new Promise(resolve=>setTimeout(resolve,120))}
  finally {setTimeout(()=>URL.revokeObjectURL(url),1000)}
}
