import { describe, expect, it } from 'vitest'
import { applyCurvesLevels, buildCurvesLevelsLUT, buildCurveLUT, createCurveSampler, defaultCurves, sampleLUT, validateCurves } from './curves'
import { defaultLevels } from './levels'

describe('monotone curves', () => {
  it('preserves every byte, hidden RGB and alpha with the identity LUT', () => {
    const input = new Uint8ClampedArray(256 * 4)
    for (let i=0;i<256;i++) input.set([i,255-i,(i*19)%256,i],i*4)
    expect(applyCurvesLevels(input,buildCurvesLevelsLUT(defaultCurves(),defaultLevels()))).toEqual(input)
  })
  it('interpolates collinear fixed points exactly and clamps the input domain', () => {
    const sample=createCurveSampler([{x:0,y:.2},{x:.5,y:.5},{x:1,y:.8}])
    expect(sample(-1)).toBe(.2);expect(sample(2)).toBe(.8)
    for(let i=0;i<=100;i++)expect(sample(i/100)).toBeCloseTo(.2+.6*i/100,12)
    expect(sample(.5)).toBe(.5)
  })
  it('matches hand-calculated non-linear PCHIP gray-card samples', () => {
    const sample=createCurveSampler([{x:0,y:0},{x:.5,y:.25},{x:1,y:1}])
    // Slopes 0.5/1.5 produce limited endpoints 0/2 and harmonic midpoint 0.75.
    expect(sample(.25)).toBeCloseTo(.078125,12)
    expect(sample(.75)).toBeCloseTo(.546875,12)
    const lut=buildCurveLUT([{x:0,y:0},{x:.5,y:.25},{x:1,y:1}])
    expect(lut[1020]).toBeCloseTo(.078125,12)
    expect(lut[3060]).toBeCloseTo(.546875,12)
  })
  it('keeps steep plateaus monotone without interval overshoot', () => {
    const points=[{x:0,y:.1},{x:.1,y:.1},{x:.11,y:.9},{x:.8,y:.91},{x:1,y:.91}]
    const sample=createCurveSampler(points);let previous=.1
    for(let i=0;i<=10000;i++){const x=i/10000,y=sample(x);expect(Number.isFinite(y)).toBe(true);expect(y).toBeGreaterThanOrEqual(previous-1e-14);const k=points.findIndex(p=>p.x>=x);if(k>0){expect(y).toBeGreaterThanOrEqual(points[k-1].y-1e-14);expect(y).toBeLessThanOrEqual(points[k].y+1e-14)}previous=y}
  })
  it('rejects unordered, duplicate, nonfinite, unbounded or nonmonotone anchors', () => {
    const bad=[[],[{x:0,y:0}],[{x:.1,y:0},{x:1,y:1}],[{x:0,y:0},{x:.5,y:.5},{x:.5,y:.6},{x:1,y:1}],[{x:0,y:.7},{x:1,y:.2}],[{x:0,y:0},{x:NaN,y:1}],[{x:0,y:-.1},{x:1,y:1}]]
    for(const p of bad)expect(()=>createCurveSampler(p)).toThrow()
    expect(()=>validateCurves({...defaultCurves(),surprise:true})).toThrow()
    expect(()=>createCurveSampler([{x:0,y:0},{x:1,y:1,unknown:true}])).toThrow()
    expect(()=>createCurveSampler([{x:0,y:0},{x:Number.MIN_VALUE,y:.5},{x:1,y:1}])).toThrow()
    expect(()=>buildCurveLUT(defaultCurves().rgb,1)).toThrow()
    expect(()=>sampleLUT(new Float64Array([0,1]),NaN)).toThrow()
  })
  it('composes levels then master then channels and preserves partial alpha', () => {
    const c=defaultCurves();c.rgb=[{x:0,y:.1},{x:1,y:.9}];c.r=[{x:0,y:0},{x:1,y:.5}]
    const l={...defaultLevels(),inputBlack:.1,inputWhite:.9,gamma:2,outputBlack:.2,outputWhite:.8}
    const input=new Uint8ClampedArray([51,102,204,128]);const out=applyCurvesLevels(input,buildCurvesLevelsLUT(c,l))
    const reference=(byte:number)=>.1+.8*(.2+.6*Math.sqrt(Math.max(0,Math.min(1,(byte/255-.1)/.8))))
    expect([...out]).toEqual([Math.round(reference(51)*.5*255),Math.round(reference(102)*255),Math.round(reference(204)*255),128])
    expect([...input]).toEqual([51,102,204,128])
  })
  it('builds high precision immutable parameter snapshots with fractional samples', () => {
    const c=defaultCurves(), lut=buildCurvesLevelsLUT(c,defaultLevels())
    c.rgb[0].y=.5
    expect(lut.r).toBeInstanceOf(Float64Array);expect(lut.r.length).toBe(4081)
    expect(sampleLUT(lut.r,.123456)).toBeCloseTo(.123456,12)
    expect(()=>applyCurvesLevels(new Uint8ClampedArray(3),lut)).toThrow()
  })
})

it('preserves exact byte lattice values through legal sub-LUT-width levels and curves', () => {
  for (const code of [1,17,64,128,200,254]) {
    const center=code/255, source=new Uint8ClampedArray([code,code,code,128])
    const levels={...defaultLevels(),inputBlack:center-1e-6,inputWhite:center+1e-6}
    const levelResult=applyCurvesLevels(source,buildCurvesLevelsLUT(defaultCurves(),levels))
    expect([...levelResult]).toEqual([128,128,128,128])
    const curves=defaultCurves()
    curves.rgb=[{x:0,y:0},{x:center-1e-6,y:0},{x:center+1e-6,y:1},{x:1,y:1}]
    const curveResult=applyCurvesLevels(source,buildCurvesLevelsLUT(curves,defaultLevels()))
    expect([...curveResult]).toEqual([128,128,128,128])
  }
})
