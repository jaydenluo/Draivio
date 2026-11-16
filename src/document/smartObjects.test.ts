import { describe, expect, test } from 'vitest'
import { createSmartObjectSource, rasterizeSmartObject, replaceSmartObjectInstance, sampleSourceSize, updateLinkedInstances, validateSmartObjectGraph } from './smartObjects'

const layer = { id: 'layer', name: '源', className: 'layer-art', kind: 'image' as const, source: 'data:image/png;base64,x', visible: true, opacity: 100, blendMode: '正常', contentWidth: 100, contentHeight: 50, transform: { kind: 'transform' as const, rect: { x: 10, y: 20, width: 40, height: 30 }, rotation: 12, flipX: false, flipY: false }, effects: { version: 1 as const, items: [] } }

describe('smart object source semantics', () => {
  test('samples from original source dimensions and replacement preserves instance fields', () => {
    const source = createSmartObjectSource(layer, 's1')
    expect(sampleSourceSize(source, 2)).toEqual({ width: 200, height: 100 })
    const instance = { ...layer, smartObject: { sourceId: 's1', linked: true, instanceWidth: 200, instanceHeight: 100, maskId: 'mask' } }
    const replacement = { ...source, id: 's2', source: 'data:image/png;base64,y', width: 80, height: 40, revision: 1 }
    expect(replaceSmartObjectInstance(instance, replacement)).toMatchObject({ source: replacement.source, transform: layer.transform, effects: layer.effects, smartObject: { sourceId: 's2', maskId: 'mask' } })
  })
  test('linked instances update while independent instances remain unchanged', () => {
    const layers = [{ ...layer, id: 'a', smartObject: { sourceId: 's1', linked: true, instanceWidth: 100, instanceHeight: 50 } }, { ...layer, id: 'b', smartObject: { sourceId: 's1', linked: false, instanceWidth: 100, instanceHeight: 50 } }]
    const next = updateLinkedInstances(layers, 's1', { source: 'new', width: 20, height: 10 })
    expect(next[0]).toMatchObject({ source: 'new', contentWidth: 100, contentHeight: 50 })
    expect(next[1].source).toBe(layer.source)
  })
  test('rejects missing sources, cycles, and excessive nesting', () => {
    expect(() => validateSmartObjectGraph({}, 'missing')).toThrow('缺失')
    expect(() => validateSmartObjectGraph({ a: { id: 'a', kind: 'document', source: 'fixture', width: 1, height: 1, revision: 1, parentSourceId: 'b' }, b: { id: 'b', kind: 'document', source: 'fixture', width: 1, height: 1, revision: 1, parentSourceId: 'a' } }, 'a')).toThrow('循环')
    const chain: Record<string, any> = {}; for (let i = 0; i < 10; i++) chain[`s${i}`] = { id: `s${i}`, kind: 'document', source: 'fixture', width: 1, height: 1, revision: 1, ...(i ? { parentSourceId: `s${i - 1}` } : {}) }
    expect(() => validateSmartObjectGraph(chain, 's9', 8)).toThrow('上限')
  })
  test('rasterization removes smart metadata while retaining source pixels', () => {
    const source = createSmartObjectSource(layer, 's1')
    const instance = { ...layer, smartObject: { sourceId: 's1', linked: true, instanceWidth: 100, instanceHeight: 50 } }
    expect(rasterizeSmartObject(instance, source)).toMatchObject({ kind: 'image', source: source.source, contentWidth: 100 })
    expect(rasterizeSmartObject(instance, source).smartObject).toBeUndefined()
  })
})


test.each(['image', 'document', 'text', 'shape'] as const)('rejects an empty %s source with no renderable data', kind => {
  expect(() => validateSmartObjectGraph({ empty: { id: 'empty', kind, width: 8, height: 8, revision: 1 } }, 'empty')).toThrow('缺失')
})

import { smartObjectState } from './smartObjects'
import { editorReducer, initialEditorState } from '../state/editor'
import { validateDocument } from './projectValidation'
import { decodeProject, encodeProject } from './projectFormat'
test('projects source content into its own canvas without inheriting parent artboard membership',async()=>{
 const parent=editorReducer(initialEditorState,{type:'convert-to-smart-object',id:'art'})
 const source=parent.smartObjectSources[parent.layers[0].smartObject!.sourceId]
 const internal=smartObjectState(parent,source)
 expect(internal.artboards).toHaveLength(1)
 expect(internal.artboards[0].layerIds).toEqual(source.document!.layers.map(layer=>layer.id))
 expect(internal.artboards[0]).toMatchObject({width:source.width,height:source.height,x:0,y:0,background:'transparent'})
 expect(internal.activeArtboardId).toBe(internal.artboards[0].id)
 expect(()=>validateDocument(parent)).not.toThrow()
 const loaded=decodeProject(await encodeProject(parent,{id:'nested',name:'nested'})).document
 expect(loaded.smartObjectSources![source.id].document).toEqual(source.document)
 const bad={...parent,artboards:parent.artboards.map(board=>({...board,layerIds:[...board.layerIds,'missing-outer']}))}
 expect(()=>validateDocument(bad)).toThrow(/layerIds/)
 const badInner={...parent,smartObjectSources:structuredClone(parent.smartObjectSources)};badInner.smartObjectSources[source.id].document!.canvasTexts=[{id:'orphan',layerId:'outside',text:'bad',x:0,y:0,fontFamily:'sans-serif',fontSize:12,fontWeight:'400',color:'#000',align:'left'}]
 expect(()=>validateDocument(badInner)).toThrow(/layerId/)
 await expect(encodeProject(badInner,{id:'bad',name:'bad'})).rejects.toThrow(/layerId/)
})
