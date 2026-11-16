/// <reference types="node" />
import { deflateSync } from 'node:zlib'
import { performance } from 'node:perf_hooks'
import { expect, it } from 'vitest'
import { initialEditorState } from '../state/editor'
import { decodeProject, encodeProject } from './projectFormat'
function crc32(data: Buffer) { let crc = 0xffffffff; for (const byte of data) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) } return (crc ^ 0xffffffff) >>> 0 }
function chunk(type: string, data: Buffer) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]) }
function image(seed: number) {
  const header = Buffer.alloc(13); header.writeUInt32BE(2048, 0); header.writeUInt32BE(2048, 4); header[8] = 8; header[9] = 6
  const row = Buffer.alloc(2048 * 4 + 1)
  for (let x = 0; x < 2048; x++) { row[1 + x * 4] = seed * 11; row[2 + x * 4] = x % 256; row[3 + x * 4] = seed; row[4 + x * 4] = 255 }
  const pixels = Buffer.alloc(row.length * 2048); for (let y = 0; y < 2048; y++) row.copy(pixels, y * row.length)
  return `data:image/png;base64,${Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`
}
it('round trips 100 layers with 20 real 2048px PNGs and records process memory', async () => {
  const images = Array.from({ length: 20 }, (_, index) => image(index + 1))
  const input = { ...initialEditorState, layers: Array.from({ length: 100 }, (_, index) => ({ id: `layer-${index}`, name: `图层${index}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: images[index % 20] })), selectedLayerId: 'layer-0', selectedLayerIds: ['layer-0'] }
  const baseline = process.memoryUsage().rss, start = performance.now()
  const serialized = await encodeProject(input, { id: 'scale-fixture', name: '100图层20张2048px' })
  const elapsed = performance.now() - start
  const restored = decodeProject(serialized)
  expect(restored.document.layers).toEqual(input.layers)
  expect(Object.keys(JSON.parse(serialized).assets)).toHaveLength(20)
  console.info(JSON.stringify({ label: 'F01 100 layers / 20 real 2048x2048 gradient PNG', saveMs: Math.round(elapsed), serializedBytes: Buffer.byteLength(serialized), baselineRssBytes: baseline, afterRssBytes: process.memoryUsage().rss, peakRssBytes: process.resourceUsage().maxRSS * 1024 }))
}, 20000)
