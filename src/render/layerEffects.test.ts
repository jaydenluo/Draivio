import {expect,it} from 'vitest'
import {defaultEffect,validateEffects,effectPadding,cloneEffects} from './layerEffects'
it('validates effect budgets and computes support without sharing stops',()=>{const effects={version:1 as const,items:[defaultEffect('shadow'),defaultEffect('gradientOverlay')]};expect(effectPadding(effects)).toBe(16);const copy=cloneEffects(effects);copy.items[1].stops[0].color='#ffffff';expect(effects.items[1].stops[0].color).toBe('#ff765f');for(const n of [-1,NaN,129])expect(()=>validateEffects({version:1,items:[{...defaultEffect('shadow'),blur:n}]})).toThrow()})
it('validates optional style controls and reads legacy data unchanged',()=>{
 const old={version:1 as const,items:[defaultEffect('shadow')]}
 expect(validateEffects(old)).toEqual(old)
 for(const patch of [{spread:-1},{spread:101},{scale:0},{scale:401},{offsetX:101},{blendMode:'bad'},{gradientType:'bad'},{reverse:1},{useGlobalLight:'yes'}])expect(()=>validateEffects({version:1,items:[{...defaultEffect('shadow'),...patch}]})).toThrow()
 expect(()=>validateEffects({version:1,globalLightAngle:NaN,items:[]})).toThrow()
})
