import type { LayerAdjustments } from '../state/editor'
import { validateCurves } from './curves'
import { validateLevels } from './levels'
import { normalizePreset } from './presets'
export const NUMERIC_ADJUSTMENTS=['brightness','contrast','saturation','temperature','sharpness','blur','shadows','highlights','exposureEV','tint'] as const
export type NumericAdjustment=typeof NUMERIC_ADJUSTMENTS[number]
export function validateAdjustmentSettings(value:unknown):LayerAdjustments{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('颜色调整结构无效')
 const a=value as Record<string,unknown>
 if(Object.keys(a).some(k=>![...NUMERIC_ADJUSTMENTS,'curves','levels','hsl','colorBalance','whiteBalance'].includes(k as NumericAdjustment)))throw new Error('颜色调整包含未知字段')
 for(const key of NUMERIC_ADJUSTMENTS){if(a[key]===undefined&&['exposureEV','tint'].includes(key))continue;const n=a[key],bound=key==='exposureEV'?8:100;if(typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>bound)throw new Error(`${key} 参数超出范围`)}
 if(a.curves!==undefined)validateCurves(a.curves)
 if(a.levels!==undefined)validateLevels(a.levels)
 if(a.hsl!==undefined||a.colorBalance!==undefined)normalizePreset({version:1,name:'validate',hsl:a.hsl,colorBalance:a.colorBalance})
 if(a.whiteBalance!==undefined){const w=a.whiteBalance as Record<string,unknown>;if(!w||typeof w!=='object'||Array.isArray(w)||Object.keys(w).some(k=>!['r','g','b'].includes(k))||!['r','g','b'].every(k=>typeof w[k]==='number'&&Number.isFinite(w[k])&&(w[k] as number)>=.01&&(w[k] as number)<=100))throw new Error('白平衡增益无效')}
 return structuredClone(value as LayerAdjustments)
}
