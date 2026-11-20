import { useEffect,useRef,useState } from 'react'
import { useEditor } from '../state/editor'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { useDraggableDialog } from '../ui/useDraggableDialog'
import { message } from '../ui/message'
import { defaultProfile } from './iccPipeline'
import { serializeEditorSvg } from '../canvas/documentIO'
import { materializeColorAdjustments } from '../render/exportImage'
import { base64Bytes,fromBase64,cmykBackend,cmykState,cmykPixel,retainRgbSource,rgbWorkingCopy,type CmykRaster } from './cmykRaster'
import { editorDocumentFingerprint } from '../ai/execution/transaction'
import '../render/exportDialog.css'
async function rgbaCanvas(width:number,height:number):Promise<Uint8Array>{
 const svg=document.querySelector<SVGSVGElement>('.canvas-art');if(!svg)throw new Error('没有可转换的画布')
 const source=await materializeColorAdjustments(serializeEditorSvg(svg)),url=URL.createObjectURL(new Blob([source],{type:'image/svg+xml'}))
 try{const image=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('画布像素读取失败'));i.src=url}),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法读取画布');ctx.drawImage(image,0,0,width,height);return new Uint8Array(ctx.getImageData(0,0,width,height).data)}finally{URL.revokeObjectURL(url)}
}
export function CmykDialog({onClose}:{onClose:()=>void}){
 const root=useRef<HTMLElement>(null),draggable=useDraggableDialog(root)
 const {state,dispatch,documentId}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const [draft,setDraft]=useState<{raster:CmykRaster;base:string;documentId:string}|null>(null),[profile,setProfile]=useState(''),[ink,setInk]=useState(3),[busy,setBusy]=useState(false),[error,setError]=useState(''),[capability,setCapability]=useState('正在检查本机 ICC 后端…'),[channels,setChannels]=useState([0,0,0,100]),[xy,setXy]=useState([0,0]),[before,setBefore]=useState(false)
 const epoch=useRef(0),mounted=useRef(true)
 useEffect(()=>{void cmykBackend({operation:'capabilities'}).then(c=>{if(mounted.current)setCapability(`${c.backend} · ${c.systemProfile?'可选本机 Generic CMYK（不随应用分发）':'请上传印刷商提供的 CMYK ICC'}`)}).catch(e=>{if(mounted.current)setCapability(e.message)});return()=>{mounted.current=false;epoch.current++}},[])
 useEffect(()=>{epoch.current++;setDraft(null);setBusy(false)},[documentId])
 const cancel=()=>{epoch.current++;setDraft(null);setBusy(false)}
 const work=async(fn:()=>Promise<void>)=>{const run=++epoch.current;setBusy(true);setError('');try{await fn()}catch(e){if(mounted.current&&run===epoch.current){const text=e instanceof Error?e.message:'CMYK 处理失败';setError(text);message.error(text)}}finally{if(mounted.current&&run===epoch.current)setBusy(false)}}
 const preview=()=>void work(async()=>{if(!Number.isFinite(ink)||ink<=0||ink>4)throw new Error('总墨量警戒线必须为 1–400%');if(state.documentWidth*state.documentHeight>4_000_000)throw new Error('CMYK 转换最多 400 万像素，请先缩小工作副本');const run=epoch.current,base=editorDocumentFingerprint(state),id=documentId
  const existing=state.colorModel==='cmyk'?state.cmykRaster:undefined
  const output=await cmykBackend(existing?{operation:'render',width:existing.width,height:existing.height,data:cmykPixel(existing,xy[0],xy[1],channels),profile:existing.profile}:{operation:'convert',width:state.documentWidth,height:state.documentHeight,data:base64Bytes(await rgbaCanvas(state.documentWidth,state.documentHeight)),profile:profile||undefined,sourceProfile:base64Bytes(defaultProfile().bytes)})
  if(!mounted.current||run!==epoch.current)return
  if(latest.current.documentId!==id||editorDocumentFingerprint(latest.current.state)!==base)throw new Error('文档已更改，未采用过期的 CMYK 结果')
  const raster:CmykRaster={...output,totalInkLimit:ink,sourceDocument:existing?.sourceDocument??retainRgbSource(state),sourcePreviewPng:existing?.sourcePreviewPng??output.sourcePreviewPng}
  setDraft({raster,base,documentId:id})
 })
 const apply=()=>{if(!draft)return;if(draft.documentId!==documentId||draft.base!==editorDocumentFingerprint(state)){setError('文档已更改，请重新预览');return}dispatch({type:'apply-cmyk-document',expectedState:state,document:cmykState(state,draft.raster)});cancel();message.success('已采用 CMYK 四通道文档，可一次撤销')}
 const active=draft?.raster??state.cmykRaster
 const exportTiff=()=>void work(async()=>{if(state.colorModel!=='cmyk'||!state.cmykRaster)throw new Error('请先采用 CMYK 转换');const run=epoch.current,base=editorDocumentFingerprint(state),id=documentId,r=state.cmykRaster,result=await cmykBackend({operation:'export',width:r.width,height:r.height,data:r.data,profile:r.profile});if(!mounted.current||run!==epoch.current)return;if(latest.current.documentId!==id||editorDocumentFingerprint(latest.current.state)!==base)throw new Error('文档已更改，已放弃过期 TIFF');if(!result.tiff||result.verifiedChannels!==4)throw new Error('TIFF 四通道验证未通过');const url=URL.createObjectURL(new Blob([fromBase64(result.tiff)],{type:'image/tiff'})),a=document.createElement('a');a.href=url;a.download='draivio-cmyk-8bit-icc.tiff';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);message.success('已导出 8 位四通道 CMYK TIFF，ICC 已嵌入并独立解码校验')})
 return <div className="export-dialog-backdrop"><section ref={root} style={draggable.style} onPointerDown={draggable.onPointerDown} className="export-dialog" role="dialog" aria-modal="true" aria-label="文档模式与 CMYK"><DialogTitlebar title="文档模式与 CMYK" closeLabel="关闭文档模式" onClose={()=>{cancel();onClose()}}/>
 <p>当前：{state.colorModel==='cmyk'?'CMYK 四通道':'RGB'}。CMYK 转换会合并当前画板为 8 位印刷像素，透明区域铺白；原 RGB 图层保留在项目源中，采用后可撤销。</p><p>{capability}</p>
 <p>ICC 转换可能压缩超色域颜色并产生不可逆差异。屏幕为 CMYK→sRGB 的缓存预览；TIFF 直接写原始 CMYK 通道，不再次转换。</p>
 {state.colorModel!=='cmyk'?<label>用户 CMYK ICC<input aria-label="用户 CMYK ICC" type="file" accept=".icc,.icm" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(!file)return;cancel();void file.arrayBuffer().then(bytes=>{if(bytes.byteLength>4*1024*1024)throw new Error('ICC 最大 4 MiB');setProfile(base64Bytes(new Uint8Array(bytes)))}).catch(e=>setError(e.message))}}/></label>:null}
 <label>总墨量警戒线 (%)<input aria-label="CMYK 总墨量警戒线" type="number" min="1" max="400" value={ink*100} onChange={e=>{cancel();setInk(Number(e.target.value)/100)}}/></label>
 {state.colorModel==='cmyk'?<fieldset disabled={busy}><legend>直接编辑设备 CMYK 像素</legend>{['X','Y'].map((label,i)=><label key={label}>{label}<input aria-label={`CMYK 像素 ${label}`} type="number" min="0" max={(i?state.documentHeight:state.documentWidth)-1} value={xy[i]} onChange={e=>{cancel();setXy(v=>v.map((n,j)=>j===i?Number(e.target.value):n))}}/></label>)}{['C','M','Y','K'].map((label,i)=><label key={label}>{label} (%)<input aria-label={`CMYK ${label}`} type="number" min="0" max="100" value={channels[i]} onChange={e=>{cancel();setChannels(v=>v.map((n,j)=>j===i?Number(e.target.value):n))}}/></label>)}</fieldset>:null}
 <button disabled={busy} onClick={preview}>{state.colorModel==='cmyk'?'预览 CMYK 通道编辑':'预览 RGB → CMYK'}</button>
 {active?<><p>{active.profileName} · 8 位 / 4 通道 · 最大总墨量 {(active.maximumInk*100).toFixed(1)}%{active.maximumInk>ink?' · 超过警戒线，请向印刷商确认 profile 或调整通道':''}</p>{draft?<button aria-pressed={before} onClick={()=>setBefore(v=>!v)}>{before?'查看转换后':'查看转换前'}</button>:null}<img alt="CMYK ICC 转换预览" src={before&&draft?state.cmykRaster?.previewPng??draft.raster.sourcePreviewPng:active.previewPng} style={{maxWidth:'100%',maxHeight:220,objectFit:'contain'}}/></>:null}
 {draft?<><button disabled={busy} onClick={apply}>采用 CMYK 预览</button><button onClick={cancel}>取消 CMYK 预览</button></>:null}
 {state.colorModel==='cmyk'?<><button disabled={busy} onClick={exportTiff}>导出 CMYK TIFF（8 位 + ICC）</button><button disabled={busy} onClick={()=>{dispatch({type:'apply-cmyk-document',expectedState:state,document:rgbWorkingCopy(state)});cancel();message.info('RGB 工作副本已创建，原 CMYK 通道仍保存在项目中') }}>显式创建 RGB 工作副本</button>{state.cmykRaster?.sourceDocument?<button disabled={busy} onClick={()=>{dispatch({type:'apply-cmyk-document',expectedState:state,document:{...state.cmykRaster!.sourceDocument,colorModel:'rgb',cmykRaster:state.cmykRaster}});cancel()}}>恢复保留的原 RGB 图层</button>:null}</>:null}
 {error?<p role="alert">{error}</p>:null}<footer><button onClick={()=>{cancel();onClose()}}>关闭并放弃未采用预览</button>{busy?<button onClick={cancel}>取消处理</button>:null}</footer></section></div>
}
