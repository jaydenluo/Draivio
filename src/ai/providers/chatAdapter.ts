import { requestProviderJson, RequestError } from '../../lib/request'
import { cloudAccount } from '../../account/cloudAccount'
import { officialModel } from '../../account/cloudModels'

export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>; tool_call_id?: string }
export type ToolDefinition = { type: 'function'; function: { name: string; description?: string; parameters: Record<string, unknown> } }
export type ChatRequest = { sourceId?: string; baseUrl: string; apiKey: string; protocol?: string; model: string; messages: ChatMessage[]; tools?: ToolDefinition[]; temperature?: number; maxTokens?: number; signal?: AbortSignal; timeoutMs?: number }
export type ToolCall = { id: string; name: string; arguments: unknown }
export type ChatResult = { text: string; toolCalls: ToolCall[]; raw: unknown; usage?: unknown }

const secretKey = /(?:api[_-]?key|authorization|token|password|secret|credential)/i
function containsSecret(value: unknown): boolean {
  if (typeof value === 'string') return /(?:sk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~-]{8,}|AIza[\w-]{20,})/i.test(value)
  if (!value || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(containsSecret)
  return Object.entries(value).some(([key, child]) => secretKey.test(key) || containsSecret(child))
}
function redact(value: unknown, secrets: string[] = []): unknown {
  if (typeof value === 'string') {
    let out = value
    for (const secret of secrets.filter(Boolean)) out = out.split(secret).join('[REDACTED]')
    return out.replace(/(?:sk-[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~-]{8,}|AIza[\w-]{20,})/gi, '[REDACTED]')
  }
  if (Array.isArray(value)) return value.map(item => redact(item, secrets))
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [secretKey.test(key) ? key : key, secretKey.test(key) ? '[REDACTED]' : redact(child, secrets)]))
}
function parseArguments(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw
  try { return JSON.parse(raw) } catch { throw new Error('工具参数不是有效 JSON') }
}
export function parseChatResponse(body: unknown): ChatResult {
  const choice = (body as { choices?: Array<{ message?: { content?: unknown; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }> } }> })?.choices?.[0]
  if (!choice?.message) throw new RequestError('invalid-response', '推理接口缺少 choices.message')
  const message = choice.message
  const toolCalls = (message.tool_calls ?? []).map((call, index) => {
    const name = call.function?.name?.trim(); if (!name) throw new Error('工具调用缺少名称')
    const args = parseArguments(call.function?.arguments ?? '{}'); if (containsSecret(args)) throw new Error('工具参数包含凭据，已拒绝写入计划')
    return { id: call.id ?? `tool-${index + 1}`, name, arguments: args }
  })
  const text = typeof message.content === 'string' ? String(redact(message.content)) : ''
  return { text, toolCalls, raw: redact(body), usage: redact((body as { usage?: unknown }).usage) }
}
export function parseJsonPlan(text: string): { steps: Array<Record<string, unknown>>; explanation?: string } {
  if (text.length > 256_000) throw new Error('计划响应过大')
  let value: unknown; try { value = JSON.parse(text) } catch { throw new Error('模型未返回有效 JSON 计划') }
  if (!value || typeof value !== 'object' || !Array.isArray((value as { steps?: unknown }).steps)) throw new Error('计划必须包含 steps 数组')
  const steps = (value as { steps: unknown[] }).steps
  const allowed = new Set(['move','scale','rotate','flip','opacity','visibility','blend','rename','duplicate','delete','lock','reorder','group','align','distribute'])
  const reserved = /^(?:__proto__|prototype|constructor)$/
  const inspect = (item: unknown, depth = 0): void => {
    if (depth > 8) throw new Error('计划嵌套过深')
    if (containsSecret(item)) throw new Error('计划步骤无效或包含凭据')
    if (typeof item === 'string' && item.length > 8192) throw new Error('计划参数过大')
    if (Array.isArray(item)) { if (item.length > 512) throw new Error('计划数组过大'); item.forEach(v => inspect(v, depth + 1)); return }
    if (item && typeof item === 'object') Object.entries(item).forEach(([key, v]) => { if (reserved.test(key)) throw new Error('计划包含保留字段'); inspect(v, depth + 1) })
  }
  inspect(value)
  if (!steps.length || steps.length > 32 || steps.some(step => {
    if (!step || typeof step !== 'object') return true
    const op = (step as { op?: unknown }).op
    return typeof op !== 'string' || !allowed.has(op)
  })) throw new Error('计划步骤无效或包含不支持的工具')
  return { steps: steps as Array<Record<string, unknown>>, explanation: typeof (value as { explanation?: unknown }).explanation === 'string' ? (value as { explanation: string }).explanation : undefined }
}
export async function requestChatCompletion(options: ChatRequest): Promise<ChatResult> {
  if (!options.model.trim() || !options.messages.length) throw new Error('模型和消息不能为空')
  const body: Record<string, unknown> = { model: options.model, messages: options.messages }
  if (options.tools?.length) body.tools = options.tools
  if (options.temperature !== undefined) body.temperature = options.temperature
  if (options.maxTokens !== undefined) body.max_tokens = options.maxTokens
  const official = options.sourceId === 'draivio-cloud'
  const catalog = officialModel(options.model, 'text')
  if (official && (!catalog || !catalog.capabilities.some(cap => cap === 'text' || cap === 'chat'))) throw new Error('官方模型未声明文本推理能力')
  if (official && options.messages.some(message => Array.isArray(message.content) && message.content.some(part => part.type === 'image_url')) && catalog?.constraints.supportsImageInput !== true) throw new Error('官方模型未声明视觉输入能力')
  const response = official
    ? await cloudAccount.request('/api/model-gateway/v1/chat/completions', { method: 'POST', body, signal: options.signal, timeoutMs: options.timeoutMs ?? 120000, headers: { 'Idempotency-Key': crypto.randomUUID() } })
    : await requestProviderJson({ baseUrl: options.baseUrl, apiKey: options.apiKey, protocol: options.protocol ?? 'openai_compatible', path: 'chat/completions', method: 'POST', body, timeoutMs: options.timeoutMs ?? 120000, signal: options.signal })
  const errorBody=response.body as {code?:unknown;error?:{code?:unknown}}|null
  const errorCode=typeof errorBody?.code==='string'?errorBody.code:typeof errorBody?.error?.code==='string'?errorBody.error.code:''
  if ([402,403].includes(response.status) && ['INSUFFICIENT_CREDITS','insufficient_quota','quota_exceeded'].includes(errorCode)) throw new RequestError('network', '供应商额度不足，请充值或切换服务来源')
  if (response.status === 401 || response.status === 403) throw new RequestError('network', '密钥无效或无访问权限')
  if (response.status === 429) throw new RequestError('network', '请求过于频繁或额度不足，请检查供应商额度后重试')
  if (response.status < 200 || response.status >= 300) throw new RequestError('network', `推理请求失败（HTTP ${response.status}）`)
  const parsed = parseChatResponse(response.body)
  return { ...parsed, text: String(redact(parsed.text, [options.apiKey])), raw: redact(parsed.raw, [options.apiKey]), usage: redact(parsed.usage, [options.apiKey]) }
}
