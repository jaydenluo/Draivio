/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { expect, it } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'
import { decodeProject, encodeProject, projectFingerprint } from './projectFormat'
const fixture = readFileSync('docs/implementation/fixtures/editable-project-v2.draivio', 'utf8')
it('offline round trips every editable content type and edits each after restore', async () => {
  const decoded = decodeProject(fixture)
  const network = async () => { throw new Error('offline') }
  const serialized = await encodeProject(decoded.document, decoded.metadata, network)
  const again = decodeProject(serialized)
  expect(projectFingerprint(again.document)).toBe(projectFingerprint(decoded.document))
  expect(Object.keys(JSON.parse(serialized).assets)).toHaveLength(1)
  let state = editorReducer(initialEditorState, { type: 'restore-project', document: again.document })
  state = editorReducer(state, { type: 'upsert-text', object: { ...state.canvasTexts[0], text: '已编辑文字' } })
  state = editorReducer(state, { type: 'commit-layer-transform', layerId: 'photo', transform: { ...state.layers[1].transform!, rotation: 30 } })
  state = editorReducer(state, { type: 'remove-stroke', id: 'stroke' })
  state = editorReducer(state, { type: 'invert-mask' })
  state = editorReducer(state, { type: 'set-layer-adjustment', id: 'photo', key: 'brightness', value: 12 })
  state = editorReducer(state, { type: 'rename-layer', id: 'group', name: '已编辑分组' })
  state = editorReducer(state, { type: 'toggle-ai-result-favorite', id: 'result' })
  expect(state.canvasTexts[0].text).toBe('已编辑文字')
  expect(state.canvasShapes[0]).toEqual(again.document.canvasShapes![0])
  expect(state.layers.find(layer => layer.id === 'photo')?.transform?.rotation).toBe(30)
  expect(state.brushStrokes).toEqual([])
  expect(state.layerMasks.photo.inverted).toBe(true)
  expect(state.layers.find(layer => layer.id === 'photo')?.adjustments?.brightness).toBe(12)
  expect(state.layers.find(layer => layer.id === 'group')?.name).toBe('已编辑分组')
  expect(state.aiResults[0].favorite).toBe(false)
  const bytes = Buffer.from(again.document.layers[1].source!.split(',')[1], 'base64')
  expect(bytes.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
  const compressed: Buffer[] = []
  for (let offset = 8; offset < bytes.length;) { const length = bytes.readUInt32BE(offset); if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length)); offset += 12 + length }
  // Independent PNG decompression asserts all four actual RGBA pixels, including row filter bytes.
  expect(inflateSync(Buffer.concat(compressed)).toString('hex')).toBe('00ff0000ff00ff00ff000000ffffffffffff')
})
