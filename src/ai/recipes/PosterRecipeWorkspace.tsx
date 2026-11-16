import {useEffect,useRef,useState} from 'react'
import {useEditor,type EditorState,type Layer} from '../../state/editor'
import {CanvasScene} from '../../canvas/CanvasScene'
import {contentRevision} from '../context/editorContext'
import {posterPresets,planPoster,type PosterPlan} from './poster'
import {message} from '../../ui/message'

type ImportedAsset={id:string;source:string;name:string}
export function PosterRecipeWorkspace(){
 const {state,dispatch,documentId}=useEditor()
 const [open,setOpen]=useState(false),[title,setTitle]=useState('在这里输入你的海报标题'),[body,setBody]=useState('正文内容\n第二行说明'),[font,setFont]=useState('sans-serif')
 const [width,setWidth]=useState(1080),[height,setHeight]=useState(1350),[safeMargin,setSafeMargin]=useState(72),[sourceId,setSourceId]=useState(''),[logoId,setLogoId]=useState('')
 const [imports,setImports]=useState<ImportedAsset[]>([]),[plan,setPlan]=useState<PosterPlan|null>(null),[candidate,setCandidate]=useState<EditorState|null>(null),[error,setError]=useState(''),[fontAck,setFontAck]=useState(false)
 const basis=useRef<{documentId:string;revision:string}|null>(null),epoch=useRef(0)
 const cancel=()=>{epoch.current++;basis.current=null;setPlan(null);setCandidate(null);setError('');setFontAck(false)}
 useEffect(()=>{cancel();setSourceId('');setLogoId('');setImports([])},[documentId])
 useEffect(()=>()=>{epoch.current++},[])
 const presets=posterPresets(),assets=[...state.layers.filter(layer=>layer.source).map(layer=>({id:layer.id,source:layer.source!,name:layer.name})),...imports]
 const choosePreset=(name:string)=>{const preset=presets.find(value=>value.name===name)!;cancel();setWidth(preset.width);setHeight(preset.height);setSafeMargin(preset.safeMargin)}
 const importImage=(file:File|undefined,role:'image'|'logo')=>{
  cancel();if(!file)return
  if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>16*1024*1024){setError('请选择 16 MB 内的 PNG、JPEG 或 WebP 图片');return}
  const ticket=epoch.current,reader=new FileReader()
  reader.onload=()=>{if(ticket!==epoch.current)return;const asset={id:`poster-import-${crypto.randomUUID()}`,source:String(reader.result),name:file.name};setImports(items=>[...items,asset]);if(role==='image')setSourceId(asset.id);else setLogoId(asset.id)}
  reader.onerror=()=>{if(ticket===epoch.current)setError('图片读取失败')};reader.readAsDataURL(file)
 }
 const build=(next:PosterPlan):EditorState=>{
  const textLayers:Layer[]=next.texts.map((text,index)=>({id:text.layerId,name:index===0?'海报标题':'海报正文',kind:'text',textObjectId:text.id,className:'layer-text',visible:true,opacity:100,blendMode:'正常'}))
  const layers=[...textLayers,...state.layers.map(layer=>({...layer}))]
  for(const item of next.protectedSources){
   const existing=layers.find(layer=>layer.id===item.layerId)
   if(existing){existing.locked=true;existing.posterProtection={reason:item.reason,sourceLayerId:item.layerId}}
   else layers.push({id:item.layerId,name:assets.find(asset=>asset.id===item.layerId)?.name??'海报素材',kind:'image',className:'layer-image',source:item.source,visible:true,opacity:100,blendMode:'正常',locked:true,posterProtection:{reason:item.reason,sourceLayerId:item.layerId}})
  }
  const boardId=`poster-board-${crypto.randomUUID()}`
  return {...state,documentWidth:next.width,documentHeight:next.height,layers,canvasTexts:[...state.canvasTexts,...next.texts],sceneOrder:[...state.sceneOrder,...next.texts.map(text=>text.id)],artboards:[...state.artboards,{id:boardId,name:next.name,x:0,y:0,width:next.width,height:next.height,background:'#ffffff',layerIds:layers.map(layer=>layer.id)}],activeArtboardId:boardId,selectedLayerId:next.texts[0].layerId,selectedLayerIds:[next.texts[0].layerId]}
 }
 const preview=()=>{
  setPlan(null);setCandidate(null);basis.current=null
  try{
   setError('')
   if(font!=='sans-serif'&&!fontAck)throw new Error('字体未验证，请确认可能回退为系统字体')
   const asset=(id:string)=>{if(!id)return undefined;const selected=assets.find(value=>value.id===id);if(!selected)throw new Error('所选素材已不存在，请重新选择');return {sourceLayerId:selected.id,source:selected.source,protected:true}}
   const next=planPoster({title,body,fontFamily:font,fontAvailable:true,image:asset(sourceId),logo:asset(logoId)},{name:'自定义',width,height,safeMargin})
   const document=build(next)
   basis.current={documentId,revision:contentRevision(state)};setPlan(next);setCandidate(document)
  }catch(reason){setError(reason instanceof Error?reason.message:'海报预览失败')}
 }
 const apply=()=>{
  if(!plan||!candidate)return
  try{
   if(basis.current?.documentId!==documentId||basis.current.revision!==contentRevision(state))throw new Error('文档已更改，请重新预览')
   dispatch({type:'apply-edit-plan',document:candidate});setOpen(false);cancel();message.success('海报排版已应用，可整体撤销')
  }catch(reason){setError(reason instanceof Error?reason.message:'应用失败')}
 }
 return <div className="recipe-workspace"><button type="button" aria-expanded={open} onClick={()=>{cancel();setOpen(!open)}}>海报排版</button>{open?<section aria-label="海报排版工作区">
  <p>本地约束排版，不调用模型。标题和正文保留为可编辑文字层；原图和商标保留独立来源并锁定保护。</p>
  <fieldset><legend>版式</legend>{presets.map(preset=><button type="button" key={preset.name} onClick={()=>choosePreset(preset.name)}>{preset.name} {preset.width}×{preset.height}</button>)}</fieldset>
  <label>标题<textarea aria-label="海报标题" value={title} onChange={event=>{cancel();setTitle(event.target.value)}}/></label>
  <label>正文<textarea aria-label="海报正文" value={body} onChange={event=>{cancel();setBody(event.target.value)}}/></label>
  <label>字体<input aria-label="海报字体" value={font} onChange={event=>{cancel();setFont(event.target.value)}}/></label>
  {font!=='sans-serif'?<label><input type="checkbox" aria-label="确认字体可能回退" checked={fontAck} onChange={event=>{setPlan(null);setCandidate(null);setFontAck(event.target.checked)}}/>字体未验证，可能回退为系统字体</label>:null}
  <label>宽度<input type="number" aria-label="海报宽度" value={width} onChange={event=>{cancel();setWidth(Number(event.target.value))}}/></label>
  <label>高度<input type="number" aria-label="海报高度" value={height} onChange={event=>{cancel();setHeight(Number(event.target.value))}}/></label>
  <label>安全边距<input type="number" aria-label="海报安全边距" value={safeMargin} onChange={event=>{cancel();setSafeMargin(Number(event.target.value))}}/></label>
  <label>原图<select aria-label="海报原图" value={sourceId} onChange={event=>{cancel();setSourceId(event.target.value)}}><option value="">不使用</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
  <label>导入原图<input aria-label="导入海报原图" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{importImage(event.target.files?.[0],'image');event.target.value=''}}/></label>
  <label>商标<select aria-label="海报商标" value={logoId} onChange={event=>{cancel();setLogoId(event.target.value)}}><option value="">不使用</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
  <label>导入商标<input aria-label="导入海报商标" type="file" accept="image/png,image/jpeg,image/webp" onChange={event=>{importImage(event.target.files?.[0],'logo');event.target.value=''}}/></label>
  {error?<p role="alert">{error}</p>:null}<button type="button" onClick={preview}>预览海报</button>
  {plan&&candidate?<div aria-label="海报预览"><p>{plan.width}×{plan.height} · 文字 {plan.texts.length} 层 · 受保护素材 {plan.protectedSources.length} · 不生成文字像素</p><CanvasScene state={candidate} thumbnail/><ul>{plan.texts.map(text=><li key={text.id}>{text.text} · 可编辑</li>)}</ul></div>:null}
  <button type="button" disabled={!plan} onClick={apply}>确认应用</button><button type="button" onClick={()=>{cancel();setOpen(false)}}>取消</button>
 </section>:null}</div>
}
