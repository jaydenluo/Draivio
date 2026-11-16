import { describe, expect, it } from 'vitest'
import { initialEditorState, type Layer } from '../state/editor'
import { encodeProject, decodeProject, projectFingerprint } from './projectFormat'

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4nGP4z8DwHwyBNBgAAEnICff5q7YNAAAAAElFTkSuQmCC'
const state = () => ({ ...structuredClone(initialEditorState),
  layers: [{ id: 'photo', name: '照片', className: 'layer-art', source: png, thumbnail: png, visible: true, opacity: 100, blendMode: '正常' }],
  selectedLayerId: 'photo', selectedLayerIds: ['photo'],
  canvasTexts: [{ id: 'text-a', layerId: 'photo', x: 10, y: 20, text: '可编辑文字', fontSize: 24, fontFamily: 'sans-serif', fontWeight: '400', color: '#112233', align: 'left' as const }],
})

describe('Draivio project files', () => {
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
})

it('rejects unsupported versions and malformed runtime state before restore', async () => {
  const raw = JSON.parse(await encodeProject(state(), { id: 'doc', name: '作品' }))
  const invalid = [
    { ...raw, metadata: undefined }, { ...raw, schemaVersion: 0 },
    { ...raw, document: { ...raw.document, documentWidth: 0 } },
    { ...raw, document: { ...raw.document, documentHeight: -1 } },
    { ...raw, document: { ...raw.document, layers: [] } },
    { ...raw, document: { ...raw.document, canvasTexts: null } },
    { ...raw, document: { ...raw.document, selection: null } },
    { ...raw, document: { ...raw.document, canvasTexts: [{ id: 'bad' }] } },
    { ...raw, document: { ...raw.document, layerMasks: { missing: {} } } },
  ]
  for (const value of invalid) expect(() => decodeProject(JSON.stringify(value))).toThrow()
})
it('preserves literal URLs and asset-prefixed prompts and text without downloading them', async () => {
  const input = state(); input.prompt = 'https://example.invalid/prompt'; input.canvasTexts[0].text = 'asset:literal-text';
  (input.layers[0] as Layer).aiOperation = { mode: 'edit', prompt: 'https://example.invalid/instruction', sourceLayerId: 'photo', selection: null, parameters: input.composerParameters } as never
  const file = await encodeProject(input, { id: 'd', name: 'p' }, async () => { throw new Error('must not download prompt') })
  const output = decodeProject(file).document
  expect(output.prompt).toBe(input.prompt)
  expect(output.canvasTexts?.[0].text).toBe('asset:literal-text')
})
it('rejects transient blob resources explicitly before a durable save', async () => {
  const input = state(); input.layers[0].source = 'blob:https://example.invalid/expired'
  await expect(encodeProject(input, { id: 'd', name: 'p' })).rejects.toThrow(/临时|blob/)
})

