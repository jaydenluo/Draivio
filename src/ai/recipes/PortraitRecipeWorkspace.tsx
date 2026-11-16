import {useEffect,useRef,useState} from 'react'
import {useEditor} from '../../state/editor'
import type {Selection} from '../../canvas/selectionGeometry'
import {CanvasScene} from '../../canvas/CanvasScene'
import {contentRevision} from '../context/editorContext'
import {localSelection} from '../tools/adjustmentTools'
import {defaultPortraitSettings,type PortraitMasks,type PortraitSettings} from './portrait'
import {capturePortraitRegions,createPortraitCandidate,portraitCanCommit,adoptPortraitCandidate,type PortraitCandidate} from './portraitWorkflow'
import {message} from '../../ui/message'
const names={person:'人物',skin:'皮肤',eyes:'眼部',protect:'保护'} as const
export function PortraitRecipeWorkspace(){
 const {state,dispatch,documentId}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const revision=contentRevision(state),[open,setOpen]=useState(false),[masks,setMasks]=useState<Partial<Record<keyof typeof names,Selection>>>({}),[confirmed,setConfirmed]=useState(false),[settings,setSettings]=useState<PortraitSettings>(defaultPortraitSettings),[enabled,setEnabled]=useState({denoise:true,heal:true,skinTone:false,eyes:true}),[points,setPoints]=useState(''),[candidate,setCandidate]=useState<PortraitCandidate|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[before,setBefore]=useState(false)
 const controller=useRef<AbortController|null>(null)
 const invalidate=()=>{controller.current?.abort();controller.current=null;setCandidate(null);setBusy(false);setError('')}
 useEffect(()=>{invalidate();setMasks({});setConfirmed(false)},[documentId,state.selectedLayerId,revision])
 useEffect(()=>()=>controller.current?.abort(),[])
 const capture=(key:keyof typeof names)=>{try{
  invalidate();if(!state.selectionVisible)throw new Error('请先用自由选区、椭圆或已确认的精细蒙版圈出分区')
  const selection=localSelection(state,state.selectedLayerId)
  if(selection.path.type==='affine'&&selection.path.source.type==='shape'&&selection.path.source.kind==='rectangle'||selection.path.type==='shape'&&selection.path.kind==='rectangle')throw new Error('矩形框不能作为人物或五官精确分区；请使用自由选区或分区蒙版')
  capturePortraitRegions(state,documentId,{confirmed:true,person:selection,skin:selection,eyes:selection})
  setMasks(m=>({...m,[key]:selection}));setConfirmed(false)
 }catch(e){setError(e instanceof Error?e.message:'分区捕获失败')}}
 const update=(key:Exclude<keyof PortraitSettings,'blemishes'>,value:number)=>{invalidate();setSettings(s=>({...s,[key]:value}))}
 const preview=async()=>{invalidate();const c=new AbortController();controller.current=c;setBusy(true)
  try{
   const blemishes=points.trim()?points.split(';').map(pair=>{const values=pair.split(',').map(Number);if(values.length!==2)throw new Error('瑕疵点格式：x,y;x,y（图层0–100%）');return {x:values[0],y:values[1]}}):[]
   const regions=capturePortraitRegions(state,documentId,{...masks,confirmed} as PortraitMasks)
   const input={...settings,blemishes,denoise:enabled.denoise?settings.denoise:0,heal:enabled.heal?settings.heal:0,skinTone:enabled.skinTone?settings.skinTone:0,eyes:enabled.eyes?settings.eyes:0}
   const value=await createPortraitCandidate(state,documentId,regions,input,{signal:c.signal})
   if(c.signal.aborted)return
   if(!portraitCanCommit(value,latest.current.state,latest.current.documentId))throw new Error('文档或人物已更改，候选已放弃')
   setCandidate(value);setBefore(false)
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:'人像预览失败')}
  finally{if(controller.current===c){controller.current=null;setBusy(false)}}
 }
 const adopt=()=>{if(!candidate)return;try{const next=adoptPortraitCandidate(candidate,state,documentId);dispatch({type:'apply-edit-plan',document:next});invalidate();setOpen(false);message.success('人像精修已采用；原图与各阶段累积快照保留，可整体撤销')}catch(e){setError(e instanceof Error?e.message:'采用失败')}}
 return <div className="portrait-recipe-workspace"><button type="button" aria-expanded={open} onClick={()=>{invalidate();setOpen(v=>!v)}}>人像自然精修</button>{open?<section aria-label="人像自然精修工作区">
  <p>本地自然精修，不自动识人、不生成或改变脸型。多人照片先明确一个目标；依次用精细选区捕获人物、皮肤、眼部，胡须、眼镜与不应改变的区域请加入保护。</p>
  <p>捕获后可继续在画布修改选区，文档/图层内容变化会清空分区。预览前原图不变。</p>
  {Object.entries(names).map(([key,name])=><button type="button" key={key} onClick={()=>capture(key as keyof typeof names)}>{`捕获${name}分区`}{masks[key as keyof typeof names]?' ✓':''}</button>)}
  <label><input type="checkbox" aria-label="确认人物及分区" checked={confirmed} onChange={e=>{invalidate();setConfirmed(e.target.checked)}}/>我已核对目标人物和所有分区；不接受低置信度自动候选代替确认</label>
  {([{key:'denoise',name:'降噪',min:0,max:35},{key:'heal',name:'瑕疵修复',min:0,max:50},{key:'skinTone',name:'肤色',min:-10,max:10},{key:'eyes',name:'眼部增强',min:0,max:10}] as const).map(control=><label key={control.key}><input type="checkbox" aria-label={`启用${control.name}`} checked={enabled[control.key]} onChange={e=>{invalidate();setEnabled(v=>({...v,[control.key]:e.target.checked}))}}/>{control.name}<input type="range" aria-label={`${control.name}强度`} min={control.min} max={control.max} step={1} value={settings[control.key]} onChange={e=>update(control.key,Number(e.target.value))}/><output>{settings[control.key]}</output></label>)}
  <label>手工瑕疵点（图层百分比，x,y;x,y）<input aria-label="手工瑕疵点" value={points} onChange={e=>{invalidate();setPoints(e.target.value)}}/></label>
  <small>瑕疵修复只处理你明确指定的点；眼部仅轻微亮度变化。阶段保留累积快照，只有最后一层可见；修改开关与强度请重新预览。</small>
  {error?<p role="alert">{error}</p>:null}{busy?<p role="status">正在本地精修，可取消</p>:null}
  <button type="button" disabled={busy||!confirmed||!masks.person||!masks.skin||!masks.eyes} onClick={()=>void preview()}>预览人像精修</button>
  <button type="button" onClick={()=>{invalidate();setOpen(false)}}>取消人像精修</button>
  {candidate?<div className="edit-preview" aria-label="人像精修预览"><button type="button" onClick={()=>setBefore(v=>!v)}>{before?'查看精修后':'查看原图'}</button><div className="edit-preview-scene"><CanvasScene state={before?state:candidate.state} thumbnail/></div><button type="button" disabled={!portraitCanCommit(candidate,state,documentId)} onClick={adopt}>采用人像精修</button></div>:null}
 </section>:null}</div>
}
