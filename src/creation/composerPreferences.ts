export const generationCounts = ['1 张', '2 张', '3 张', '4 张', '6 张', '8 张']
export const defaultGenerationCount = '1 张'
const countStorageKey = 'draivio-generation-count'

export function readGenerationCount() {
  try {
    const saved = window.localStorage.getItem(countStorageKey)
    return saved && generationCounts.includes(saved) ? saved : defaultGenerationCount
  } catch {
    return defaultGenerationCount
  }
}

export function saveGenerationCount(count: string) {
  if (!generationCounts.includes(count)) return
  try {
    window.localStorage.setItem(countStorageKey, count)
  } catch {
    // Storage can be disabled; the current session should still work.
  }
}
