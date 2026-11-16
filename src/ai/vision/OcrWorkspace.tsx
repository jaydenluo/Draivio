import {useEffect,useRef,useState} from 'react'
import {useEditor,type EditorState} from '../../state/editor'
import {contentRevision} from '../context/editorContext'
import {CanvasScene} from '../../canvas/CanvasScene'
import {imageToPng,type PixelImage} from '../../canvas/rasterTools'
import {contentFill} from '../../retouch/contentFill'
import {repairDeltaPixels,repairCoveragePath} from '../../retouch/cloneHeal'
import {SYSTEM_FONT_PRESETS} from '../../text/systemFonts'
import {message} from '../../ui/message'
import {captureOcrImage} from './ocrCapture'
import {recognizeNativeText} from './nativeOcr'
import {ocrRepairOptions} from './ocrRepair'
import type {OcrCandidate} from './ocr'
import {createTextReplacementPlan,textReplacementDocument,isGenericReplacementFont} from '../workflows/replaceText'
type Basis={documentId:string;layerId:string;revision:string;undo:number}
type Session=Basis&{image:PixelImage;candidates:OcrCandidate[]}
type Preview=Basis&{document:EditorState}
export function OcrWorkspace(){
 const {state,documentId,dispatch}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[session,setSession]=useState<Session|null>(null),[choice,setChoice]=useState(''),[directId,setDirectId]=useState(''),[replacement,setReplacement]=useState(''),[font,setFont]=useState('sans-serif'),[color,setColor]=useState('#000000'),[ack,setAck]=useState(false),[fontAck,setFontAck]=useState(false),[preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState('')
 const abort=useRef<AbortController|null>(null),epoch=useRef(0)
 const cancel=()=>{epoch.current++;abort.current?.abort();abort.current=null;setBusy(false);setPreview(null)}
 const clear=()=>{cancel();setSession(null);setChoice('');setAck(false);setFontAck(false)}
 useEffect(()=>{clear();setDirectId('')},[documentId,state.selectedLayerId])
 useEffect(()=>()=>{epoch.current++;abort.current?.abort()},[])
 const basis=():Basis=>({documentId:latest.current.documentId,layerId:latest.current.state.selectedLayerId,revision:contentRevision(latest.current.state),undo:latest.current.state.undoStack.length})
 const assertFresh=(b:Basis)=>{const value=latest.current;if(value.documentId!==b.documentId||value.state.selectedLayerId!==b.layerId||contentRevision(value.state)!==b.revision||value.state.undoStack.length!==b.undo)throw new Error('文档或目标已更改，请重新识别与预览')}
 const recognize=async()=>{
  clear();setError('');setDirectId('');const controller=new AbortController(),token=epoch.current,b=basis();abort.current=controller;setBusy(true)
  try{const image=await captureOcrImage(latest.current.state,controller.signal);const candidates=await recognizeNativeText(imageToPng(image),b.layerId,controller.signal);if(controller.signal.aborted||token!==epoch.current)return;assertFresh(b);if(!candidates.length)throw new Error('未识别到文字，请检查图层和图像清晰度');setSession({...b,image,candidates})}
  catch(e){if(!controller.signal.aborted&&token===epoch.current)setError(e instanceof Error?e.message:'识字失败')}
  finally{if(token===epoch.current){setBusy(false);abort.current=null}}
 }
 const selected=session?.candidates.find(c=>c.id===choice),direct=state.canvasTexts.find(t=>t.id===directId)
 const revision=contentRevision(state)
 useEffect(()=>{setFontAck(false);setPreview(null)},[direct?.id,direct?.fontFamily,revision])
 const canPreview=(!!direct||!!selected&&(selected.confidence>=.8||ack))&&(isGenericReplacementFont(font)||fontAck)
 const request=(b:Basis)=>({query:direct?.text??selected?.text??'',replacement,candidateId:direct?.id??selected?.id,fontFamily:font,confirmFontFallback:fontAck,color,confirmLowConfidence:ack,baseContentRevision:b.revision,baseUndoLength:b.undo})
 const makePreview=async()=>{
  cancel();setError('');const token=epoch.current,controller=new AbortController();abort.current=controller;setBusy(true)
  try{
   const b=direct?basis():session;if(!b)throw new Error('请先选择文字位置');assertFresh(b)
   let plan
   if(direct)plan=createTextReplacementPlan(latest.current.state,request(b))
   else{
    if(!session||!selected||selected.confidence<.8&&!ack)throw new Error('请核对低置信度文字和位置')
    const result=await contentFill(session.image,{...ocrRepairOptions(session.image,session.candidates,selected.id),signal:controller.signal})
    if(controller.signal.aborted||token!==epoch.current)return;assertFresh(b)
    plan=createTextReplacementPlan(latest.current.state,{...request(b),repairSource:imageToPng(repairDeltaPixels(session.image,result.image)),repairCoverage:repairCoveragePath(session.image,result.image)},session.candidates)
   }
   const document=textReplacementDocument(latest.current.state,plan);setPreview({...b,document})
  }catch(e){if(!controller.signal.aborted&&token===epoch.current)setError(e instanceof Error?e.message:'文字修补失败')}
  finally{if(token===epoch.current){setBusy(false);abort.current=null}}
 }
 const confirm=()=>{if(!preview)return;try{assertFresh(preview);dispatch({type:'apply-edit-plan',document:preview.document});clear();setDirectId('');setOpen(false);message.success('文字替换已应用，可整体撤销')}catch(e){setPreview(null);setError(e instanceof Error?e.message:'文字替换失败')}}
 const change=()=>{cancel();setError('')}
 return <div className="recipe-workspace"><button type="button" aria-expanded={open} onClick={()=>{clear();setError('');setOpen(!open)}}>识字与文字替换</button>{open?<section aria-label="识字与文字替换工作区">
 <p>已有文字层直接编辑。扁平图像由 macOS Apple Vision 离线识字；核对位置后本地修补，再创建可编辑文字。原字体不能自动还原，请选择替代字体。</p>
 <label>已有文字层<select aria-label="已有文字层" value={directId} disabled={busy} onChange={e=>{clear();setDirectId(e.target.value);const t=state.canvasTexts.find(x=>x.id===e.target.value);if(t){setReplacement(t.text);setFont(t.fontFamily);setColor(t.color)}}}><option value="">从图像识字</option>{state.canvasTexts.map(t=><option key={t.id} value={t.id}>{t.text} · {t.id}</option>)}</select></label>
 <button type="button" disabled={busy} onClick={()=>void recognize()}>识别当前图层</button>{busy?<><p role="status">正在本机处理…</p><button type="button" onClick={cancel}>停止处理</button></>:null}
 {session?<><p>请选择确切位置；不会自动采用同字或低置信度候选。</p><div role="group" aria-label="文字候选">{session.candidates.map(c=><button type="button" key={c.id} disabled={busy} aria-pressed={choice===c.id} onClick={()=>{change();setChoice(c.id);setReplacement(c.text);setAck(false);setFontAck(false)}}>{c.text} · {c.id} · {Math.round(c.confidence*100)}% · ({Math.round(c.quad[0].x)}, {Math.round(c.quad[0].y)})</button>)}</div><svg aria-label="文字位置预览" viewBox={`0 0 ${session.image.width} ${session.image.height}`} style={{width:'100%',maxHeight:240}}><image href={imageToPng(session.image)} width={session.image.width} height={session.image.height}/>{session.candidates.map(c=><polygon key={c.id} points={c.quad.map(p=>`${p.x},${p.y}`).join(' ')} fill="transparent" stroke={choice===c.id?'#ffbc60':'#57d3b9'} strokeWidth={2}/>)}</svg></>:null}
 {selected&&selected.confidence<.8?<label><input type="checkbox" aria-label="我已核对低置信度文字和位置" checked={ack} disabled={busy} onChange={e=>{change();setAck(e.target.checked)}}/>我已核对低置信度文字和位置</label>:null}
 <label>替换文字<input aria-label="替换文字" value={replacement} disabled={busy} onChange={e=>{change();setReplacement(e.target.value)}}/></label>
 <label>替代字体<select aria-label="替代字体" value={font} disabled={busy} onChange={e=>{change();setFont(e.target.value);setFontAck(false)}}><option value="sans-serif">系统无衬线（明确采用替代字体）</option><option value="serif">系统衬线</option>{direct&&!['sans-serif','serif'].includes(direct.fontFamily)?<option value={direct.fontFamily}>{direct.fontFamily}（原文字层）</option>:null}{SYSTEM_FONT_PRESETS.filter(f=>f.family!==direct?.fontFamily).map(f=><option key={f.family} value={f.family}>{f.label}（未验证）</option>)}</select></label>
 {!isGenericReplacementFont(font)?<label><input type="checkbox" aria-label="我确认此字体未验证且可能回退为系统字体" checked={fontAck} disabled={busy} onChange={e=>{change();setFontAck(e.target.checked)}}/>无法验证本机字体「{font}」，缺失时会使用系统替代字体。我确认此字体未验证且可能回退为系统字体。</label>:null}
 <label>文字颜色<input type="color" aria-label="文字颜色" value={color} disabled={busy} onChange={e=>{change();setColor(e.target.value)}}/></label>
 {error?<p role="alert">{error}</p>:null}<button type="button" disabled={busy||!canPreview||!replacement.trim()} onClick={()=>void makePreview()}>{direct?'预览文字替换':'预览文字修补'}</button>
 {preview?<div aria-label="替换预览"><p>修补区域限于所选文字四边形及 2px 边缘；复杂背景可能留痕，确认前检查。行距、对齐和替代字体保存在文字层，可继续编辑。</p><div style={{display:'flex',maxHeight:280}}><CanvasScene state={state} thumbnail/><CanvasScene state={preview.document} thumbnail/></div></div>:null}
 <button type="button" disabled={!preview||busy} onClick={confirm}>确认替换</button><button type="button" onClick={()=>{clear();setOpen(false)}}>取消</button>
 </section>:null}</div>
}
