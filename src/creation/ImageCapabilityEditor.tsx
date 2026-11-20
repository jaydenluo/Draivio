import { Checkbox } from '../ui/Checkbox'
import {imageCapabilitiesFor, type ImageModelCapabilities, type ImageQuality} from './imageEditCapabilities'
import type {ServiceConnection} from './serviceConnections'

export function ImageRouteSummary({connection,model}:{connection:ServiceConnection;model:string}){
 if(!['openai_compatible','volcengine'].includes(connection.protocol))return <p className="service-storage-note">该协议尚未接入图片适配器，保存预设不会启用生成或编辑。</p>
 const caps=imageCapabilitiesFor(connection,model)
 return <p className="service-storage-note">{caps.generate?'可生成':'生成未启用'} · {caps.edit&&caps.reference?'可参考图编辑':'参考图未启用'} · {caps.maskedEdit?'可蒙版编辑':'蒙版未启用'}{caps.sizes?.length?` · 尺寸：${caps.sizes.join(' / ')}`:''}</p>
}
/** Provider declarations configure the existing adapter; they never install a new one. */
export function ImageCapabilityEditor({connection,model,onChange}:{connection:ServiceConnection;model:string;onChange:(capabilities:ImageModelCapabilities|undefined)=>void}){
 const caps=imageCapabilitiesFor(connection,model)
 const set=(patch:Partial<ImageModelCapabilities>)=>onChange({...caps,...patch})
 return <fieldset className="service-model-capabilities"><legend>{model}</legend><ImageRouteSummary connection={connection} model={model}/>{['openai_compatible','volcengine'].includes(connection.protocol)?<>
  <label><Checkbox aria-label={`${model} 启用图片生成`} checked={caps.generate} onChange={e=>set({generate:e.target.checked})}/>图片生成</label>
  <label><Checkbox aria-label={`${model} 启用参考图编辑`} checked={caps.edit&&caps.reference} onChange={e=>set({edit:e.target.checked,reference:e.target.checked,...(!e.target.checked?{maskedEdit:undefined}:{})})}/>启用参考图编辑</label>
  <label>图像传输<select aria-label={`${model} 图像传输`} value={caps.encoding} onChange={e=>set({encoding:e.target.value as ImageModelCapabilities['encoding']})}><option value="base64-json">JSON 中的 base64</option><option value="multipart">PNG 文件（multipart）</option></select></label>
  <label>蒙版方向<select aria-label={`${model} 蒙版方向`} disabled={!caps.edit||!caps.reference} value={caps.maskedEdit?.semantics??'none'} onChange={e=>set({maskedEdit:e.target.value==='none'?undefined:{semantics:e.target.value as 'white-edit'|'transparent-edit'}})}><option value="none">未声明，不发送蒙版请求</option><option value="transparent-edit">透明区域可编辑</option><option value="white-edit">白色区域可编辑</option></select></label>
  <label>支持的尺寸<input aria-label={`${model} 支持的尺寸`} placeholder="留空由服务约束，如 auto,1024x1024" value={caps.sizes?.join(',')??''} onChange={e=>set({sizes:e.target.value?e.target.value.split(',').map(s=>s.trim()):undefined})}/></label>
  <span>支持的画质</span>{(['auto','low','medium','high'] as ImageQuality[]).map(q=><label key={q}><Checkbox aria-label={`${model} 画质 ${q}`} checked={caps.quality?.includes(q)??false} onChange={e=>set({quality:e.target.checked?[...(caps.quality??[]),q]:(caps.quality??[]).filter(v=>v!==q)})}/>{q}</label>)}
  {([{key:'supportsSteps',label:'步数'},{key:'supportsGuidance',label:'引导强度'},{key:'supportsStrength',label:'编辑强度'}] as const).map(({key,label})=><label key={key}><Checkbox aria-label={`${model} ${label}`} checked={!!caps[key]} onChange={e=>set({[key]:e.target.checked})}/>{label}</label>)}
  {connection.imageCapabilities?.[model]?<button type="button" onClick={()=>onChange(undefined)}>恢复内置能力</button>:null}
 </>:null}</fieldset>
}
