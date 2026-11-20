import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'
import type {NativeContainer,ContainerRequest,ProjectSource} from './projectContainer'

export type WritableProject = { write: (text: string) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }
export type ProjectFileHandle = { name?: string; createWritable: () => Promise<WritableProject>; getFile?: () => Promise<File> }
export type ProjectLocation = { token?: string; name: string; handle?: ProjectFileHandle; schemaVersion?: number }
type NativeProject = { token: string; name: string; contents?: string; container?: NativeContainer; schema_version?: number }
export type OpenedProjectFile={text?:string;container?:NativeContainer;location:ProjectLocation}
type FilePickerWindow = Window & {
  showSaveFilePicker?: (options: unknown) => Promise<ProjectFileHandle>
  showOpenFilePicker?: (options: unknown) => Promise<ProjectFileHandle[]>
}
const types = [{ description: 'Draivio 项目', accept: { 'application/json': ['.draivio'] } }]

export async function writeProjectFile(handle: ProjectFileHandle, text: string) {
  const stream = await handle.createWritable()
  try { await stream.write(text); await stream.close() }
  catch (error) { try { await stream.abort() } catch { /* Preserve the original write failure. */ } throw error }
}

export async function saveProjectFile(text: string, name: string, location?: ProjectLocation): Promise<ProjectLocation | null> {
  if (isTauri()) return invokeCommand<NativeProject | null>('save_project_file', { contents: text, token: location?.token ?? null, suggestedName: name })
  const picker = window as FilePickerWindow
  if (location?.handle || picker.showSaveFilePicker) {
    try {
      const handle = location?.handle ?? await picker.showSaveFilePicker!({ suggestedName: `${name}.draivio`, types })
      await writeProjectFile(handle, text)
      return { name: handle.name ?? `${name}.draivio`, handle }
    } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error }
  }
  // Download-only browsers cannot confirm a durable write; keep the document dirty.
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `${name}.draivio`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
  throw new Error('已请求下载项目副本；此浏览器无法确认文件已保存，请检查下载目录。')
}

function nativeProject(file:NativeProject):OpenedProjectFile{return {text:file.contents,container:file.container,location:{token:file.token,name:file.name,schemaVersion:file.container?4:file.schema_version??3}}}
export async function openProjectToken(token:string):Promise<OpenedProjectFile>{return nativeProject(await invokeCommand<NativeProject>('open_project_token',{token}))}
export async function readBrowserProjectFile(file:File,handle?:ProjectFileHandle):Promise<OpenedProjectFile>{
  const header=await file.slice(0,16).text()
  if(header.startsWith('DRAIVIO4'))throw new Error('此浏览器不支持受预算的 v4 二进制项目读写，请在桌面版通过打开按钮读取')
  if(file.size>64*1024*1024)throw new Error('旧 JSON 项目超过 64 MiB 解析预算')
  return {text:await file.text(),location:{name:file.name,handle,schemaVersion:3}}
}
export async function openProjectFile(): Promise<OpenedProjectFile | null> {
  if (isTauri()) {
    const file = await invokeCommand<NativeProject | null>('open_project_file')
    return file ? nativeProject(file) : null
  }
  const picker = window as FilePickerWindow
  if (!picker.showOpenFilePicker) return null
  try {
    const [handle] = await picker.showOpenFilePicker({ types, multiple: false })
    const file = await handle.getFile!()
    return readBrowserProjectFile(file,handle)
  } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error }
}

export async function saveProjectContainer(request:ContainerRequest,name:string,location?:ProjectLocation):Promise<ProjectLocation|null>{
  if(!isTauri())throw new Error('此浏览器不支持受预算的 v4 二进制项目保存，请使用桌面版')
  const saved=await invokeCommand<NativeProject|null>('save_project_container',{request,token:location?.schemaVersion===4?location.token??null:null,suggestedName:name})
  return saved?{token:saved.token,name:saved.name,schemaVersion:4}:null
}
export async function registerProjectInline(source:string,ownerId:string):Promise<ProjectSource>{if(!isTauri())throw new Error('v4 项目迁移需要桌面版');return invokeCommand('register_project_inline',{source,ownerId})}
export async function releaseProjectContainer(ownerId:string):Promise<void>{if(isTauri())await invokeCommand('release_project_container',{ownerId})}

export function hasProjectPicker(): boolean { return isTauri() || !!(window as FilePickerWindow).showOpenFilePicker }
