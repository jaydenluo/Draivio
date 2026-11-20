import { Checkbox } from '../ui/Checkbox'
import type {ImagePricing} from '../ai/execution/generationJobs'
export function ImagePricingEditor({model,value,onChange}:{model:string;value?:ImagePricing;onChange:(value:ImagePricing|undefined)=>void}){
 const set=(patch:Partial<ImagePricing>)=>onChange({...value??{unit:'image',amount:0,currency:'USD'},...patch})
 return <fieldset className="service-model-capabilities"><legend>{model}</legend><label><Checkbox aria-label={`${model} 配置已知单价`} checked={!!value} onChange={e=>onChange(e.target.checked?{unit:'image',amount:0,currency:'USD'}:undefined)}/>按供应商价格配置估算；未配置显示费用未知</label>{value?<>
 <label>单价<input aria-label={`${model} 单价`} type="number" min="0" step="0.001" value={value.amount} onChange={e=>set({amount:Number(e.target.value)})}/></label>
 <label>计费单位<select aria-label={`${model} 计费单位`} value={value.unit} onChange={e=>set({unit:e.target.value as ImagePricing['unit']})}><option value="image">每张图片</option><option value="request">每次请求</option></select></label>
 <label>币种<input aria-label={`${model} 币种`} maxLength={3} value={value.currency} onChange={e=>set({currency:e.target.value.toUpperCase()})}/></label>
 <small>仅估算，不读取余额或实际账单；令牌计价和动态价格请保留为未知。</small></>:null}</fieldset>
}
