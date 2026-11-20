import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react'
import {useEditor,type AIResult,type EditorAction,type EditorState} from '../state/editor'
import {useDocumentWorkspace} from '../document/DocumentWorkspaceProvider'
import {contentRevision,contextCanCommit} from '../ai/context/editorContext'
import {useComposerDraft} from './ComposerDraft'
import {resultArchive,type ArchivedResult} from './resultArchive'
import {effectiveLayerState} from '../state/layerHierarchy'
import {dimensionError} from '../document/documentGeometry'
import {resultSizeLabel} from './resultImage'
import {message} from '../ui/message'

type SaveStatus='saving'|'saved'|'error'
type Preview={ids:string[];activeId:string;archived?:boolean}
type Delivery={preview:Preview|null;items:AIResult[];readyIds:string[];storage:Record<string,SaveStatus>;open:(id:string,ids?:string[])=>void;openArchived:(record:ArchivedResult)=>Promise<void>;close:()=>void;select:(id:string)=>void;adopt:(result:AIResult,asLayer?:boolean)=>void;continueEditing:(result:AIResult)=>void;saveLocal:(result:AIResult)=>Promise<void>}
const Context=createContext<Delivery|null>(null)
export function resultAdoption(result:AIResult,state:EditorState,documentId:string):{label:string;disabled:string;action?:EditorAction}{
 if(result.status !== 'success' || !result.source) return { label: '采用', disabled: '结果图片尚不可用' }
 const request = result.request
 if (!request || request.restoration) return { label: '打开为新文档', disabled: '' }
 if (request.mode === 'generate' && !request.maskedEdit) {
  if (!state.aiResults.some(item => item.id === result.id)) return { label: '打开为新文档', disabled: '' }
  const label = '作为新图层加入'
  if (state.isGenerating) return { label, disabled: '请等待本批生成结束' }
  if (result.adopted || state.layers.some(layer => layer.id === result.id)) return { label, disabled: '此图片已加入作品' }
  if (request.context && (request.context.documentId !== documentId || !contextCanCommit(state, request.context))) {
   return { label, disabled: '原作品已更改，可打开为新文档' }
  }
  return { label, disabled: '', action: { type: 'adopt-ai-result-as-layer', id: result.id } }
 }
 if (request.intent === 'reference' && !request.maskedEdit && !request.outpaint) return { label: '打开为新文档', disabled: '' }
 const target = state.layers.find(layer => layer.id === request.sourceLayerId)
 const label = request.outpaint ? '采用扩图' : target ? `应用到「${target.name}」` : '应用修改'
 if (state.isGenerating) return { label, disabled: '请等待本批生成结束' }
 if (request.context && (request.context.documentId !== documentId || !contextCanCommit(state, request.context))) {
  return { label, disabled: '原作品已更改，可打开为新文档' }
 }
 if (!target) return { label, disabled: '生成时的目标图层已不存在' }
 if (effectiveLayerState(state.layers, target.id).locked) return { label, disabled: '目标图层或所属组已锁定' }
 if (!request.context) return { label, disabled: '此结果缺少原作品信息，请打开为新文档' }
 if (request.outpaint) {
  const expansion = request.outpaint.expansion
  const error = dimensionError(expansion.width, expansion.height)
  if (error || expansion.originalWidth !== state.documentWidth || expansion.originalHeight !== state.documentHeight) {
   return { label, disabled: error || '原画布尺寸不匹配' }
  }
  return { label, disabled: '', action: { type: 'adopt-outpaint-result', id: result.id } }
 }
 return { label, disabled: '', action: { type: 'replace-layer-with-ai-result', targetId: target.id, resultId: result.id } }
}

