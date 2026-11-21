import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'

export type CloudSessionStorage = {
  read: (origin: string) => Promise<string | null>
  write: (origin: string, token: string | null) => Promise<void>
}

export const supportsRememberedSession = () => isTauri() && /Mac|Win/.test(navigator.platform)

export const nativeCloudSessionStorage: CloudSessionStorage = {
  read: origin => supportsRememberedSession() ? invokeCommand('cloud_session_read', { origin }) : Promise.resolve(null),
  write: (origin, token) => supportsRememberedSession() ? invokeCommand('cloud_session_write', { origin, token }) : Promise.resolve(),
}
