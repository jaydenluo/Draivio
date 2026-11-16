import { defaultProfile } from './iccPipeline'
import { describe,it,expect } from 'vitest'
import { initialEditorState,editorReducer } from '../state/editor'
import { encodeProject,decodeProject } from '../document/projectFormat'
import { base64Bytes,fromBase64,cmykState,cmykPixel,retainRgbSource,rgbWorkingCopy,validateCmykRaster,type CmykRaster } from './cmykRaster'
const profile=()=>{const p=new Uint8Array(132);p.set(new TextEncoder().encode('CMYK'),16);p.set(new TextEncoder().encode('acsp'),36);return base64Bytes(p)}
export const raster=():CmykRaster=>({width:1,height:1,data:base64Bytes(new Uint8Array([0,0,0,255])),profile:profile(),profileName:'Synthetic schema fixture (not conversion)',previewPng:'data:image/png;base64,AAAA',rgb:'AAAA/w==',maximumInk:1,totalInkLimit:3})
describe('CMYK authoritative raster state',()=>{
 it('preserves original RGB, snapshots conversion atomically and undoes it',()=>{
  const before={...structuredClone(initialEditorState),pixelFormat:'rgba32f' as const,colorManagement:{profile:defaultProfile('display-p3'),renderingIntent:'relative-colorimetric' as const}},r={...raster(),sourceDocument:retainRgbSource(before)}
  const converted=editorReducer(before,{type:'apply-cmyk-document',expectedState:before,document:cmykState(before,r)})
  expect(converted.colorManagement.profile.id).toBe('srgb');expect(converted.pixelFormat).toBe('rgba8');expect(converted.colorModel).toBe('cmyk');expect(converted.cmykRaster?.data).toBe(r.data)
  expect(converted.cmykRaster?.sourceDocument?.layers).toEqual(before.layers)
  expect(editorReducer(converted,{type:'undo'}).layers).toEqual(before.layers)
  expect(editorReducer(converted,{type:'undo'}).colorModel).not.toBe('cmyk')
  expect(editorReducer(editorReducer(converted,{type:'undo'}),{type:'redo'}).cmykRaster?.data).toBe(r.data)
 })
 it('roundtrips project channels and device ICC without any conversion',async()=>{
  const state=cmykState(structuredClone(initialEditorState),raster()),encoded=await encodeProject(state,{id:'cmyk',name:'CMYK'})
  const restored=editorReducer(initialEditorState,{type:'restore-project',document:decodeProject(encoded).document})
  expect(restored.cmykRaster).toEqual(state.cmykRaster);expect(restored.layers).toEqual(state.layers);expect(restored.colorModel).toBe('cmyk')
 })
 it('blocks RGB filters/AI adoption but explicitly creates an undoable RGB work copy with source channels retained',()=>{
  const s=cmykState(structuredClone(initialEditorState),raster())
  const adjusted=editorReducer(s,{type:'set-layer-adjustment',id:'cmyk-preview',key:'brightness',value:30})
  expect(adjusted.layers).toBe(s.layers);expect(adjusted.notice).toContain('RGB 工作副本')
  const ai=editorReducer(s,{type:'apply-edit-plan',document:{layers:[]}});expect(ai.layers).toBe(s.layers)
  const rgb=editorReducer(s,{type:'apply-cmyk-document',expectedState:s,document:rgbWorkingCopy(s)})
  expect(rgb.colorModel).toBe('rgb');expect(rgb.cmykRaster).toBe(s.cmykRaster);expect(editorReducer(rgb,{type:'undo'}).colorModel).toBe('cmyk')
 })
 it('edits actual device channels with percent validation',()=>{
  expect([...fromBase64(cmykPixel(raster(),0,0,[50,20,0,100]))]).toEqual([128,51,0,255])
  expect(()=>cmykPixel(raster(),1,0,[0,0,0,100])).toThrow();expect(()=>cmykPixel(raster(),0,0,[0,0,0,101])).toThrow()
  expect(()=>validateCmykRaster({...raster(),data:'AAAA'})).toThrow()
 })
 it('new RGB document clears CMYK channels and undo restores them; stale generic candidates cannot switch mode',()=>{
  const s=cmykState(structuredClone(initialEditorState),raster())
  const fresh=editorReducer(s,{type:'new-document',width:20,height:30})
  expect(fresh.colorModel).toBe('rgb');expect(fresh.cmykRaster).toBeUndefined();expect(editorReducer(fresh,{type:'undo'}).cmykRaster).toEqual(s.cmykRaster)
  expect(editorReducer(s,{type:'apply-edit-plan',document:{colorModel:'rgb',layers:[]}}).colorModel).toBe('cmyk')
  const changed={...s,notice:'changed'}
  expect(editorReducer(changed,{type:'apply-cmyk-document',expectedState:s,document:rgbWorkingCopy(s)}).colorModel).toBe('cmyk')
 })
 it('rejects CMYK project metadata without channel data',async()=>{
  await expect(encodeProject({...initialEditorState,colorModel:'cmyk'},{id:'bad',name:'bad'})).rejects.toThrow(/四通道/)
 })
})
