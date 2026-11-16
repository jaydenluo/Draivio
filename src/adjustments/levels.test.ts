import { expect, it } from 'vitest'
import { buildLevelsLUT, createLevelsSampler, defaultLevels, validateLevels } from './levels'

it('uses independently calculated input/gamma/output levels and clips extremes',()=>{
 const sample=createLevelsSampler({inputBlack:.25,inputWhite:.75,gamma:2,outputBlack:.1,outputWhite:.9})
 expect(sample(0)).toBe(.1);expect(sample(1)).toBe(.9)
 expect(sample(.375)).toBeCloseTo(.5,12);expect(sample(.5)).toBeCloseTo(.1+.8*Math.sqrt(.5),12)
 const identity=buildLevelsLUT(defaultLevels());expect(identity.length).toBe(4081);expect(identity[2040]).toBe(.5)
})
it('rejects illegal and crossing levels instead of coercing them',()=>{
 for(const patch of [{inputBlack:.9,inputWhite:.1},{inputBlack:.5,inputWhite:.5},{gamma:0},{gamma:Infinity},{outputBlack:.9,outputWhite:.1},{outputWhite:2},{inputBlack:-1},{unexpected:1}])expect(()=>validateLevels({...defaultLevels(),...patch})).toThrow()
 expect(()=>createLevelsSampler(defaultLevels())(NaN)).toThrow()
 expect(()=>buildLevelsLUT(defaultLevels(),1)).toThrow()
 expect(()=>buildLevelsLUT(defaultLevels(),10000000)).toThrow()
})
it('allows a constant output and returns independent defaults',()=>{
 expect(createLevelsSampler({...defaultLevels(),outputBlack:.3,outputWhite:.3})(.9)).toBe(.3)
 const a=defaultLevels(),b=defaultLevels();a.gamma=2;expect(b.gamma).toBe(1)
})
