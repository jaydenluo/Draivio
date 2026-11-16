import { ImageRequestError, type ImageResults } from './openaiImages'
export type BatchStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'unknown' | 'missing' | 'cancelled'
export type BatchItem = { status: BatchStatus; message?: string }
export type BatchSnapshot = { items: BatchItem[]; running: boolean }

/** Credentials live in the request closure, never in the public snapshot. */
export class ImageBatch {
  private snapshot: BatchSnapshot
  private listeners = new Set<() => void>()
  private cancelled = false
  private limit: number
  private cooldown = 0
  private wake?: () => void
  constructor(count: number, private strategy: 'single' | 'split', concurrency: number,
    private request: (count: number) => Promise<ImageResults>, private onImage: (image: string, index: number) => void) {
    this.snapshot = { items: Array.from({ length: Math.max(1, Math.min(8, count)) }, () => ({ status: 'queued' })), running: false }
    this.limit = Math.max(1, Math.min(4, concurrency))
  }
  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish() { this.snapshot = { ...this.snapshot, items: this.snapshot.items.map(item => ({ ...item })) }; this.listeners.forEach(listener => listener()) }
  cancel() {
    this.cancelled = true
    this.snapshot.items.forEach(item => { if (item.status === 'queued') item.status = 'cancelled' })
    this.publish()
    this.wake?.()
  }
  retry(includeUnknown = false) {
    return this.run(this.snapshot.items.flatMap((item, index) =>
      ['failed', 'missing', 'cancelled', ...(includeUnknown ? ['unknown'] : [])].includes(item.status) ? [index] : []))
  }
  async run(indices = this.snapshot.items.flatMap((item, index) => item.status === 'queued' ? [index] : [])): Promise<void> {
    if (this.snapshot.running || !indices.length) return
    this.cancelled = false
    indices.forEach(index => { this.snapshot.items[index] = { status: 'queued' } })
    this.snapshot.running = true
    this.publish()
    const jobs = this.strategy === 'single' ? [indices] : indices.map(index => [index])
    let active = 0
    await new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const pump = () => {
        if (timer) { clearTimeout(timer); timer = undefined }
        if (this.cancelled) jobs.length = 0
        if (!jobs.length && !active) { resolve(); return }
        if (jobs.length && Date.now() < this.cooldown) {
          timer = setTimeout(pump, this.cooldown - Date.now()); return
        }
        while (jobs.length && active < this.limit) {
          const slots = jobs.shift()!
          active++
          slots.forEach(index => { this.snapshot.items[index] = { status: 'running' } })
          this.publish()
          const execute = async () => this.request(slots.length)
          void execute().then(images => {
            slots.forEach((index, offset) => {
              if (images[offset]) {
                this.onImage(images[offset], index)
                this.snapshot.items[index] = { status: 'succeeded' }
              } else this.snapshot.items[index] = images[offset] === null ? { status: 'unknown', message: '返回图片格式无效，结果未知，请先检查供应商记录' } : { status: 'missing', message: '接口未返回此图片，未自动补发' }
            })
          }).catch(reason => {
            const error = reason instanceof ImageRequestError ? reason : new ImageRequestError('请求结果未知，请检查供应商记录', true)
            if (error.status === 429) { this.limit = 1; this.cooldown = Date.now() + Math.min(60000, Math.max(1000, error.retryAfter)) }
            slots.forEach(index => { this.snapshot.items[index] = { status: error.uncertain ? 'unknown' : 'failed', message: error.message } })
          }).finally(() => { active--; this.publish(); pump() })
        }
      }
      this.wake = pump
      pump()
    })
    this.wake = undefined
    this.snapshot.running = false
    this.publish()
  }
}
