import { defaultHsl } from '../adjustments/hsl'
import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'
import { encodeProject, decodeProject, projectFingerprint } from './projectFormat'
import { defaultCurves } from '../adjustments/curves'
import { defaultLevels } from '../adjustments/levels'

const png = 'data:image/png;base64,iVBORw0KGgo='
const state = () => ({ ...structuredClone(initialEditorState),
  layers: [{ id: 'photo', name: '照片', className: 'layer-art', source: png, thumbnail: png, visible: true, opacity: 100, blendMode: '正常' }],
  selectedLayerId: 'photo', selectedLayerIds: ['photo'],
  canvasTexts: [{ id: 'text-a', layerId: 'photo', x: 10, y: 20, text: '可编辑文字', fontSize: 24, fontFamily: 'sans-serif', fontWeight: '400', color: '#112233', align: 'left' as const }],
})

describe('Draivio project files', () => {
  it('round trips curves and levels and restores each edit with undo and redo', async () => {
    const original=structuredClone(initialEditorState),curves=defaultCurves();curves.r=[{x:0,y:.1},{x:1,y:.8}]
    const levels={...defaultLevels(),inputBlack:.1,inputWhite:.9,gamma:1.5,outputWhite:.95}
    const a=editorReducer(original,{type:'set-layer-curves',id:'art',curves})
    const b=editorReducer(a,{type:'set-layer-levels',id:'art',levels})
    const preview=editorReducer(b,{type:'set-curve-preview',id:'art'});expect(preview.undoStack).toBe(b.undoStack);expect(await encodeProject(preview,{id:'p',name:'p'})).not.toContain('curvePreviewOffLayerId')
    const restored=decodeProject(await encodeProject(b,{id:'curves',name:'曲线色阶'}))
    expect(restored.document.layers[0].adjustments?.curves).toEqual(curves)
    expect(restored.document.layers[0].adjustments?.levels).toEqual(levels)
    const undone=editorReducer(b,{type:'undo'});expect(undone.layers[0].adjustments?.levels).toEqual(a.layers[0].adjustments?.levels)
    const redone=editorReducer(undone,{type:'redo'});expect(redone.layers[0].adjustments).toEqual(b.layers[0].adjustments)
  })
  it('round trips editable objects and embeds deduplicated image resources', async () => {
    const input = state()
    const file = await encodeProject(input, { id: 'doc-1', name: '作品' })
    const raw = JSON.parse(file)
    expect(Object.keys(raw.assets)).toHaveLength(1)
    expect(raw.document.layers[0].source).toMatch(/^asset:/)
    const restored = decodeProject(file)
    expect(restored.metadata.name).toBe('作品')
    expect(restored.document.layers).toEqual(input.layers)
    expect(restored.document.canvasTexts).toEqual(input.canvasTexts)
    expect(restored.document.selectedLayerId).toBe('photo')
  })
  it('round trips RAW source bytes, metadata and develop settings offline', async () => {
    const input = state()
    ;(input.layers[0] as any).rawSource = { bytes: [1, 2, 3, 4], metadata: { format: 'nef', orientation: 6, width: 2, height: 2 }, settings: { exposureEV: 1, whiteBalance: { r: 1, g: 2, b: 1 }, highlightRecovery: .2 }, checksum: 'abcdef12' }
    const restored = decodeProject(await encodeProject(input, { id: 'raw', name: 'RAW' }))
    expect((restored.document.layers[0] as any).rawSource).toEqual((input.layers[0] as any).rawSource)
  })
  it('round trips an independent repair layer without replacing the source', async () => {
    const input = editorReducer(initialEditorState, { type: 'add-repair-layer', baseLayerId: 'art', name: '修补结果', source: png })
    const restored = decodeProject(await encodeProject(input, { id: 'repair-doc', name: '修补' }))
    expect(restored.document.layers[0].className).toBe('layer-repair')
    expect(restored.document.layers.find((layer) => layer.id === 'art')?.source).toBe('fixture')
  })
  it('does not serialize preferences, credentials, in-flight jobs or history stacks', async () => {
    const input = { ...state(), apiKey: 'never-save-this', undoStack: [{ apiKey: 'secret-history' }], isGenerating: true }
    const raw = await encodeProject(input as never, { id: 'doc-1', name: '作品' })
    expect(raw).not.toContain('never-save-this')
    expect(raw).not.toContain('secret-history')
    expect(JSON.parse(raw).document).not.toHaveProperty('isGenerating')
  })
  it('rejects missing resources, broken references, corrupt files and future schema', async () => {
    const raw = JSON.parse(await encodeProject(state(), { id: 'd', name: 'p' }))
    expect(() => decodeProject('{')).toThrow(/无法读取/)
    expect(() => decodeProject(JSON.stringify({ ...raw, schemaVersion: 999 }))).toThrow(/新版本/)
    expect(() => decodeProject(JSON.stringify({ ...raw, assets: {} }))).toThrow(/资源/)
    raw.document.layers.push({ ...raw.document.layers[0] })
    expect(() => decodeProject(JSON.stringify(raw))).toThrow(/重复/)
  })
  it('migrates legacy version 1 inline sources with default canvas dimensions', () => {
    const restored = decodeProject(JSON.stringify({ format: 'draivio', schemaVersion: 1, metadata: { id: 'old', name: '旧作品' }, document: state() }))
    expect(restored.document.documentWidth).toBe(500)
    expect(restored.document.documentHeight).toBe(625)
    expect(restored.document.layers![0].source).toBe(png)
    expect(restored.document.pixelFormat).toBe('rgba8')
  })
  it.each(['rgba16', 'rgba32f'] as const)('round trips document pixel format %s', async (pixelFormat) => {
    const input = { ...state(), pixelFormat }
    const restored = decodeProject(await encodeProject(input, { id: 'precision', name: pixelFormat }))
    expect(restored.document.pixelFormat).toBe(pixelFormat)
  })
  it('rejects an unknown document pixel format', async () => {
    const raw = JSON.parse(await encodeProject(state(), { id: 'd', name: 'p' }))
    raw.document.pixelFormat = 'rgba64'
    expect(() => decodeProject(JSON.stringify(raw))).toThrow(/pixelFormat/)
  })
  it('makes dirty state depend on document content, not transient view or notices', () => {
    const a = state()
    expect(projectFingerprint(a)).toBe(projectFingerprint({ ...a, notice: '已保存', zoom: 50 }))
    expect(projectFingerprint(a)).not.toBe(projectFingerprint({ ...a, canvasTexts: [] }))
  })
  it('materializes remote images before saving and refuses failed downloads', async () => {
    const input = state(); input.layers[0].source = 'https://example.invalid/photo.png'
    const restored = decodeProject(await encodeProject(input, { id: 'd', name: 'p' }, async () => png))
    expect(restored.document.layers![0].source).toBe(png)
    await expect(encodeProject(input, { id: 'd', name: 'p' }, async () => { throw new Error('资源下载失败') })).rejects.toThrow('资源下载失败')
  })
  it('does not fetch URLs embedded in text metadata or layer names', async () => {
    const input = { ...state(), layers: [{ ...state().layers[0], name: 'https://127.0.0.1/private', source: png }], canvasTexts: [{ ...state().canvasTexts[0], text: 'prompt https://127.0.0.1/private' }] }
    let calls = 0
    const file = await encodeProject(input, { id: 'd', name: 'p' }, async () => { calls++; return png })
    expect(calls).toBe(0)
    expect(file).toContain('https://127.0.0.1/private')
  })
})

