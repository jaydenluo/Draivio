export const generationCounts = ['1 张', '2 张', '3 张', '4 张', '6 张', '8 张']
export const defaultGenerationCount = '1 张'
const countStorageKey = 'draivio-generation-count'
const composerPreferencesStorageKey = 'draivio-composer-preferences-v1'

export type ComposerPreferences = {
  mode?: 'generate' | 'edit'
  creationMode?: 'generate' | 'edit' | 'smart' | 'auto'
  sourceId?: string
  model?: string
  ratio?: string
  size?: string
  count?: string
  strength?: string
}

function readStoredPreferences(): ComposerPreferences {
  if (typeof window === 'undefined') return {}
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(composerPreferencesStorageKey) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item === 'string')) as ComposerPreferences
  } catch {
    return {}
  }
}

export function readComposerPreferences(): ComposerPreferences {
  return readStoredPreferences()
}

export function saveComposerPreferences(preferences: ComposerPreferences) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(composerPreferencesStorageKey, JSON.stringify({ ...readStoredPreferences(), ...preferences }))
  } catch {
    // Storage can be disabled; the current session should still work.
  }
}

export function readGenerationCount() {
  try {
    const saved = window.localStorage.getItem(countStorageKey)
    if (saved !== null) return generationCounts.includes(saved) ? saved : defaultGenerationCount
  } catch {
    return defaultGenerationCount
  }
  const savedComposerCount = readStoredPreferences().count
  return savedComposerCount && generationCounts.includes(savedComposerCount) ? savedComposerCount : defaultGenerationCount
}

export function saveGenerationCount(count: string) {
  if (!generationCounts.includes(count)) return
  saveComposerPreferences({ count })
  try {
    window.localStorage.setItem(countStorageKey, count)
  } catch {
    // Storage can be disabled; the current session should still work.
  }
}
