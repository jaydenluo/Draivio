import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from '../../state/editor'
import { validateSchema } from './schema'
import { bindToolCall, executeToolCall, listExecutableTools, prepareToolCall } from './registry'

const state = initialEditorState
const call = (params: unknown = { key: 'brightness', value: 25 }) => bindToolCall(state, 'layer.adjustment', 'art', params)
describe('versioned executable tool registry', () => {
  it('executes the same reducer action for UI and AI and supports undo', () => {
    const prepared = prepareToolCall(state, call())
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    const ui = editorReducer(state, prepared.action)
    const ai = executeToolCall(state, call())
    expect(ai.ok).toBe(true)
    expect(ai.state.layers).toEqual(ui.layers)
    expect(ai.state.layers.find(l => l.id === 'art')?.adjustments?.brightness).toBe(25)
    expect(editorReducer(ai.state, { type: 'undo' }).layers).toEqual(state.layers)
  })
  it.each([
    ['unknown tool', { ...call(), toolId: 'healing' }],
    ['unknown version', { ...call(), version: 2 }],
    ['extra envelope field', { ...call(), code: 'eval' }],
    ['extra parameter', call({ key: 'brightness', value: 20, malicious: true })],
    ['NaN', call({ key: 'brightness', value: NaN })],
    ['Infinity', call({ key: 'brightness', value: Infinity })],
    ['out of range', call({ key: 'brightness', value: 101 })],
    ['negative blur', call({ key: 'blur', value: -1 })],
    ['unknown adjustment', call({ key: '__proto__', value: 1 })],
    ['missing target', { ...call(), targetId: 'gone' }],
    ['stale document', { ...call(), documentId: 'other' }],
    ['stale session', { ...call(), sessionId: 'other' }],
    ['stale revision', { ...call(), revision: 'other' }],
    ['null call', null],
  ])('rejects %s without changing any document state', (_label, input) => {
    const fingerprint = JSON.stringify(state)
    const result = executeToolCall(state, input)
    expect(result.ok).toBe(false)
    expect(result.state).toBe(state)
    expect(JSON.stringify(state)).toBe(fingerprint)
  })
  it('rejects ancestor locks, missing edit permission and resource limits', () => {
    const grouped = { ...state, layers: [{ id: 'g', name: 'locked group', children: ['art'], visible: true, opacity: 100, locked: true, blendMode: '正常', className: 'layer-group' }, ...state.layers.map(l => l.id === 'art' ? { ...l, groupId: 'g' } : l)] }
    expect(executeToolCall(grouped, call()).ok).toBe(false)
    expect(executeToolCall(state, call(), { canEdit: false }).ok).toBe(false)
    expect(executeToolCall(state, call(), { maxDocumentPixels: 1 }).ok).toBe(false)
  })
  it('publishes only executable current-version tools with input/output and effect metadata', () => {
    const tools = listExecutableTools()
    expect(tools.map(t => t.toolId)).toEqual(['layer.adjustment', 'layer.transform', 'layer.rename'])
    expect(listExecutableTools(2)).toEqual([])
    for (const tool of tools) {
      expect(tool.version).toBe(1)
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.outputSchema.type).toBe('object')
      expect(tool.scope).toBe('layer')
      expect(tool.cost).toBe('local')
      expect(tool.sideEffects).toContain('document')
    }
  })
  it('validates transform nested keys and executes rename through reducer semantics', () => {
    const transform = { kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: true, flipY: false }
    expect(executeToolCall(state, bindToolCall(state, 'layer.transform', 'art', transform)).state.layers[0].transform?.flipX).toBe(true)
    expect(executeToolCall(state, bindToolCall(state, 'layer.transform', 'art', { ...transform, rect: { ...transform.rect, width: 0 } })).ok).toBe(false)
    expect(executeToolCall(state, bindToolCall(state, 'layer.transform', 'art', { ...transform, rect: { ...transform.rect, url: 'x' } })).ok).toBe(false)
    expect(executeToolCall(state, bindToolCall(state, 'layer.rename', 'art', { name: '新名称' })).state.layers[0].name).toBe('新名称')
  })
})

it('rejects inherited fields, accessors, symbols and prototype-bearing parameter objects', () => {
  let getterCalled = false
  const accessorParams = { key: 'brightness', get value() { getterCalled = true; return 25 } }
  const inherited = Object.create(call())
  const inheritedParams = Object.assign(Object.create({ extra: 1 }), { key: 'brightness', value: 25 })
  for (const input of [inherited, call(inheritedParams), call(accessorParams), { ...call(), [Symbol('hidden')]: true }, call(JSON.parse('{"key":"brightness","value":25,"__proto__":{}}'))]) {
    expect(executeToolCall(state, input).ok).toBe(false)
    expect(executeToolCall(state, input).state).toBe(state)
  }
  expect(getterCalled).toBe(false)
})
it('rechecks binding in the reducer when a prepared UI dispatch arrives after a document reopen', () => {
  const prepared = prepareToolCall(state, call())
  expect(prepared.ok).toBe(true)
  if (!prepared.ok) return
  const reopened = { ...state, documentSessionId: 'new-session' }
  const next = editorReducer(reopened, prepared.action)
  expect(next.layers).toBe(reopened.layers)
  expect(next.undoStack).toBe(reopened.undoStack)
})
it('does not allow capability consumers to alter validation and rejects invalid resource policy', () => {
  const first = listExecutableTools()
  first[0].toolId = 'changed'
  expect(listExecutableTools()[0].toolId).toBe('layer.adjustment')
  for (const maxDocumentPixels of [NaN, Infinity, -1, 0, .5]) {
    expect(executeToolCall(state, call(), { maxDocumentPixels }).ok).toBe(false)
  }
  expect(executeToolCall(state, call(), { canEdit: 'yes' } as never).ok).toBe(false)
})
it('uses the same subtree lock gate as the reducer when renaming groups', () => {
  const group = { id: 'g', name: '组', className: 'layer-group', children: ['art'], visible: true, opacity: 100, blendMode: '正常' }
  const grouped = { ...state, layers: [group, ...state.layers.map(layer => layer.id === 'art' ? { ...layer, groupId: 'g', locked: true } : layer)] }
  const result = executeToolCall(grouped, bindToolCall(grouped, 'layer.rename', 'g', { name: '禁止' }))
  expect(result.ok).toBe(false)
  expect(result.state).toBe(grouped)
})

it('publishes the nonblank string constraint and follows JSON Schema minLength without trimming', () => {
  const renameSchema = listExecutableTools().find(tool => tool.toolId === 'layer.rename')!.inputSchema
  expect(renameSchema.type).toBe('object')
  if (renameSchema.type !== 'object') return
  expect(renameSchema.properties.name).toMatchObject({ type: 'string', minLength: 1, pattern: '\\S' })
  const rejected = executeToolCall(state, bindToolCall(state, 'layer.rename', 'art', { name: ' \t\n' }))
  expect(rejected.ok).toBe(false)
  expect(rejected.state).toBe(state)
  expect(() => validateSchema({ type: 'string', minLength: 2, maxLength: 10 }, ' a')).not.toThrow()
})
