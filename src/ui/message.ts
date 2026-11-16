export type MessageType = 'info' | 'success' | 'warning' | 'error' | 'loading'
export type MessageItem = { id: string; type: MessageType; content: string }
type Options = { key?: string; duration?: number }
export type MessageHandle = { close: () => void; success: (content: string) => void; error: (content: string) => void; warning: (content: string) => void }
let items: MessageItem[] = []
let sequence = 0
const listeners = new Set<() => void>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()
function publish() { listeners.forEach(listener => listener()) }
function close(id: string) { clearTimeout(timers.get(id)); timers.delete(id); items = items.filter(item => item.id !== id); publish() }
function show(type: MessageType, content: string, options: Options = {}): MessageHandle {
  const id = options.key ?? `message-${++sequence}`
  clearTimeout(timers.get(id)); timers.delete(id)
  const item = { id, type, content }
  items = items.some(value => value.id === id) ? items.map(value => value.id === id ? item : value) : [...items, item]
  // Keep the stack compact without dropping active loading operations.
  while (items.filter(value => value.type !== 'loading').length > 4) close(items.find(value => value.type !== 'loading')!.id)
  const duration = options.duration ?? (type === 'loading' ? 0 : type === 'error' || type === 'warning' ? 6000 : 3500)
  if (duration > 0) timers.set(id, setTimeout(() => close(id), duration))
  publish()
  return { close: () => close(id), success: text => { show('success', text, { key: id }) }, error: text => { show('error', text, { key: id }) }, warning: text => { show('warning', text, { key: id }) } }
}
export const message = {
  info: (content: string, options?: Options) => show('info', content, options),
  success: (content: string, options?: Options) => show('success', content, options),
  warning: (content: string, options?: Options) => show('warning', content, options),
  error: (content: string, options?: Options) => show('error', content, options),
  loading: (content: string, options?: Options) => show('loading', content, options),
  destroy: () => { timers.forEach(clearTimeout); timers.clear(); items = []; publish() },
}
export const messageStore = {
  subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
  getSnapshot: () => items,
  close,
}
