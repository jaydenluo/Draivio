import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './editor'
import { createPixelBuffer } from '../render/pixelBuffer'
import { packPrecisionAsset } from '../render/precisionAsset'
import { encodeProject, decodeProject } from '../document/projectFormat'

describe('high precision originals in editor and project',()=>{
  const asset=packPrecisionAsset(createPixelBuffer(1,1,'rgba32f',[2.5,1.25,-.25,1]))
  it('imports a typed original plus separate display preview as one undoable action',async()=>{
    const state=editorReducer({...initialEditorState,layers:[],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[]},{type:'import-precision-image',id:'hdr',name:'原始 EXR',asset,preview:'data:image/png;base64,cHJldmlldw=='})
    expect(state.layers[0].highPrecision).toEqual(asset);expect(state.pixelFormat).toBe('rgba32f')
    expect(state.undoStack).toHaveLength(initialEditorState.undoStack.length+1)
    const project=decodeProject(await encodeProject(state,{id:'p',name:'HDR'})).document
    expect(project.layers[0].highPrecision).toEqual(asset)
    expect(editorReducer(state,{type:'undo'}).layers).toEqual([])
  })
  it('rejects stale processed results and locked layers without changing originals',()=>{
    const state=editorReducer({...initialEditorState,layers:[],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[]},{type:'import-precision-image',id:'hdr',name:'HDR',asset,preview:'data:image/png;base64,cA=='})
    const stale=editorReducer(state,{type:'set-precision-resource',id:'hdr',asset,preview:'x',expectedAsset:{...asset}})
    expect(stale.layers).toBe(state.layers)
    const locked={...state,layers:state.layers.map(l=>l.id==='hdr'?{...l,locked:true}:l)}
    expect(editorReducer(locked,{type:'set-precision-resource',id:'hdr',asset,preview:'x',expectedAsset:asset}).layers).toBe(locked.layers)
  })
  it('refuses8bit adjustment and smart filter edits on preserved originals',()=>{
    const state=editorReducer({...initialEditorState,layers:[],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[]},{type:'import-precision-image',id:'hdr',name:'HDR',asset,preview:'data:image/png;base64,cA=='})
    const adjusted=editorReducer(state,{type:'set-layer-adjustment',id:'hdr',key:'exposureEV',value:1})
    expect(adjusted.layers).toBe(state.layers)
    expect(adjusted.notice).toMatch(/高精度|8 位副本/)
    const tool=editorReducer(state,{type:'select-tool',tool:'brush'})
    expect(tool.activeTool).toBe(state.activeTool)
    expect(tool.notice).toMatch(/高精度|8 位副本/)
  })
})