it('rejects illegal curve and levels mutations without changing document or history',()=>{
 const s=structuredClone(initialEditorState),c=defaultCurves();c.rgb=[{x:0,y:0},{x:.5,y:.5},{x:.5,y:.7},{x:1,y:1}]
 const a=editorReducer(s,{type:'set-layer-curves',id:'art',curves:c})
 expect(a.layers).toBe(s.layers);expect(a.undoStack).toBe(s.undoStack)
 const b=editorReducer(s,{type:'set-layer-levels',id:'art',levels:{...defaultLevels(),inputBlack:.8,inputWhite:.2}})
 expect(b.layers).toBe(s.layers);expect(b.undoStack).toBe(s.undoStack)
})

it('refuses curves and levels edits through a locked ancestor without history changes',()=>{
 const s=structuredClone(initialEditorState);s.layers=[{id:'g',name:'locked',kind:'group',className:'layer-group',visible:true,opacity:100,blendMode:'正常',locked:true,children:['art']},{...s.layers[0],groupId:'g'}]
 const c=defaultCurves();c.r=[{x:0,y:.1},{x:1,y:.9}]
 for(const action of [{type:'set-layer-curves',id:'art',curves:c},{type:'set-layer-levels',id:'art',levels:{...defaultLevels(),gamma:2}}] as const){const next=editorReducer(s,action);expect(next.layers).toBe(s.layers);expect(next.undoStack).toBe(s.undoStack);expect(next.notice).toContain('祖先')}
})

describe('adjustment preset project persistence', () => {
  it('round trips saved presets without image or private payloads', async () => {
    const presetState = { ...state(), adjustmentPresets: [{ version: 1, name: '暖色', hsl: { global: { hue: 4, saturation: 8, lightness: 0, range: 30 }, channels: defaultHsl().channels }, colorBalance: { preserveLuminosity: true, shadows: { cyanRed: 1, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 } }, image: undefined }] } as any
    const restored = decodeProject(await encodeProject(presetState, { id: 'p', name: 'x' }))
    expect(restored.document.adjustmentPresets).toEqual(presetState.adjustmentPresets)
  })
})

it('applies preset in one undoable transaction and resets predictably', () => {
  const original = state()
  const adjustments = { ...initialEditorState.layers[0].adjustments!, brightness: 27 }
  const changed = editorReducer(original, { type: 'set-layer-adjustments', id: 'photo', adjustments })
  expect(changed.layers[0].adjustments?.brightness).toBe(27)
  expect(editorReducer(changed, { type: 'undo' }).layers[0].adjustments).toBeUndefined()
  const reset = editorReducer(changed, { type: 'reset-layer-adjustments', id: 'photo' })
  expect(reset.layers[0].adjustments?.brightness).toBe(0)
})
