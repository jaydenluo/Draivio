import { CanvasScene } from '../../canvas/CanvasScene'
import './recipes.css'
import { useEffect,useRef,useState } from 'react'
import { useEditor } from '../../state/editor'
import { parseRecipe,type Recipe,type RecipeValue } from './schema'
import { editorRecipeTools,previewRecipe,type SavedRecipe } from './runner'
import { editorDocumentFingerprint } from '../execution/transaction'
import { message } from '../../ui/message'
import { cinematicRecipeDefinition, cinematicStyles, type CinematicStyle } from './cinematic'
const defaultRecipe:Recipe={schemaVersion:1,id:'opacity',version:1,name:'调整图层透明度',inputs:[{id:'target',required:true}],parameters:{opacity:{type:'number',default:70,min:0,max:100}},steps:[{id:'opacity',tool:'opacity',args:{layerId:{$input:'target'},value:{$parameter:'opacity'}}}]}
export function RecipeWorkspace(){
 const {state,dispatch,documentId}=useEditor(),[open,setOpen]=useState(false),[text,setText]=useState(JSON.stringify(defaultRecipe,null,2)),[parameters,setParameters]=useState<Record<string,RecipeValue>>({}),[bindings,setBindings]=useState<Record<string,string>>({target:state.selectedLayerId}),[candidate,setCandidate]=useState<{state:typeof state;saved:SavedRecipe;base:string;documentId:string}|null>(null),[before,setBefore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const controller=useRef<AbortController|null>(null),epoch=useRef(0),latest=useRef({state,documentId});latest.current={state,documentId}
 const cancel=()=>{epoch.current++;controller.current?.abort();controller.current=null;setBusy(false);setCandidate(null)}
 useEffect(()=>{cancel();setOpen(false)},[documentId])
 useEffect(()=>()=>{controller.current?.abort();epoch.current++},[])
 let recipe:Recipe|undefined;try{recipe=parseRecipe(JSON.parse(text))}catch{/* reported on preview */}
 const invalidate=()=>{cancel();setError('')}
 const preview=async()=>{
  cancel();setError('');const run=++epoch.current,abort=new AbortController();controller.current=abort;setBusy(true)
  const base=state,id=documentId
  try{const definition=parseRecipe(JSON.parse(text)),result=await previewRecipe(base,definition,parameters,bindings,editorRecipeTools,{signal:abort.signal})
   if(run!==epoch.current||abort.signal.aborted)return
   if(latest.current.documentId!==id||editorDocumentFingerprint(latest.current.state)!==editorDocumentFingerprint(base))throw new Error('文档已更改，请重新预览配方')
   setCandidate({state:result.state,saved:result.saved,base:editorDocumentFingerprint(base),documentId:id})
  }catch(e){if(run===epoch.current)setError(e instanceof Error?e.message:'配方预览失败')}finally{if(run===epoch.current){setBusy(false);controller.current=null}}
 }
 const adopt=()=>{if(!candidate)return;if(candidate.documentId!==documentId||candidate.base!==editorDocumentFingerprint(state)){setError('文档已更改，请重新预览');return}
  dispatch({type:'apply-edit-plan',document:{...candidate.state,savedRecipes:[...(state.savedRecipes??[]),candidate.saved].slice(-30)}});cancel();message.success('配方已应用，可整体撤销')
 }
 const editSaved=(index:number)=>{const saved=state.savedRecipes?.[index];if(!saved)return;invalidate();setText(JSON.stringify(saved.recipe,null,2));setParameters(saved.parameters);setBindings(saved.bindings)}
 const chooseCinematic=(style:CinematicStyle)=>{invalidate();setText(JSON.stringify(cinematicRecipeDefinition(style),null,2));setParameters({});setBindings({target:state.selectedLayerId})}
 return <div className="recipe-workspace"><button type="button" onClick={()=>{cancel();setOpen(v=>!v)}} aria-expanded={open}>操作配方</button>{open?<section aria-label="操作配方编辑器">
  <p>配方仅运行本地已注册工具。预览不修改作品，采用后整套操作可一次撤销。</p>
  <fieldset><legend>电影风格预设</legend>{cinematicStyles().map(style=><button type="button" key={style} onClick={()=>chooseCinematic(style)}>{({warm:'暖色电影',cool:'冷色电影',monochrome:'黑白电影',vintage:'复古电影'} as const)[style]}</button>)}</fieldset>
  {(state.savedRecipes??[]).length?<label>重新编辑已保存配方<select aria-label="重新编辑已保存配方" defaultValue="" onChange={e=>editSaved(Number(e.target.value))}><option value="" disabled>选择配方版本</option>{state.savedRecipes?.map((r,i)=><option value={i} key={i}>{r.recipe.name} · v{r.recipe.version} · {i+1}</option>)}</select></label>:null}
  <label>配方定义<textarea aria-label="配方定义" rows={6} value={text} onChange={e=>{invalidate();setText(e.target.value);setParameters({});setBindings({})}}/></label>
  {recipe?.inputs.map(slot=><label key={slot.id}>输入 {slot.id}<select aria-label={`配方输入 ${slot.id}`} value={bindings[slot.id]??''} onChange={e=>{invalidate();setBindings(v=>({...v,[slot.id]:e.target.value}))}}><option value="">选择图层</option>{state.layers.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label>)}
  {recipe&&Object.entries(recipe.parameters).map(([key,schema])=><label key={key}>参数 {key}{schema.type==='boolean'?<input type="checkbox" aria-label={`配方参数 ${key}`} checked={Boolean(parameters[key]??schema.default)} onChange={e=>{invalidate();setParameters(v=>({...v,[key]:e.target.checked}))}}/>:<input aria-label={`配方参数 ${key}`} type={schema.type==='number'?'number':'text'} min={schema.min} max={schema.max} value={String(parameters[key]??schema.default)} onChange={e=>{invalidate();setParameters(v=>({...v,[key]:schema.type==='number'?Number(e.target.value):e.target.value}))}}/>}</label>)}
  {error?<p role="alert">{error}</p>:null}<button type="button" disabled={busy} onClick={preview}>预览配方</button><button type="button" onClick={cancel}>取消配方</button>
  {candidate?<div aria-label="配方预览"><button type="button" aria-pressed={before} onClick={()=>setBefore(v=>!v)}>{before?'查看配方后':'查看配方前'}</button><div className="recipe-preview-scene"><CanvasScene state={before?state:candidate.state} thumbnail/></div><strong>{candidate.saved.recipe.name} · v{candidate.saved.recipe.version}</strong><ul>{candidate.saved.records.map(r=><li key={r.id}>{r.tool}：{JSON.stringify(r.args)}</li>)}</ul><p>受影响图层：{candidate.state.layers.filter(layer=>JSON.stringify(layer)!==JSON.stringify(state.layers.find(l=>l.id===layer.id))).map(l=>`${l.name}（透明度 ${l.opacity}%）`).join('、')||'无变更'}</p><button type="button" onClick={adopt}>采用配方</button></div>:null}
 </section>:null}</div>
}
