import { Checkbox } from '../ui/Checkbox'
import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { useDraggableDialog } from '../ui/useDraggableDialog'
import { decodePrecisionFile, encodePrecisionFile, nativePrecisionAvailable, type PrecisionCodec } from './precisionCodec'
import { packPrecisionAsset, toLinearPrecision, srgbPrecisionBuffer, type PrecisionAsset } from './precisionAsset'
import { processPrecision, precisionMemoryEstimate, convertPrecision } from './precisionPipeline'
import { precisionPreviewBytes, precisionPreviewPng } from './precisionPreview'
import { defaultCurves } from '../adjustments/curves'
import { renderPrecisionScene } from './precisionScene'
import './exportDialog.css'

export function PrecisionDialog({onClose}:{onClose:()=>void}) {
  const root=useRef<HTMLElement>(null),draggable=useDraggableDialog(root)
  const {state,dispatch,documentId}=useEditor(),latest=useRef(state);latest.current=state
  const selected=state.layers.find(l=>l.id===state.selectedLayerId),original=selected?.highPrecision
  const [draft,setDraft]=useState<PrecisionAsset|null>(null),[preview,setPreview]=useState(''),[ev,setEv]=useState(0),[midtone,setMidtone]=useState(.5)
  const [codec,setCodec]=useState<PrecisionCodec>('png16'),[conversion,setConversion]=useState<'rgba16'|'rgba32f'>('rgba32f'),[dither,setDither]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[info,setInfo]=useState('')
  const controller=useRef<AbortController|null>(null),mounted=useRef(true)
  useEffect(()=>()=>{mounted.current=false;controller.current?.abort()},[])
  useEffect(()=>{controller.current?.abort();setDraft(null);setPreview('');setEv(0);setMidtone(.5)},[original,documentId])
  const close=()=>{controller.current?.abort();onClose()}
  const execute=async(work:(signal:AbortSignal)=>Promise<void>)=>{
    controller.current?.abort();const next=new AbortController();controller.current=next;setBusy(true);setError('')
    try{await work(next.signal)}catch(e){if(mounted.current)setError(e instanceof Error?e.message:'高精度处理失败')}finally{if(mounted.current&&controller.current===next)setBusy(false)}
  }
  const makePreview=async()=>execute(async signal=>{
    if(!original)throw new Error('请选择高精度原始图层')
    const curves=defaultCurves();curves.rgb=[{x:0,y:0},{x:.5,y:midtone},{x:1,y:1}]
    const processed=await processPrecision(toLinearPrecision(original),{exposureEV:ev,curves,signal})
    if(signal.aborted)return
    const view=precisionPreviewBytes(processed),memory=precisionMemoryEstimate(processed.width,processed.height,processed.format)
    setDraft(packPrecisionAsset(processed));setPreview(precisionPreviewPng(processed));setInfo(`显示预览裁切 ${view.clippedChannels} 个通道样本；原始浮点值保留。处理缓冲估算 ${(memory.estimatedPeakBytes/1048576).toFixed(1)} MiB。`)
  })
  const active=draft??original,locked=selected&&effectiveLayerState(state.layers,selected.id).locked
  return <div className="export-dialog-backdrop"><section ref={root} style={draggable.style} onPointerDown={draggable.onPointerDown} className="export-dialog" role="dialog" aria-modal="true" aria-label="高精度资源">
    <DialogTitlebar title="高精度资源" closeLabel="关闭高精度资源" onClose={close}/>
    <p>原始 16 位与场景线性浮点资源独立保存。工作画面是 sRGB 显示预览；曝光与曲线直接处理原始数值。</p>
    <label>文件位深<select aria-label="高精度文件格式" value={codec} onChange={e=>setCodec(e.target.value as PrecisionCodec)} disabled={busy}><option value="png16">16 位 PNG</option><option value="tiff16">16 位 TIFF</option><option value="exr32f">32 位浮点 OpenEXR</option></select></label>
    <label>导入原始图像<input aria-label="导入高精度图像" type="file" accept=".png,.tif,.tiff,.exr" disabled={busy||!nativePrecisionAvailable()} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(!file)return;const started=latest.current;void execute(async signal=>{const asset=await decodePrecisionFile(file,codec,signal);if(signal.aborted)return;if(latest.current!==started)throw new Error('文档已改变，未导入过期资源');const display=precisionPreviewPng(toLinearPrecision(asset));dispatch({type:'import-precision-image',id:`precision-${crypto.randomUUID()}`,name:file.name,asset,preview:display})})}}/></label>
    {!nativePrecisionAvailable()?<p>真实 PNG16、TIFF16、EXR 编解码需要桌面版。浏览器可保留与处理项目中已有的原始资源。</p>:null}
    {original?<><p>{selected?.name} · {original.width} × {original.height} · {original.format==='rgba16'?'16 位':'32 位浮点'} · {locked?'图层或祖先已锁定':'原始资源已保留'}</p>
      <fieldset disabled={busy||locked} style={{border:0,padding:0}}><label>线性曝光 EV<input aria-label="高精度曝光 EV" type="number" min="-16" max="16" step="0.1" value={ev} onChange={e=>setEv(Number(e.target.value))}/></label><label>曲线中间调<input aria-label="高精度曲线中间调" type="number" min="0" max="1" step="0.01" value={midtone} onChange={e=>setMidtone(Number(e.target.value))}/></label><button onClick={()=>void makePreview()}>生成临时预览</button></fieldset>
      {preview?<img alt="高精度处理临时预览" src={preview} style={{maxWidth:'100%',maxHeight:220,objectFit:'contain'}}/>:null}
      {info?<p>{info}</p>:null}
      <button disabled={!draft||busy||locked} onClick={()=>{if(!draft||!selected||!original)return;dispatch({type:'set-precision-resource',id:selected.id,asset:draft,preview,expectedAsset:original})}}>应用高精度处理</button>
      <button disabled={!draft||busy} onClick={()=>{setDraft(null);setPreview('');setInfo('已取消临时预览，原始资源未变')}}>放弃预览</button>
      <label>转换目标位深<select aria-label="高精度转换目标" value={conversion} onChange={e=>setConversion(e.target.value as typeof conversion)} disabled={busy||locked}><option value="rgba16">16 位整数（0–1，高光将裁切）</option><option value="rgba32f">32 位场景线性浮点</option></select></label>
      <button disabled={busy||locked} onClick={()=>void execute(async signal=>{if(!active)return;const source=toLinearPrecision(active),converted=await convertPrecision(source,conversion,{signal,dither:conversion==='rgba16'&&dither});if(signal.aborted)return;const view=precisionPreviewBytes(converted);setDraft(packPrecisionAsset(converted));setPreview(precisionPreviewPng(converted));setInfo(`已生成${conversion==='rgba16'?'16 位整数':'32 位浮点'}转换预览，点击应用后提交；显示裁切样本 ${view.clippedChannels}。16 位整数不能保存超出 0–1 的场景值。`)})}>预览位深转换</button>
      <label><Checkbox checked={dither} onChange={e=>setDither(e.target.checked)}/>降至 8 位副本时使用抖动</label>
      <button disabled={busy} onClick={()=>void execute(async signal=>{if(!active)return;const source=toLinearPrecision(active),display=await convertPrecision(srgbPrecisionBuffer(source),'rgba8',{dither,signal});const png=precisionPreviewPng(display,Math.max(source.width,source.height),'srgb');if(signal.aborted)return;dispatch({type:'import-image',id:`8bit-${crypto.randomUUID()}`,name:`${selected?.name} · 8 位副本`,source:png,width:source.width,height:source.height,autoSize:false})})}>创建 8 位副本（保留原始图层）</button>
      <button disabled={busy||!nativePrecisionAvailable()} onClick={()=>void execute(async signal=>{if(!active)return;const blob=await encodePrecisionFile(active,codec,signal);if(signal.aborted)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`draivio-original.${codec==='png16'?'png':codec==='tiff16'?'tiff':'exr'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setInfo('已导出当前原始资源；文件不包含其他图层、位置变换或显示预览裁切。')})}>导出当前高精度原始资源</button>
      <button disabled={busy||!nativePrecisionAvailable()} onClick={()=>void execute(async signal=>{const started=latest.current;const scene=await renderPrecisionScene(started,{signal});const output=codec==='exr32f'?scene:await convertPrecision(srgbPrecisionBuffer(scene),'rgba16',{dither,signal});if(signal.aborted||latest.current!==started)throw new Error('文档已改变，未导出过期高精度画布');const blob=await encodePrecisionFile(packPrecisionAsset(output,codec==='exr32f'?'linear':'srgb'),codec,signal);if(signal.aborted)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`draivio-canvas.${codec==='png16'?'png':codec==='tiff16'?'tiff':'exr'}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);setInfo('已导出高精度画布。仅使用原始样本；不支持的图层、效果、蒙版或混合模式会明确拒绝。PNG/TIFF整数格式在0–1范围裁切，EXR保留场景浮点值。')})}>导出高精度画布</button>
    </>:<p>选择项目中的高精度图层，或导入真实 16 位 / 浮点文件。</p>}
    {error?<p role="alert">{error}</p>:null}
    <footer><button onClick={close}>关闭并取消未应用处理</button>{busy?<button onClick={()=>controller.current?.abort()}>取消处理</button>:null}</footer>
  </section></div>
}
