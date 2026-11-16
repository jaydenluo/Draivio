/// <reference types="node" />
import { writeFileSync } from 'node:fs'
import { test, expect } from 'vitest'
import { applyLayerAdjustments } from '../../../src/imaging/layerAdjustments'
import { neutralAdjustments } from '../../../src/state/editor'
test('records local reference timings without treating them as native performance evidence',()=>{
 const samples=[]
 for(const size of [128,256]) {const input=Uint8ClampedArray.from({length:size*size*4},(_,i)=>i%4===3?255:(i*37)%256);const start=performance.now();const output=applyLayerAdjustments(input,size,size,{...neutralAdjustments,sharpness:70,blur:100});const elapsedMs=performance.now()-start;expect(output.length).toBe(input.length);samples.push({size,elapsedMs,parameters:{sharpness:70,blur:100}})}
 writeFileSync('docs/implementation/fixtures/adjustment-reference-timings.json',JSON.stringify({note:'One local CPU reference run; not browser/WebKit interactive rendering evidence.',samples},null,2)+'\n');console.log(JSON.stringify(samples))
})
