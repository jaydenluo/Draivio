import { invoke, isTauri } from '@tauri-apps/api/core'
import type { DocumentWorkspace } from './documentWorkspace'
export const nativeRecoveryAvailable = isTauri()
export type NativeRecoveryEntry={documentId:string;revision:string;savedAt:number;project:string}
export async function writeNativeRecovery(entry:NativeRecoveryEntry){if(!isTauri())return false;await invoke('recovery_write',{entry});return true}
export async function listNativeRecovery(){if(!isTauri())return [] as NativeRecoveryEntry[];return await invoke<NativeRecoveryEntry[]>('recovery_list')}
export async function discardNativeRecovery(documentId:string){if(!isTauri())return false;await invoke('recovery_discard',{documentId});return true}
