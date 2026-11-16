import { invoke } from '@tauri-apps/api/core'
import { RequestError } from './request'

/** Rust commands return controlled messages; never display raw JS/native error objects. */
export async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try { return await invoke<T>(command, args) }
  catch (reason) { throw new RequestError('native', typeof reason === 'string' ? reason : '本机请求失败，请重试') }
}
