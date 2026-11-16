import { useEffect,useState } from 'react'
import { useEditor } from '../../state/editor'
import { CanvasScene } from '../../canvas/CanvasScene'
import { SEMANTIC_SELECTION_EVENT } from '../vision/SemanticSelectionWorkspace'
import { createProductCandidate,defaultProductSettings,productCanCommit,adoptProductCandidate,type ProductSettings,type ProductCandidate } from './product'
import { message } from '../../ui/message'
import '../ui/edit-preview.css'

export function ProductRecipeWorkspace(){
 const {state,dispatch,documentId}=useEditor()
 const [open,setOpen]=useState(false),[settings,setSettings]=useState<ProductSettings>(defaultProductSettings),[candidate,setCandidate]=useState<ProductCandidate|null>(null),[before,setBefore]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setCandidate(null);setOpen(false);setError('')},[documentId])
 const update=<K extends keyof ProductSettings>(key:K,value:ProductSettings[K])=>{setCandidate(null);setError('');setSettings(s=>({...s,[key]:value}))}
 const preview=()=>{try{setCandidate(createProductCandidate(state,documentId,settings));setBefore(false);setError('')}catch(e){setError(e instanceof Error?e.message:'产品预览失败')}}
 const adopt=()=>{if(!candidate)return;try{const next=adoptProductCandidate(candidate,state,documentId);dispatch({type:'apply-edit-plan',document:next});setCandidate(null);setOpen(false);message.success('商品原像素与蒙版已保留，背景和投影独立成层，可整体撤销')}catch(e){setError(e instanceof Error?e.message:'采用失败')}}
 const reopen=()=>{const saved=state.layers.find(l=>l.id===state.selectedLayerId)?.productRecipe;if(saved)setSettings(saved.settings);setOpen(v=>!v);setCandidate(null);setError('')}
 const stale=!!candidate&&!productCanCommit(candidate,state,documentId)
 return <div className="product-recipe-workspace"><button type="button" aria-expanded={open} onClick={reopen}>产品抠图与投影</button>{open?<section aria-label="产品配方工作区">
  <p>先接受商品主体蒙版，再预览背景与接触投影。商品原像素保留，不重绘瓶身文字或几何；玻璃、反光与镂空不佳时请手工精修。</p>
  <button type="button" onClick={()=>window.dispatchEvent(new Event(SEMANTIC_SELECTION_EVENT))}>分析商品主体蒙版</button><button type="button" onClick={()=>{setCandidate(null);dispatch({type:'select-tool',tool:'mask'});setOpen(false);message.info('使用蒙版画笔或边缘细化精修商品；完成后重新预览产品配方')}}>手工精修商品蒙版</button>
  <label>背景模式<select aria-label="产品背景模式" value={settings.background} onChange={e=>update('background',e.target.value as ProductSettings['background'])}><option value="solid">纯色背景</option><option value="existing">已有背景图片</option></select></label>
  {settings.background==='solid'?<label>背景颜色<input type="color" aria-label="产品背景颜色" value={settings.color} onChange={e=>update('color',e.target.value)}/></label>:<label>背景图片<select aria-label="产品背景图片" value={settings.backgroundLayerId} onChange={e=>update('backgroundLayerId',e.target.value)}><option value="">请选择</option>{state.layers.filter(l=>l.source&&l.id!==state.selectedLayerId).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>}
  <button type="button" onClick={()=>{setCandidate(null);setOpen(false);dispatch({type:'set-composer-mode',mode:'generate'});message.info('请在现有生成入口描述背景并确认请求，采用为图层后回到产品配方选择该背景；商品不会上传或自动重绘')}}>转到背景生成入口</button>
  {([{key:'dx',label:'商品水平位移',min:-2048,max:2048,step:1},{key:'dy',label:'商品垂直位移',min:-2048,max:2048,step:1},{key:'shadowX',label:'投影接触水平',min:-2048,max:2048,step:1},{key:'shadowY',label:'投影接触垂直',min:-2048,max:2048,step:1},{key:'shadowWidth',label:'投影宽度',min:.1,max:3,step:.1},{key:'shadowHeight',label:'投影压扁比例',min:.01,max:.5,step:.01},{key:'shadowBlur',label:'投影模糊',min:0,max:128,step:1},{key:'shadowOpacity',label:'投影不透明度',min:0,max:100,step:1}] as const).map(f=><label key={f.key}>{f.label}<input type="number" aria-label={f.label} min={f.min} max={f.max} step={f.step} value={settings[f.key]} onChange={e=>update(f.key,e.target.value===''?NaN:Number(e.target.value))}/></label>)}
  <small>投影是可调的接触椭圆近似；采用后可选择独立投影层继续移动或改透明度。</small>
  {error?<p role="alert">{error}</p>:null}<button type="button" onClick={preview}>预览产品配方</button><button type="button" onClick={()=>{setCandidate(null);setOpen(false)}}>取消产品配方</button>
  {candidate?<div className="edit-preview" aria-label="产品配方预览"><button type="button" onClick={()=>setBefore(v=>!v)}>{before?'查看产品后':'查看产品前'}</button><div className="edit-preview-scene"><CanvasScene state={before?state:candidate.state} thumbnail/></div>{stale?<p role="status">商品或文档已更改，请重新预览。</p>:null}<button type="button" disabled={stale} onClick={adopt}>采用产品配方</button></div>:null}
 </section>:null}</div>
}
