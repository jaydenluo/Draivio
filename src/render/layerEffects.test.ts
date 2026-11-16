import {expect,it} from 'vitest'
import {defaultEffect,validateEffects,effectPadding,cloneEffects} from './layerEffects'
it('validates effect budgets and computes support without sharing stops',()=>{const effects={version:1 as const,items:[defaultEffect('shadow'),defaultEffect('gradientOverlay')]};expect(effectPadding(effects)).toBe(16);const copy=cloneEffects(effects);copy.items[1].stops[0].color='#ffffff';expect(effects.items[1].stops[0].color).toBe('#ff765f');for(const n of [-1,NaN,129])expect(()=>validateEffects({version:1,items:[{...defaultEffect('shadow'),blur:n}]})).toThrow()})
