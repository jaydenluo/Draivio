import { defaultCurves } from '../../adjustments/curves'
import { defaultLevels } from '../../adjustments/levels'
/** Bounded Chinese grammar; arbitrary prose is never interpreted as a color operation. */
export function parseColorInstruction(text:string,layerId?:string):{args?:Record<string,unknown>;clarification?:string;warning?:string}|null{
 const t=text.replace(/[“「『][^”」』]*[”」』]/g,'')
 if(!/色温|暖一点|冷一点|高光|曝光|白平衡|曲线|色阶|饱和度|投影|描边|内阴影|颜色叠加|渐变叠加|重置调整/.test(t))return null
 if(/不要|别|禁止|勿|不允许/.test(t))return {warning:'已遵守否定要求，不修改颜色或效果'}
 if(/删除|移动|旋转|复制|重命名|分组|缩放|翻转/.test(t))return {clarification:'请将颜色调整和其他编辑分成独立步骤'}
 if(!layerId)return {clarification:'颜色调整需要明确目标图层'}
 const scope=/选区|局部/.test(t)?'selection':'layer'
 const numeric=t.match(/(?:设为|设置为|调整为)\s*(-?\d+(?:\.\d+)?)\s*$/)
 const n=numeric?Number(numeric[1]):NaN
 let key:string|undefined,value:unknown
 const names:Record<string,string>={色温:'temperature',高光:'highlights',曝光:'exposureEV',饱和度:'saturation'}
 const colorNames:Record<string,string>={红色:'red',橙色:'orange',黄色:'yellow',绿色:'green',青色:'cyan',蓝色:'blue'}
 if(/重置/.test(t)){
  const name=Object.keys(names).find(k=>t.includes(k));key=`reset.${name?names[name]:/曲线/.test(t)?'curves':/色阶/.test(t)?'levels':/白平衡/.test(t)?'whiteBalance':/重置调整/.test(t)?'all':''}`
  if(key==='reset.')return {clarification:'请指定需要重置的单项调整'}
 }else if(/暖一点|冷一点/.test(t)){key='temperature';value=/冷一点/.test(t)?-10:10}
 else if(/降低高光\s*$/.test(t)){key='highlights';value=-10}
 else if(/白平衡增益/.test(t)){
  const m=t.match(/白平衡增益(?:设为|设置为)\s*([\d.]+)\/([\d.]+)\/([\d.]+)\s*$/)
  if(!m||m.slice(1).some(v=>!Number.isFinite(Number(v))||Number(v)<.01||Number(v)>100))return {clarification:'请指定有效白平衡 RGB 增益，例如 1.1/1/0.9'}
  key='whiteBalance';value={r:Number(m[1]),g:Number(m[2]),b:Number(m[3])}
 }else if(/曲线中点/.test(t)&&Number.isFinite(n)&&n>=0&&n<=1){const curves=defaultCurves();curves.rgb=[{x:0,y:0},{x:.5,y:n},{x:1,y:1}];key='curves';value=curves}
 else if(/色阶伽马/.test(t)&&Number.isFinite(n)&&n>=.01&&n<=100){key='levels';value={...defaultLevels(),gamma:n}}
 else if(/投影|描边|内阴影|颜色叠加|渐变叠加/.test(t)){
  if(scope==='selection')return {clarification:'图层效果仅支持明确整层范围'}
  const kind=/内阴影/.test(t)?'innerShadow':/投影/.test(t)?'shadow':/描边/.test(t)?'stroke':/渐变/.test(t)?'gradientOverlay':'colorOverlay'
  const field=/宽度/.test(t)?'width':/模糊/.test(t)?'blur':/距离/.test(t)?'distance':/不透明度/.test(t)?'opacity':undefined
  if(!field||!Number.isFinite(n)||n<0||n>(field==='opacity'?100:field==='distance'?512:128))return {clarification:'请指定效果及有效参数，例如“投影不透明度设为40”'}
  key=`effect.${kind}`;value={[field]:n}
 }else if(Number.isFinite(n)){
  const name=Object.keys(names).find(k=>t.includes(k)),color=Object.keys(colorNames).find(k=>t.includes(k))
  if(color&&/饱和度/.test(t)){key=`hsl.${colorNames[color]}.saturation`;value=n}
  else if(name){key=names[name];value=n}
  if(typeof value==='number'&&Math.abs(value)>(key==='exposureEV'?8:100))return {clarification:'颜色调整数值超出允许范围'}
 }
 if(!key)return {clarification:'请明确颜色参数，例如“降低高光”“只改红色饱和度设为-20”'}
 return {args:{layerId,key,...(value!==undefined?{value}:{}),...(scope==='selection'?{scope}:{})}}
}
