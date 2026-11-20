import type { ImportProfilePolicy } from '../color/iccInput'
import type { ImageExportFormat } from '../render/exportImage'

const storageKey = 'draivio-file-preferences-v1'
export const exportFormats = ['png', 'jpeg', 'webp', 'svg'] as const satisfies readonly (ImageExportFormat | 'svg')[]

export type FilePreferences = {
  importSizing: 'auto' | 'canvas'
  importProfile: ImportProfilePolicy
  exportFormat?: typeof exportFormats[number]
  exportQuality?: number
}

export function readFilePreferences(): FilePreferences {
  const defaults: FilePreferences = { importSizing: 'auto', importProfile: 'preserve' }
  try {
    const importProfile = localStorage.getItem('draivio-import-profile') === 'assign' ? 'assign' : defaults.importProfile
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}')
    return {
      importSizing: saved?.importSizing === 'canvas' ? 'canvas' : defaults.importSizing,
      importProfile: saved?.importProfile === 'assign' || saved?.importProfile === 'preserve' ? saved.importProfile : importProfile,
      exportFormat: exportFormats.find(format => format === saved?.exportFormat),
      exportQuality: Number.isInteger(saved?.exportQuality) && saved.exportQuality >= 1 && saved.exportQuality <= 100 ? saved.exportQuality : undefined,
    }
  } catch {
    return defaults
  }
}

export function saveFilePreferences(preferences: FilePreferences) {
  localStorage.setItem(storageKey, JSON.stringify(preferences))
}
