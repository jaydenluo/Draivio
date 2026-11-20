import { describe, it, expect, vi } from 'vitest'
import { initialEditorState } from '../state/editor'
import { encodeProject,serializableDocument } from './projectFormat'
import {makeSoftProofProfile,defaultSoftProofSettings} from '../color/softProof'
import {
  prepareProjectContainer,
  decodeProjectContainer,
} from './projectContainer'
const ref = { assetId: 'a'.repeat(48), revision: 1 }
const metadata = { id: 'project', name: 'portable' }
const state = () => structuredClone(initialEditorState)
describe('v4 bounded manifest adapter', () => {
  it('restores proof and CMYK profile bytes as typed arrays for existing renderers',async()=>{
    const s=state(),bytes=new Uint8Array(132);bytes.set(new TextEncoder().encode('RGB '),16);bytes.set(new TextEncoder().encode('acsp'),36)
    s.proofSettings={...defaultSoftProofSettings(),enabled:true,targetProfile:makeSoftProofProfile(bytes)}
    const document=serializableDocument({...s,cmykProfile:{id:'custom',name:'custom',totalInkLimit:3,iccBytes:bytes}} as never)
    const loaded=decodeProjectContainer({format:'draivio',schemaVersion:4,metadata,document,assets:[],workingDiffs:[],legacySources:{},ownerId:'open:icc'})
    expect(loaded.document.proofSettings?.targetProfile?.bytes).toBeInstanceOf(Uint8Array)
    expect(Array.from(loaded.document.proofSettings!.targetProfile!.bytes.subarray(36,40))).toEqual([97,99,115,112])
    expect(loaded.document.cmykProfile?.iccBytes).toBeInstanceOf(Uint8Array)
  })
  it('preserves durable references and edits, strips runtime display data, and retains the legacy guard', async () => {
    const s = state()
    s.layers[0] = {
      ...s.layers[0],
      rasterRef: ref,
      source: 'blob:display',
      opacity: 43,
    }
    const manifest = await prepareProjectContainer(s, metadata, {
      ownerId: 'save:test',
      registerInline: vi.fn(),
    })
    expect(manifest.references).toEqual([ref])
    expect(manifest.document.layers[0].opacity).toBe(43)
    expect(manifest.document.layers[0].source).toBeUndefined()
    expect(JSON.stringify(manifest)).not.toContain('blob:')
    await expect(encodeProject(s, metadata)).rejects.toThrow('v4')
  })
  it('migrates real bounded legacy source bytes once across nested snapshots and restores them', async () => {
    const s = state(),
      source = 'data:image/png;base64,AQID'
    s.layers[0].source = source
    s.aiResults = [{ id: 'old', source } as never]
    const registerInline = vi.fn(async () => ({
      hash: 'b'.repeat(64),
      byteLength: 3,
      mime: 'image/png',
    }))
    const manifest = await prepareProjectContainer(s, metadata, {
      ownerId: 'save:test',
      registerInline,
    })
    expect(registerInline).toHaveBeenCalledTimes(1)
    expect(manifest.document.layers[0].source).toBe(
      `project-source:${'b'.repeat(64)}`,
    )
    expect(manifest.legacySources).toEqual(['b'.repeat(64)])
    const loaded = decodeProjectContainer({
      format: 'draivio',
      schemaVersion: 4,
      metadata,
      document: manifest.document,
      assets: [],
      workingDiffs: [],
      legacySources: { ['b'.repeat(64)]: source },
      ownerId: 'open:test',
    } as never)
    expect(loaded.document.layers[0].source).toBe(source)
    expect(loaded.document.aiResults?.[0].source).toBe(source)
  })
  it('rejects a giant inline source before native migration or serialization', async () => {
    const s = state()
    s.layers[0].source = `data:image/png;base64,${'A'.repeat(24 * 1024 * 1024)}`
    const registerInline = vi.fn()
    await expect(
      prepareProjectContainer(s, metadata, {
        ownerId: 'save:test',
        registerInline,
      }),
    ).rejects.toThrow('16 MiB')
    expect(registerInline).not.toHaveBeenCalled()
  })
  it('rejects forged v4 references and unrecognized versions', () => {
    const document = {
      ...state(),
      layers: [
        {
          ...state().layers[0],
          rasterRef: { assetId: '../../file', revision: 1 },
        },
      ],
    }
    expect(() =>
      decodeProjectContainer({
        format: 'draivio',
        schemaVersion: 4,
        metadata,
        document,
        assets: [],
        workingDiffs: [],
        legacySources: {},
        ownerId: 'open:test',
      } as never),
    ).toThrow()
    expect(() =>
      decodeProjectContainer({ format: 'draivio', schemaVersion: 5 } as never),
    ).toThrow('版本')
  })
})
