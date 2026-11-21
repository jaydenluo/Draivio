export type RememberedLogin = { remember: boolean; email: string }
const keyFor = (origin: string) => `draivio-remembered-login-v1:${encodeURIComponent(origin)}`

export function readRememberedLogin(origin: string): RememberedLogin {
  try {
    const value = JSON.parse(localStorage.getItem(keyFor(origin)) ?? '{}')
    return {
      remember: value?.remember !== false,
      email: typeof value?.email === 'string' && value.email.length <= 254 ? value.email : '',
    }
  } catch {
    return { remember: true, email: '' }
  }
}

export function writeRememberedLogin(origin: string, { remember, email }: RememberedLogin): boolean {
  try {
    localStorage.setItem(keyFor(origin), JSON.stringify({ remember, email }))
    return true
  } catch {
    return false
  }
}

export function removeLegacyPasswords() {
  try {
    for (const key of Object.keys(localStorage)) {
      const prefix = 'draivio-remembered-login-v1:'
      if (!key.startsWith(prefix)) continue
      const origin = decodeURIComponent(key.slice(prefix.length))
      writeRememberedLogin(origin, readRememberedLogin(origin))
    }
  } catch { /* Storage may be unavailable. */ }
}
