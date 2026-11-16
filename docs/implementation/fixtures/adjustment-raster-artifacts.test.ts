/// <reference types="node" />
// Offline acceptance artifacts only; no product source changes or browser automation.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { expect, test } from 'vitest'
import { decodeProject, encodeProject } from '../../../src/document/projectFormat'
import { applyLayerAdjustments } from '../../../src/imaging/layerAdjustments'
import { neutralAdjustments, type LayerAdjustments } from '../../../src/state/editor'
const root = 'docs/implementation/fixtures/'
test('validates the editable browser card and writes exact CPU reference RGBA artifacts', async () => {
 const decoded=decodeProject(readFileSync(root+'adjustment-colorcard-64.draivio','utf8'))
 const d=decoded.document
 expect([d.documentWidth,d.documentHeight]).toEqual([64,64]);expect(d.layers).toHaveLength(1);expect(d.layers[0].adjustments).toEqual(neutralAdjustments);expect(d.selectionVisible).toBe(false);expect(d.layers[0].transform).toBeUndefined();expect(d.canvasTexts).toEqual([]);expect(d.canvasShapes).toEqual([]);expect(d.brushStrokes).toEqual([]);expect(d.layerMasks).toEqual({});expect(d.layers[0].source).toBe('data:image/png;base64,'+readFileSync(root+'adjustment-colorcard-64.png').toString('base64'))
 expect(decodeProject(await encodeProject(d,decoded.metadata)).document.layers).toEqual(d.layers)
 const input=new Uint8ClampedArray(readFileSync(root+'adjustment-colorcard-64.rgba'));expect(input).toHaveLength(64*64*4)
 const cases:Record<string,{parameters:LayerAdjustments;rgba:string}>={};mkdirSync(root+'adjustment-expected',{recursive:true})
 const variants:Array<[string,Partial<LayerAdjustments>]>=[['neutral',{}],...Object.keys(neutralAdjustments).map(key=>[key+'35',{[key]:35}] as [string,Partial<LayerAdjustments>]),['blur100',{blur:100}],['clarity70',{sharpness:70}]]
 for(const [name,changes] of variants){const parameters={...neutralAdjustments,...changes};const output=applyLayerAdjustments(input,64,64,parameters);const rgba=name+'.rgba';writeFileSync(root+'adjustment-expected/'+rgba,output);cases[name]={parameters,rgba}}
 writeFileSync(root+'adjustment-expected/manifest.json',JSON.stringify({width:64,height:64,colorSpace:'encoded sRGB',cases},null,2)+'\n')
})