it('rejects conflicting parent links independently of layer order', async () => {
  const raw = JSON.parse(await encodeProject(state(), { id: 'd', name: 'p' }))
  const base = raw.document.layers[0]
  const layers = [{ ...base, id: 'group-a', children: ['photo'] }, { ...base, id: 'group-b' }, { ...base, id: 'photo', groupId: 'group-b' }]
  for (const entries of [layers, [...layers].reverse()]) expect(() => decodeProject(JSON.stringify({ ...raw, document: { ...raw.document, layers: entries } }))).toThrow()
})
it('stores stable history labels without embedded snapshots or credentials', async () => {
  const input = { ...state(), history: [{ id: 'h', label: '历史', tone: 'warm', snapshot: { apiKey: 'nested-history-secret', layers: state().layers } }] }
  const raw = await encodeProject(input as never, { id: 'd', name: 'p' })
  expect(JSON.parse(raw).document.history).toEqual([{ id: 'h', label: '历史', tone: 'warm' }])
  expect(raw).not.toContain('nested-history-secret')
})
it('drops arbitrary imported and exported metadata fields, including nested credentials', async () => {
  const metadata = { id: 'd', name: 'p', apiKey: 'metadata-secret', extra: { credentials: { token: 'nested-secret' } }, credentials: { key: 'credential-secret' } }
  const serialized = await encodeProject(state(), metadata)
  expect(serialized).not.toContain('metadata-secret')
  expect(serialized).not.toContain('nested-secret')
  const raw = JSON.parse(serialized); raw.metadata = metadata
  expect(decodeProject(JSON.stringify(raw)).metadata).toEqual({ id: 'd', name: 'p' })
})
it('rejects tiny, truncated and MIME-mismatched image payloads', async () => {
  const raw = JSON.parse(await encodeProject(state(), { id: 'd', name: 'p' }))
  for (const source of ['data:image/png;base64,AQID', png.slice(0, -12), png.replace('image/png', 'image/jpeg')]) {
    raw.assets['image-1'] = source
    expect(() => decodeProject(JSON.stringify(raw))).toThrow(/资源|图片/)
  }
})
it('embeds and restores AI source snapshots and replacement originals for offline comparison', async () => {
 const input = state()
 const original = { ...input.layers[0], source: 'https://example.invalid/original.png', thumbnail: 'https://example.invalid/original.png' }
 const request = { mode: 'edit' as const, prompt: 'asset:keep-this-prompt', sourceLayerId: 'photo', sourceImage: 'https://example.invalid/original.png', selection: null, parameters: input.composerParameters, sourceId: 'saved', batchId: 'batch-one' }
 input.layers[0] = { ...input.layers[0], aiOperation: request } as typeof input.layers[0]
 const withCandidates = { ...input, aiResults: [{ id: 'candidate', batchId: 'batch-one', source: png, thumbnail: png, model: 'model', provider: 'saved', size: '1024', prompt: request.prompt, status: 'success' as const, createdAt: '2026-11-14T00:00:00Z', favorite: false, adopted: true, request, adoptions: [{ kind: 'replace' as const, layerId: 'photo', originalLayer: original }] }] }
 const downloads: string[] = []
 const encoded = await encodeProject(withCandidates, { id: 'ai-doc', name: '候选' }, async url => { downloads.push(url); return png })
 expect(downloads).toEqual(['https://example.invalid/original.png'])
 const raw = JSON.parse(encoded)
 expect(raw.document.aiResults[0].request.sourceImage).toMatch(/^asset:/)
 expect(raw.document.aiResults[0].adoptions[0].originalLayer.source).toMatch(/^asset:/)
 const restored = decodeProject(encoded).document
 expect(restored.aiResults?.[0].request?.sourceImage).toBe(png)
 expect(restored.aiResults?.[0].adoptions?.[0].originalLayer?.source).toBe(png)
 expect(restored.layers[0].aiOperation?.sourceImage).toBe(png)
 expect(restored.aiResults?.[0].prompt).toBe('asset:keep-this-prompt')
 expect(withCandidates.aiResults[0].request.sourceImage).toBe('https://example.invalid/original.png')
 delete raw.assets['image-1']
 expect(() => decodeProject(JSON.stringify(raw))).toThrow(/资源/)
})
it('round trips disabled adjustment preview with retained parameters and rejects non-boolean preview flags', async () => {
  const input = state()
  Object.assign(input.layers[0], { adjustmentsEnabled: false, adjustments: { brightness: 35, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, blur: 0, shadows: 0, highlights: 0 } })
  const file = await encodeProject(input, { id: 'preview-doc', name: '预览关闭' })
  const restored = decodeProject(file).document.layers![0]
  expect(restored.adjustmentsEnabled).toBe(false)
  expect(restored.adjustments?.brightness).toBe(35)
  for (const flag of ['false', 'true', 0, 1, null]) {
    const raw = JSON.parse(file); raw.document.layers[0].adjustmentsEnabled = flag
    expect(() => decodeProject(JSON.stringify(raw))).toThrow(/adjustmentsEnabled/)
  }
})
it('rejects malformed AI adoption collections and validates complete detached original layers', async () => {
 const input = state()
 const request = { mode: 'generate' as const, prompt: '', sourceLayerId: 'photo', selection: null, parameters: input.composerParameters }
 const withCandidate = { ...input, aiResults: [{ id: 'candidate', model: 'model', provider: 'provider', prompt: '', size: '1024', createdAt: '2026-11-14', status: 'success' as const, adopted: false, favorite: false, request }] }
 const encoded = await encodeProject(withCandidate, { id: 'd', name: 'p' })
 const invalid = [
  { adoptions: '' }, { adoptions: {} }, { adoptions: [null] },
  { adoptions: [{ kind: 'wat', layerId: 'photo' }] }, { adoptions: [{ kind: 'add', layerId: '' }] },
  { adoptions: [{ kind: 'replace', layerId: 'photo' }] },
  { adoptions: [{ kind: 'replace', layerId: 'photo', originalLayer: { source: png } }] },
  { adoptions: [{ kind: 'replace', layerId: 'photo', originalLayer: { ...input.layers[0], opacity: '100' } }] },
  { batchId: 4 }, { request: { ...request, batchId: false } }, { request: { ...request, sourceImage: 42 } },
 ]
 for (const patch of invalid) {
  const raw = JSON.parse(encoded); Object.assign(raw.document.aiResults[0], patch)
  expect(() => decodeProject(JSON.stringify(raw)), JSON.stringify(patch)).toThrow(/文档结构/)
 }
 const raw = JSON.parse(encoded)
 raw.document.aiResults[0].adoptions = [{ kind: 'replace', layerId: 'deleted-target', originalLayer: { ...raw.document.layers[0], id: 'detached-original', groupId: 'deleted-group', children: ['deleted-child'] } }]
 expect(decodeProject(JSON.stringify(raw)).document.aiResults?.[0].adoptions?.[0].originalLayer?.id).toBe('detached-original')
})

it('keeps document session epochs out of durable files and snapshot fingerprints', async () => {
 const input = { ...state(), documentSessionId: 'never-save-session-epoch' }
 const file = await encodeProject(input, { id: 'd', name: 'p' })
 expect(file).not.toContain('never-save-session-epoch')
 expect(projectFingerprint(input)).toBe(projectFingerprint({ ...input, documentSessionId: 'another-session' }))
})