export function ResultDeliveryProvider({children}:{children?:ReactNode}){
 const {state,dispatch,documentId}=useEditor(),{workspace,openResultDocument}=useDocumentWorkspace(),draft=useComposerDraft()
 const active=workspace.activeId===documentId
 const [preview,setPreview]=useState<Preview|null>(null),[external,setExternal]=useState<Record<string,AIResult>>({}),[readyIds,setReadyIds]=useState<string[]>([]),[storage,setStorage]=useState<Record<string,SaveStatus>>({})
 const stored=useRef(new Map<string,string>()),saves=useRef(new Map<string,Promise<void>>()),alive=useRef(true),current=useRef({state,active});current.current={state,active}
 const pendingFavorites=useRef(new Map<string,{value:boolean}>())
 const initial=useRef(new Set(state.aiResults.map(r=>r.id))),seen=initial.current
 const loadEpoch=useRef(0)
 const pending=useRef<{ids:Set<string>;signature:string;interrupted:boolean}|null>(null),wasGenerating=useRef(false)
 const signature=`${contentRevision(state)}|${state.prompt}|${state.activeTool}|${state.selectedLayerIds.join(',')}`
 const items=[...state.aiResults,...Object.values(external).filter(r=>!state.aiResults.some(item=>item.id===r.id))]
 const open=(id:string,ids?:string[])=>{
  loadEpoch.current++
  const result=items.find(r=>r.id===id&&r.status==='success'&&r.source)
  if(!result)return
  const batch=result.request?.generationJob?.batchId??result.request?.maskedEdit?.batchId
  const group=ids??(batch?items.filter(r=>(r.request?.generationJob?.batchId??r.request?.maskedEdit?.batchId)===batch).slice().reverse().map(r=>r.id):[id])
  const valid=[...new Set(group.includes(id)?group:[id,...group])].filter(key=>items.some(r=>r.id===key&&r.status==='success'&&r.source))
  setPreview({activeId:id,ids:valid});setReadyIds(values=>values.filter(key=>!valid.includes(key)))
 }
 const saveLocal=async(result:AIResult)=>{
  const previous=stored.current.get(result.id)
  if(previous!==undefined&&previous.split('|')[0]!==String(result.favorite))pendingFavorites.current.set(result.id,{value:result.favorite})
  const favoriteIntent=pendingFavorites.current.get(result.id)
  stored.current.set(result.id,`${result.favorite}|${result.adopted}`);setStorage(v=>({...v,[result.id]:'saving'}))
  const saving=(saves.current.get(result.id)??Promise.resolve()).catch(()=>{}).then(async()=>{
   try{await resultArchive.save(result,documentId,favoriteIntent?.value);if(favoriteIntent&&pendingFavorites.current.get(result.id)===favoriteIntent)pendingFavorites.current.delete(result.id);if(alive.current)setStorage(v=>({...v,[result.id]:'saved'}));window.dispatchEvent(new Event('draivio:result-library-changed'))}
   catch{if(alive.current)setStorage(v=>({...v,[result.id]:'error'}))}
  })
  saves.current.set(result.id,saving);await saving
  if(saves.current.get(result.id)===saving)saves.current.delete(result.id)
 }
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  for(const result of state.aiResults)if(result.status==='success'&&result.source&&stored.current.get(result.id)!==`${result.favorite}|${result.adopted}`)void saveLocal(result)
 },[state.aiResults])
 useEffect(()=>{
  if(!active){loadEpoch.current++;setPreview(null)}
  const available=new Set(state.aiResults.filter(r=>r.status==='success'&&r.source).map(r=>r.id))
  setReadyIds(values=>values.some(id=>!available.has(id))?values.filter(id=>available.has(id)):values)
  if(state.isGenerating&&!wasGenerating.current)pending.current={ids:new Set(state.aiResults.map(r=>r.id)),signature,interrupted:!active}
  if(pending.current&&(!active||pending.current.signature!==signature))pending.current.interrupted=true
  const fresh=state.aiResults.filter(r=>r.status==='success'&&r.source&&!seen.has(r.id));fresh.forEach(r=>seen.add(r.id))
  if(fresh.length)setReadyIds(values=>[...new Set([...values,...fresh.map(r=>r.id)])])
  if(!state.isGenerating&&wasGenerating.current&&pending.current){
   const run=pending.current;pending.current=null
   const completed=state.aiResults.filter(r=>r.status==='success'&&r.source&&!run.ids.has(r.id)).slice().reverse()
   if(completed.length&&active&&!run.interrupted){
    const ids=completed.map(r=>r.id);setPreview({ids,activeId:ids[0]});setReadyIds(values=>values.filter(id=>!ids.includes(id)))
   }
  }
  wasGenerating.current=state.isGenerating
 },[state.isGenerating,state.aiResults,active,signature])
 const close=()=>{loadEpoch.current++;setPreview(null)}
 const continueEditing=(result:AIResult)=>{
  if(!result.source||!current.current.active)return
  draft.useResultImage({source:result.source,name:`生成结果 ${result.id}`})
  dispatch({type:'set-composer-mode',mode:'edit'});dispatch({type:'set-composer-minimized',minimized:false});dispatch({type:'set-prompt',prompt:''});close()
  requestAnimationFrame(()=>{if(!alive.current||!current.current.active)return;document.querySelector<HTMLTextAreaElement>('textarea[aria-label="AI 操作"]')?.focus()})
 }
 const adopt=(result:AIResult,asLayer=false)=>{
  if(!current.current.active)return
  if(asLayer){
   const basis=current.current.state,request=result.request
   if(basis.isGenerating||!basis.aiResults.some(r=>r.id===result.id)||request?.outpaint){message.warning('此结果暂不可加入当前作品');return}
   if(request?.context&&(request.context.documentId!==documentId||!contextCanCommit(basis,request.context))){message.warning('原作品已更改，请打开为新文档');return}
   if((request?.maskedEdit||request?.restoration)&&!request.context){message.warning('此结果缺少原作品信息，请打开为新文档');return}
   if(request?.mode==='generate'&&(result.adopted||basis.layers.some(l=>l.id===result.id))){message.warning('此候选已加入当前作品');return}
   dispatch({type:'adopt-ai-result-as-layer',id:result.id});close();return
  }
  const decision=resultAdoption(result,current.current.state,documentId)
  if(decision.disabled){message.warning(decision.disabled);return}
  if(decision.action)dispatch(decision.action)
  else if(!openResultDocument(result))return
  close()
 }
 const openArchived=async(record:ArchivedResult)=>{
  const basis=current.current.state,epoch=++loadEpoch.current
  try{
   const source=await resultArchive.load(record.id)
   if(epoch!==loadEpoch.current||!alive.current||!current.current.active||current.current.state!==basis)return
   const result:AIResult={...record,size:resultSizeLabel(source,record.size),source}
   setExternal(v=>({...v,[result.id]:result}));setStorage(v=>({...v,[result.id]:'saved'}));setPreview({ids:[result.id],activeId:result.id,archived:true})
  }catch(error){message.error(error instanceof Error?error.message:'无法读取本地图片')}
 }
 return <Context.Provider value={{preview,items,readyIds,storage,open,openArchived,close,select:id=>setPreview(v=>v&&v.ids.includes(id)?{...v,activeId:id}:v),adopt,continueEditing,saveLocal}}>{children}</Context.Provider>
}
export function useResultDelivery(){const value=useContext(Context);if(!value)throw new Error('ResultDeliveryProvider is required');return value}
