import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'

export type WritableProject = { write: (text: string) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> }
export type ProjectFileHandle = { name?: string; createWritable: () => Promise<WritableProject>; getFile?: () => Promise<File> }
export type ProjectLocation = { token?: string; name: string; handle?: ProjectFileHandle }
type NativeProject = { token: string; name: string; contents?: string }
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

export async function openProjectFile(): Promise<{ text: string; location: ProjectLocation } | null> {
  if (isTauri()) {
    const file = await invokeCommand<NativeProject | null>('open_project_file')
    return file ? { text: file.contents!, location: { token: file.token, name: file.name } } : null
  }
  const picker = window as FilePickerWindow
  if (!picker.showOpenFilePicker) return null
  try {
    const [handle] = await picker.showOpenFilePicker({ types, multiple: false })
    const file = await handle.getFile!()
    if (file.size > 256 * 1024 * 1024) throw new Error('项目文件超过 256MB')
    return { text: await file.text(), location: { name: file.name, handle } }
  } catch (error) { if (error instanceof DOMException && error.name === 'AbortError') return null; throw error }
}

export function hasProjectPicker(): boolean { return isTauri() || !!(window as FilePickerWindow).showOpenFilePicker }
