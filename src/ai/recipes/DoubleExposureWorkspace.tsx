import { Checkbox } from '../../ui/Checkbox'
import { useEffect, useRef, useState } from 'react'
import { CanvasScene } from '../../canvas/CanvasScene'
import { useEditor } from '../../state/editor'
import { editorDocumentFingerprint } from '../execution/transaction'
import { buildDoubleExposure, defaultDoubleExposureSettings, type DoubleExposureSettings } from './doubleExposure'
import { message } from '../../ui/message'

export function DoubleExposureWorkspace(){
 const {state,dispatch,documentId}=useEditor()
 const [open,setOpen]=useState(false),[settings,setSettings]=useState<DoubleExposureSettings>(defaultDoubleExposureSettings),[secondChoice,setSecondChoice]=useState(''),[error,setError]=useState(''),[before,setBefore]=useState(false)
 const [candidate,setCandidate]=useState<{document:typeof state;base:string;documentId:string}|null>(null)
 const epoch=useRef(0)
 const invalidate=()=>{epoch.current++;setCandidate(null);setError('')}
 useEffect(()=>{epoch.current++;setCandidate(null);setSettings(defaultDoubleExposureSettings());setSecondChoice('');setOpen(false);setError('')},[documentId])
 useEffect(()=>()=>{epoch.current++},[])
 const update=<K extends keyof DoubleExposureSettings>(key:K,value:DoubleExposureSettings[K])=>{invalidate();setSettings(s=>({...s,[key]:value}))}
 const images=state.layers.filter(l=>!!l.source&&!l.children&&!l.groupId&&(!l.kind||l.kind==='image'))
 const preview=()=>{try{const result=buildDoubleExposure(state,{...settings,subjectId:settings.subjectId||state.selectedLayerId});setCandidate({document:result.document,base:editorDocumentFingerprint(state),documentId});setBefore(false);setError('')}catch(e){setCandidate(null);setError(e instanceof Error?e.message:'双重曝光预览失败')}}
 const stale=!!candidate&&(candidate.documentId!==documentId||candidate.base!==editorDocumentFingerprint(state))
 const adopt=()=>{if(!candidate||stale)return;dispatch({type:'apply-edit-plan',document:candidate.document});invalidate();setOpen(false);message.success('双重曝光已采用，两张源图和蒙版可独立编辑，可一次撤销')}
 const importImage=(file?:File)=>{invalidate();if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>16*1024*1024){setError('请选择 16 MB 内 PNG、JPEG 或 WebP 图片');return}const ticket=epoch.current,reader=new FileReader();reader.onload=()=>{if(epoch.current!==ticket)return;setSettings(s=>({...s,second:{source:String(reader.result),name:file.name}}));setSecondChoice('imported')};reader.onerror=()=>{if(epoch.current===ticket)setError('第二图读取失败')};reader.readAsDataURL(file)}
 return <div className="double-exposure-workspace"><button type="button" aria-expanded={open} onClick={()=>{invalidate();setOpen(v=>!v)}}>双重曝光</button>{open?<section aria-label="双重曝光工作区">
 <p>保留两张源图，使用主体透明度或手动蒙版限定轮廓。普通不透明图片请先建立轮廓选区或蒙版。不会自动分割或生成付费图片。</p>
 <label>主体图<select aria-label="双重曝光主体" value={settings.subjectId||state.selectedLayerId} onChange={e=>update('subjectId',e.target.value)}><option value="">选择主体图</option>{images.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
 <label>第二图<select aria-label="双重曝光第二图" value={secondChoice} onChange={e=>{const value=e.target.value;setSecondChoice(value);update('second',value.startsWith('layer:')?{layerId:value.slice(6)}:value.startsWith('result:')?{resultId:value.slice(7)}:{})}}><option value="">明确选择第二图</option>{secondChoice==='imported'?<option value="imported">已导入：{settings.second.name}</option>:null}{images.map(l=><option key={l.id} value={`layer:${l.id}`}>{l.name}</option>)}{state.aiResults.filter(r=>r.status==='success'&&r.source?.startsWith('data:image/')).map(r=><option key={r.id} value={`result:${r.id}`}>已下载结果 · {r.model} · {r.id}</option>)}</select></label>
 <label>导入第二图<input aria-label="导入双重曝光第二图" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{importImage(e.target.files?.[0]);e.target.value=''}}/></label>
 <label>主体轮廓<select aria-label="双重曝光蒙版" value={settings.maskMode} onChange={e=>update('maskMode',e.target.value as DoubleExposureSettings['maskMode'])}><option value="alpha">原透明度（保留已有蒙版）</option><option value="existing">主体图层蒙版</option><option value="selection">当前手动选区</option></select></label>
 <label>混合模式<select aria-label="双重曝光混合模式" value={settings.blendMode} onChange={e=>update('blendMode',e.target.value as DoubleExposureSettings['blendMode'])}><option value="screen">滤色</option><option value="overlay">叠加</option><option value="multiply">正片叠底</option></select></label>
 {([['opacity','混合比例',0,100,1],['dx','第二图 X',-16384,16384,1],['dy','第二图 Y',-16384,16384,1],['scale','第二图缩放',.01,20,.01],['curveAmount','曲线强度',0,1,.05],['feather','蒙版羽化',0,64,1]] as const).map(([key,label,min,max,step])=><label key={key}>{label}<input aria-label={`双重曝光${label}`} type="number" min={min} max={max} step={step} value={settings[key]} onChange={e=>update(key,Number(e.target.value))}/></label>)}
 <label><Checkbox aria-label="双重曝光反转蒙版" checked={settings.inverted} onChange={e=>update('inverted',e.target.checked)}/>反转蒙版</label>
 {error?<p role="alert">{error}</p>:null}<button type="button" onClick={preview}>预览双重曝光</button><button type="button" onClick={invalidate}>取消双重曝光</button>
 {candidate?<div aria-label="双重曝光前后预览"><button type="button" onClick={()=>setBefore(v=>!v)}>{before?'查看合成后':'查看合成前'}</button><div style={{width:240,height:200,overflow:'hidden'}}><CanvasScene state={before?state:candidate.document} thumbnail/></div>{stale?<p role="alert">文档已更改，请重新预览</p>:null}<button type="button" disabled={stale} onClick={adopt}>采用双重曝光</button><p>采用后，在图层中独立变换第二图，在属性中微调曲线、混合比例与蒙版；隐藏组可回看保留的源图。</p></div>:null}
 </section>:null}</div>
}
