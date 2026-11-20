import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const { native } = vi.hoisted(() => ({ native: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: native, isTauri: () => true }))
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async () => () => {},
    listen: async () => () => {},
  }),
}))
import { EditorProvider } from '../state/editor'
import { ProjectFileControl } from './ProjectFileControl'
import { createDocumentSession } from './documentWorkspace'
import {useDocumentWorkspace} from './DocumentWorkspaceProvider'
import { serializableDocument, encodeProject } from './projectFormat'
import {
  imageAssetStore,
  imageResourceOwnership,
} from '../assets/imageAssetStore'
import { readBrowserProjectFile } from './projectStorage'
const reference = { assetId: 'a'.repeat(48), revision: 1 }
const asset = {
  protocolVersion: 1,
  assetId: 'runtime',
  session: 'session',
  revision: 1,
  lease: 'lease',
  rasterRef: reference,
  contentHash: 'b'.repeat(64),
  profile: null,
  metadata: {
    width: 16,
    height: 16,
    bands: 4,
    sampleType: 'u8',
    orientation: 1,
    pages: 1,
    format: 'png',
    editingSupported: true,
    profileHash: null,
  },
}
const job = {
  protocolVersion: 1,
  jobId: 'job',
  assetId: 'runtime',
  revision: 1,
  phase: 'ready',
  resource: {
    resourceId: 'preview',
    session: 'session',
    assetId: 'runtime',
    revision: 1,
    mime: 'image/png',
    bytes: 100,
    role: 'preview',
    width: 16,
    height: 16,
    coordinateSpace: 'display',
    displayTransformHash: 'transform',
    resourceUrl: 'http://draivio-image.localhost/preview',
  },
  error: null,
  contentHash: null,
}
function container() {
  const session = createDocumentSession('v4 原件')
  session.state.layers[0].rasterRef = reference
  return {
    format: 'draivio',
    schemaVersion: 4,
    metadata: session.metadata,
    document: serializableDocument(session.state),
    assets: [
      {
        reference,
        originalHash: 'b'.repeat(64),
        byteLength: 128,
        metadata: { format: 'png' },
      },
    ],
    workingDiffs: [],
    legacySources: {},
    ownerId: 'open:fixture',
  }
}
let opened: ReturnType<typeof container>
beforeEach(() => {
  localStorage.clear()
  native.mockReset()
  opened = container()
  native.mockImplementation(async (command: string) => {
    if (command === 'open_project_file')
      return {
        token: 'picked',
        name: 'v4.draivio',
        container: opened,
        schema_version: 4,
      }
    if (command === 'image_resource_reopen') return asset
    if (command === 'image_asset_start' || command === 'image_asset_job')
      return job
    if (command === 'save_project_container')
      return { token: 'saved', name: 'saved.draivio', schema_version: 4 }
    if (command === 'save_project_file')
      return { token: 'legacy', name: 'legacy.draivio', schema_version: 3 }
    if (command === 'load_service_connections') return null
    return undefined
  })
})
describe('actual workspace binary project flow', () => {
  it('retries a close disposal failure before releasing the closed project roots',async()=>{
    const normal=native.getMockImplementation()!;let disposals=0
    native.mockImplementation((command,...args)=>command==='image_asset_dispose'&&++disposals===1?Promise.reject('transient'):normal(command,...args))
    render(<EditorProvider><ProjectFileControl/></EditorProvider>)
    fireEvent.click(screen.getByRole('button',{name:'打开'}));await screen.findByRole('img',{name:'项目只读预览'})
    fireEvent.click(screen.getByRole('button',{name:'关闭文档：v4 原件'}))
    await waitFor(()=>expect(native).toHaveBeenCalledWith('release_project_container',{ownerId:'open:fixture'}))
    const commands=native.mock.calls.map(c=>c[0]);expect(commands.filter(c=>c==='image_asset_dispose')).toHaveLength(2)
    expect(commands.lastIndexOf('image_asset_dispose')).toBeLessThan(commands.indexOf('release_project_container'))
  })
  it('retains failed-preview capabilities in cleanup until a later open can dispose them',async()=>{
    const normal=native.getMockImplementation()!;let failing=true
    native.mockImplementation((command,...args)=>command==='image_asset_job'&&failing?Promise.reject('preview failed'):command==='image_asset_dispose'&&failing?Promise.reject('dispose failed'):normal(command,...args))
    render(<EditorProvider><ProjectFileControl/></EditorProvider>)
    fireEvent.click(screen.getByRole('button',{name:'打开'}))
    await waitFor(()=>expect(native.mock.calls.filter(c=>c[0]==='image_asset_dispose')).toHaveLength(3))
    expect(native.mock.calls.some(c=>c[0]==='release_project_container')).toBe(false)
    failing=false;fireEvent.click(screen.getByRole('button',{name:'打开'}))
    await screen.findByRole('img',{name:'项目只读预览'})
    expect(native).toHaveBeenCalledWith('release_project_container',{ownerId:'open:fixture'})
  })
  it('retains durable roots through failed disposal and retries after unmount on the next open',async()=>{
    const normal=native.getMockImplementation()!;let failing=true
    native.mockImplementation((command,...args)=>command==='image_asset_dispose'&&failing?Promise.reject('offline'):normal(command,...args))
    const first=render(<EditorProvider><ProjectFileControl/></EditorProvider>)
    fireEvent.click(screen.getByRole('button',{name:'打开'}));await screen.findByRole('img',{name:'项目只读预览'})
    first.unmount()
    await waitFor(()=>expect(native.mock.calls.filter(c=>c[0]==='image_asset_dispose')).toHaveLength(3))
    expect(native.mock.calls.some(c=>c[0]==='release_project_container')).toBe(false)
    failing=false
    render(<EditorProvider><ProjectFileControl/></EditorProvider>)
    fireEvent.click(screen.getByRole('button',{name:'打开'}))
    await waitFor(()=>expect(native).toHaveBeenCalledWith('release_project_container',{ownerId:'open:fixture'}))
    await screen.findByRole('img',{name:'项目只读预览'})
  })
  it('reserves an opening slot across deferred ownership and blocks a concurrent new document',async()=>{
    function Slots(){const{newDocument,workspace}=useDocumentWorkspace();return <><output data-testid="slots">{workspace.documents.length}</output><button onClick={()=>newDocument()}>创建并发文档</button><ProjectFileControl/></>}
    let finish!:()=>void,adopting=false
    const replace=vi.spyOn(imageResourceOwnership,'replace').mockImplementation(async(_owner,refs)=>{if(refs.length&&!adopting){adopting=true;await new Promise<void>(resolve=>{finish=resolve})}})
    render(<EditorProvider><Slots/></EditorProvider>)
    for(let i=0;i<14;i++)fireEvent.click(screen.getByRole('button',{name:'创建并发文档'}))
    expect(screen.getByTestId('slots')).toHaveTextContent('15')
    fireEvent.click(screen.getByRole('button',{name:'打开'}));await waitFor(()=>expect(finish).toBeTypeOf('function'))
    fireEvent.click(screen.getByRole('button',{name:'创建并发文档'}));expect(screen.getByTestId('slots')).toHaveTextContent('15')
    await act(async()=>finish());await screen.findByRole('img',{name:'项目只读预览'});replace.mockRestore()
  })
  it('rejects opaque working diffs before opening an incomplete preview and releases the temporary owner', async () => {
    opened.workingDiffs = ['c'.repeat(64)] as never
    render(
      <EditorProvider>
        <div data-testid="original">
          <ProjectFileControl />
        </div>
      </EditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith('release_project_container', {
        ownerId: 'open:fixture',
      }),
    )
    expect(screen.getByTestId('original')).toBeInTheDocument()
    expect(
      screen.queryByRole('img', { name: '项目只读预览' }),
    ).not.toBeInTheDocument()
    expect(
      native.mock.calls.some((c) => c[0] === 'image_resource_reopen'),
    ).toBe(false)
  })
  it('opens native descriptors into a visible read-only preview, saves v4, and releases only its owner on close', async () => {
    render(
      <EditorProvider>
        <div data-testid="editor-tools">
          <ProjectFileControl />
          <button>导出与 AI 编辑入口</button>
        </div>
      </EditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await screen.findByRole('img', { name: '项目只读预览' })
    expect(screen.queryByTestId('editor-tools')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: '导出与 AI 编辑入口' }),
    ).not.toBeInTheDocument()
    expect(imageAssetStore.resolve(reference)).toBe(job.resource.resourceUrl)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith(
        'save_project_container',
        expect.objectContaining({ token: 'picked' }),
      ),
    )
    const call = native.mock.calls.find(
      (c) => c[0] === 'save_project_container',
    )![1]
    expect(call.request.references).toEqual([reference])
    expect(JSON.stringify(call.request)).not.toContain('resourceUrl')
    expect(JSON.stringify(call.request)).not.toContain('rasterPreviewOnly')
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: '关闭文档：v4 原件' }))
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith('release_project_container', {
        ownerId: 'open:fixture',
      }),
    )
    expect(imageAssetStore.resolve(reference)).toBeUndefined()
    expect(native).toHaveBeenCalledWith('image_asset_dispose', {
      assetId: 'runtime',
      lease: 'lease',
    })
  })
  it('keeps edits dirty when a frozen native v4 save finishes after a rename', async () => {
    let finish!: (value: unknown) => void
    const normal = native.getMockImplementation()!
    native.mockImplementation((command, ...args) =>
      command === 'save_project_container'
        ? new Promise((resolve) => {
            finish = resolve
          })
        : normal(command, ...args),
    )
    render(
      <EditorProvider>
        <ProjectFileControl />
      </EditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await screen.findByRole('img', { name: '项目只读预览' })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), {
      target: { value: '保存期间新名称' },
    })
    await act(async () =>
      finish({ token: 'saved', name: 'old.draivio', schema_version: 4 }),
    )
    expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
  })
  it('does not adopt or leak an open owner when unmounted during asynchronous document ownership', async () => {
    let finish!: () => void,
      adopting = false
    const replace = vi
      .spyOn(imageResourceOwnership, 'replace')
      .mockImplementation(async (_owner, refs) => {
        if (refs.length && !adopting) {
          adopting = true
          await new Promise<void>((resolve) => {
            finish = resolve
          })
        }
      })
    const view = render(
      <EditorProvider>
        <ProjectFileControl />
      </EditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    view.unmount()
    await act(async () => finish())
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith('release_project_container', {
        ownerId: 'open:fixture',
      }),
    )
    expect(native.mock.calls.some(([command,args])=>command==='image_resource_replace_roots'&&args.roots.every((root:{references:unknown[]})=>root.references.length===0))).toBe(true)
    expect(imageAssetStore.resolve(reference)).toBeUndefined()
    replace.mockRestore()
  })
  it('preserves v1–v3 ordinary saves and uses a fresh target for explicit upgrade Save As', async () => {
    const session = createDocumentSession('旧项目'),
      text = await encodeProject(session.state, session.metadata)
    const normal = native.getMockImplementation()!
    native.mockImplementation((command, ...args) =>
      command === 'open_project_file'
        ? Promise.resolve({
            token: 'legacy-picked',
            name: 'legacy.draivio',
            contents: text,
            schema_version: 3,
          })
        : normal(command, ...args),
    )
    render(
      <EditorProvider>
        <ProjectFileControl />
      </EditorProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: '打开' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue(
        '旧项目',
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith(
        'save_project_file',
        expect.objectContaining({ token: 'legacy-picked' }),
      ),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '保存' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: '另存为' }))
    await waitFor(() =>
      expect(native).toHaveBeenCalledWith(
        'save_project_container',
        expect.objectContaining({ token: null }),
      ),
    )
  })
  it('rejects browser binary files from their header before any full file read', async () => {
    const text = vi.fn(),
      slice = vi.fn(() => ({ text: async () => 'DRAIVIO4\r\n\x1a\n\0\0\0\0' }))
    const file = {
      name: 'large.draivio',
      size: 300 * 1024 * 1024,
      text,
      slice,
    } as unknown as File
    await expect(readBrowserProjectFile(file)).rejects.toThrow('此浏览器不支持')
    expect(text).not.toHaveBeenCalled()
    expect(slice).toHaveBeenCalledWith(0, 16)
  })
})
