import {useEffect,useRef,useState} from 'react'
import {useEditor} from '../../state/editor'
import {chooseBatchInputs,chooseBatchDirectory,writeBatchOutput,type BatchDirectory} from '../../batch/batchIO'
import type {BatchInput} from '../../batch/batchProcessor'
import {parseRecipe,type RecipeValue} from '../recipes/schema'
import {RecipeBatch,type RecipeBatchRecord,type RecipeBatchConfig} from './recipeBatch'
import {processRecipeBatchInput} from './recipeBatchRender'
import {recipeBatchStorage} from './recipeBatchStorage'
import {message} from '../../ui/message'
const defaultRecipe={schemaVersion:1,id:'batch-opacity',version:1,name:'批量透明度',inputs:[{id:'target',required:true}],parameters:{opacity:{type:'number',default:70,min:0,max:100}},steps:[{id:'opacity',tool:'opacity',args:{layerId:{$input:'target'},value:{$parameter:'opacity'}}}]}
export function RecipeBatchWorkspace(){
 const {state}=useEditor(),[open,setOpen]=useState(false),[text,setText]=useState(JSON.stringify(defaultRecipe,null,2)),[parameters,setParameters]=useState('{}'),[slot,setSlot]=useState('target'),[concurrency,setConcurrency]=useState(1),[prefix,setPrefix]=useState('recipe'),[maxRequests,setMaxRequests]=useState(0),[budgetMicros,setBudgetMicros]=useState(0),[inputs,setInputs]=useState<BatchInput[]>([]),[directory,setDirectory]=useState<BatchDirectory|null>(null),[busy,setBusy]=useState(false),[record,setRecord]=useState<RecipeBatchRecord|null>(null),[history,setHistory]=useState<RecipeBatchRecord[]>([]),[links,setLinks]=useState<Record<string,string>>({}),[error,setError]=useState('')
 const queue=useRef<RecipeBatch|null>(null),urls=useRef<string[]>([]),alive=useRef(true),generation=useRef(0)
 const release=()=>{for(const u of urls.current)URL.revokeObjectURL(u);urls.current=[];setLinks({})}
 const refresh=async()=>{try{const values=await recipeBatchStorage.list();if(alive.current)setHistory(values)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'无法读取批处理历史')}}
 useEffect(()=>{alive.current=true;void refresh();return()=>{alive.current=false;generation.current++;queue.current?.cancel();for(const u of urls.current)URL.revokeObjectURL(u)}},[])
 const invalidate=()=>{generation.current++;queue.current?.cancel();queue.current=null;setRecord(null);release();setError('')}
 const config=():RecipeBatchConfig=>({recipe:parseRecipe(JSON.parse(text)),parameters:JSON.parse(parameters) as Record<string,RecipeValue>,inputSlot:slot,concurrency,prefix,maxRequests,budgetMicros})
 const inputFiles=async(folder:boolean)=>{try{const files=await chooseBatchInputs(folder);if(files){invalidate();setInputs(files)}}catch(e){setError(e instanceof Error?e.message:'选择文件失败')}}
 const outputDirectory=async()=>{try{const value=await chooseBatchDirectory();if(value){invalidate();setDirectory(value)}}catch(e){setError(e instanceof Error?e.message:'选择目录失败')}}
 const publish=async(value:RecipeBatchRecord,q?:RecipeBatch)=>{const entries:Record<string,string>={};for(const item of value.items){const blob=q?.results.get(item.id)??(item.resultId?await recipeBatchStorage.getResult(item.resultId):undefined);if(!alive.current)return;if(blob){const url=URL.createObjectURL(blob);urls.current.push(url);entries[item.id]=url}}if(alive.current)setLinks(entries)}
 const run=async(mode:'trial'|'batch'|'retry')=>{
  if(busy)return;setBusy(true);setError('');const token=generation.current
  try{
   if(!directory)throw new Error('请选择输出目录')
   let q=queue.current
   if(!q){if(mode!=='trial')throw new Error('请先试跑');q=new RecipeBatch(inputs,config(),{process:processRecipeBatchInput,write:(name,blob)=>writeBatchOutput(directory,name,blob),save:recipeBatchStorage.save,putResult:recipeBatchStorage.putResult,update:value=>{if(alive.current&&token===generation.current)setRecord(value)}});queue.current=q}
   if(mode==='trial')await q.trial();else if(mode==='batch')await q.run();else await q.retryFailed()
   if(alive.current&&token===generation.current){setRecord(structuredClone(q.record));release();await publish(q.record,q);await refresh();if(q.record.stopReason)setError(q.record.stopReason);else message.success(mode==='trial'?'试跑结束，请下载检查后开始剩余批量':'配方批处理结束，请核对逐项结果')}
  }catch(e){if(alive.current&&token===generation.current)setError(e instanceof Error?e.message:'批处理失败')}
  finally{if(alive.current)setBusy(false)}
 }
 const inspectHistory=async(value:RecipeBatchRecord)=>{if(busy)return;invalidate();setRecord(value);await publish(value)}
 const clearHistory=async(value:RecipeBatchRecord)=>{try{await recipeBatchStorage.remove(value);if(record?.id===value.id)invalidate();await refresh()}catch(e){setError(e instanceof Error?e.message:'删除历史失败')}}
 const status={pending:'待处理',running:'运行中',writing:'写出中',success:'成功',failed:'失败',cancelled:'已取消','budget-stopped':'预算停止','output-uncertain':'写出待核对',interrupted:'上次中断'}
 return <div className="recipe-workspace"><button type="button" aria-expanded={open} onClick={()=>setOpen(!open)}>配方批处理</button>{open?<section aria-label="AI 配方批处理工作区">
 <p>每个文件使用独立文档事务，不修改当前作品。先真实试跑一张，检查下载结果后再批量。当前仅运行本地配方：模型请求 0，模型费用 0；下列上限用于保守预留，不代表已接入收费模型。</p>
 <label>复制已保存配方<select aria-label="复制已保存配方" disabled={busy} defaultValue="" onChange={e=>{const saved=state.savedRecipes?.[Number(e.target.value)];if(saved){invalidate();setText(JSON.stringify(saved.recipe,null,2));setParameters(JSON.stringify(saved.parameters,null,2));setSlot(saved.recipe.inputs.find(i=>i.required)?.id??'target')}}}><option value="">选择或编辑下方JSON</option>{state.savedRecipes?.map((r,i)=><option key={i} value={i}>{r.recipe.name} v{r.recipe.version}</option>)}</select></label>
 <label>批量配方 JSON<textarea aria-label="批量配方 JSON" disabled={busy} value={text} onChange={e=>{invalidate();setText(e.target.value)}} rows={6}/></label><label>批量参数 JSON<textarea aria-label="批量参数 JSON" disabled={busy} value={parameters} onChange={e=>{invalidate();setParameters(e.target.value)}} rows={2}/></label>
 <label>逐文件输入槽<input aria-label="逐文件输入槽" value={slot} disabled={busy} onChange={e=>{invalidate();setSlot(e.target.value)}}/></label>
 <button type="button" disabled={busy} onClick={()=>void inputFiles(false)}>选择图片文件</button><button type="button" disabled={busy} onClick={()=>void inputFiles(true)}>选择图片文件夹</button><span>已选 {inputs.length} 张</span><button type="button" disabled={busy} onClick={()=>void outputDirectory()}>选择输出目录</button><span>{directory?.name??'未选择目录'}</span>
 <label>并发<select aria-label="批量并发" disabled={busy} value={concurrency} onChange={e=>{invalidate();setConcurrency(Number(e.target.value))}}><option value={1}>1</option><option value={2}>2</option></select></label><label>输出前缀<input aria-label="输出前缀" disabled={busy} value={prefix} onChange={e=>{invalidate();setPrefix(e.target.value)}}/></label>
 <label>模型请求次数上限<input type="number" min={0} step={1} aria-label="模型请求次数上限" disabled={busy} value={maxRequests} onChange={e=>{invalidate();setMaxRequests(Number(e.target.value))}}/></label><label>预算上限（整数微单位）<input type="number" min={0} step={1} aria-label="预算上限" disabled={busy} value={budgetMicros} onChange={e=>{invalidate();setBudgetMicros(Number(e.target.value))}}/></label>
 <button type="button" disabled={busy||!inputs.length||!directory||!!queue.current?.record.trialSucceeded} onClick={()=>void run('trial')}>试跑第一张</button><button type="button" disabled={busy||!queue.current?.record.trialSucceeded} onClick={()=>void run('batch')}>开始剩余批量</button><button type="button" disabled={busy||!queue.current||!record?.items.some(i=>i.status==='failed')} onClick={()=>void run('retry')}>仅重试失败项</button>{busy?<button type="button" onClick={()=>queue.current?.cancel()}>取消批量</button>:null}
 {error?<p role="alert">{error}</p>:null}{record?<><p>批次 {record.id} · 预留请求 {record.reservedRequests}/{record.config.maxRequests} · 预留费用 {record.reservedMicros}/{record.config.budgetMicros} 微单位</p>{!queue.current?<p>这是恢复历史，只读查看和下载；不会自动重发、重试或写出。输入权限需重新选择并创建新批次。</p>:null}<table aria-label="配方逐项结果"><thead><tr><th>文件</th><th>状态</th><th>尝试</th><th>结果</th></tr></thead><tbody>{record.items.map(item=><tr key={item.id}><td>{item.name}</td><td>{status[item.status]}</td><td>{item.attempts}</td><td>{item.output}<span>{item.error}</span>{links[item.id]?<a href={links[item.id]} download={`${prefix}-${item.index+1}.png`} aria-label={`下载 ${item.name}`}>下载 {item.name}</a>:null}</td></tr>)}</tbody></table></>:null}
 <details><summary>历史批次与重启恢复</summary><p>恢复仅加载记录和已生成PNG，不重新访问源文件或模型。写出待核对/上次中断不会自动重试。删除历史将清理保存的结果缓存，不删除已写出的文件。</p><button type="button" disabled={busy} onClick={()=>void refresh()}>刷新历史记录</button>{history.map(h=><div key={h.id}><button type="button" disabled={busy} onClick={()=>void inspectHistory(h)}>查看历史 {h.createdAt} · {h.config.recipe.name}</button><button type="button" disabled={busy} onClick={()=>void clearHistory(h)}>清理历史 {h.id}</button></div>)}</details>
 </section>:null}</div>
}
