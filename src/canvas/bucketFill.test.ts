import { describe, expect, it } from 'vitest'
import { bucketSelection, selectionInLayer, fillShapeAt } from './bucketFill'
import { createSelection, selectionContains } from './selectionGeometry'
import { initialEditorState, editorReducer } from '../state/editor'

const image = { width: 5, height: 5, data: new Uint8ClampedArray([
 [0,0,0,0,0], [0,255,255,255,0], [0,255,255,255,0], [0,255,255,255,0], [0,0,0,0,0],
].flat(2).flatMap(v => [v,v,v,255])) }
describe('bucket fill', () => {
 it('fills inside a closed painted square without touching its border', () => {
  const s = bucketSelection(image, {x:50,y:50}, 32, true)
  expect(selectionContains(s.path,{x:50,y:50})).toBe(true)
  expect(selectionContains(s.path,{x:5,y:50})).toBe(false)
 })
 it('limits fill to selection and optionally matches disconnected colors', () => {
  const separated = { width:3,height:1,data:new Uint8ClampedArray([255,255,255,255,0,0,0,255,255,255,255,255]) }
  expect(selectionContains(bucketSelection(separated,{x:10,y:50},0,true).path,{x:90,y:50})).toBe(false)
  expect(selectionContains(bucketSelection(separated,{x:10,y:50},0,false).path,{x:90,y:50})).toBe(true)
  const s=bucketSelection(image,{x:50,y:50},32,true,createSelection('rectangle',{x:0,y:0,width:50,height:100}))
  expect(selectionContains(s.path,{x:70,y:50})).toBe(false)
 })
 it('maps region through scaled layer coordinates', () => {
  const state={...initialEditorState,layers:[{...initialEditorState.layers[0],transform:{kind:'transform' as const,rect:{x:25,y:25,width:50,height:50},rotation:0,flipX:false,flipY:false}}]}
  const local=selectionInLayer(state,createSelection('rectangle',{x:25,y:25,width:25,height:50}))
  expect(selectionContains(local.path,{x:25,y:50})).toBe(true)
  expect(selectionContains(local.path,{x:75,y:50})).toBe(false)
 })
 it('recolors a closed vector without replacing its geometry and supports undo', () => {
  const shape={id:'box',layerId:'art',kind:'rectangle' as const,rect:{x:20,y:20,width:60,height:60},color:'#000000',strokeColor:'#123456',strokeWidth:2,fillEnabled:false}
  const state={...initialEditorState,canvasShapes:[shape],sceneOrder:['box']}
  expect(fillShapeAt(state,{x:50,y:50})?.id).toBe('box')
  const next=editorReducer(state,{type:'update-shape',shape:{...shape,color:'#ff0000',fillEnabled:true}})
  expect(next.canvasShapes[0]).toMatchObject({rect:shape.rect,strokeColor:'#123456',color:'#ff0000'})
  expect(editorReducer(next,{type:'undo'}).canvasShapes[0]).toEqual(shape)
  expect(fillShapeAt({...state,selectionVisible:true},{x:50,y:50})).toBeUndefined()
 })
})
