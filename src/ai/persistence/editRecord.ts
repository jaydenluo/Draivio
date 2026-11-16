/** Saved metadata is data only. Opening a project never resumes a request. */
export type AIRecovery = { status: 'interrupted'; model: string; sourceId: string }
export const EDIT_TOOL_VERSION = 1
const secretKey = /^(?:api[-_]?key|access[-_]?token|refresh[-_]?token|id[-_]?token|auth(?:orization)?|proxy[-_]?authorization|headers|requestHeaders|cookie|set[-_]?cookie|password|secret|client[-_]?secret|credentials|bearer[-_]?token)$/i
const credential = /(?:\bsk-[A-Za-z0-9_-]{12,}|\bBearer\s+[A-Za-z0-9_.-]{12,})/i

/** Remove configuration credentials at every depth, including legacy provenance.
 * Resource URLs are consumed by the materializer, never copied into the file. */
export function redactProjectCredentials<T>(value: T): T {
  const walk = (item: unknown, key = ''): unknown => {
    if (typeof item === 'string') {
      if (!item.startsWith('data:image/') && credential.test(item)) throw new Error('项目包含疑似凭据，请移除后保存')
      if (!['source','thumbnail','previewSource','dataUrl'].includes(key) && /https?:\/\/[^\s]+[?&](?:api[-_]?key|access[-_]?token|refresh[-_]?token|token|authorization|signature)=/i.test(item)) throw new Error('项目 URL 包含疑似凭据，请移除后保存')
      return item
    }
    if (Array.isArray(item)) return item.map(child => walk(child,key))
    if (!item || typeof item !== 'object') return item
    return Object.fromEntries(Object.entries(item).filter(([key]) => !secretKey.test(key) && !['__proto__','constructor','prototype'].includes(key)).map(([key,child]) => [key,walk(child,key)]))
  }
  return walk(value) as T
}
export function validateAIRecovery(value: unknown): asserts value is AIRecovery {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('AI 恢复记录无效')
  const record = value as AIRecovery
  if (Object.keys(record).some(key => !['status','model','sourceId'].includes(key)) || record.status !== 'interrupted' || typeof record.model !== 'string' || record.model.length > 256 || typeof record.sourceId !== 'string' || record.sourceId.length > 256) throw new Error('AI 恢复记录无效')
}
