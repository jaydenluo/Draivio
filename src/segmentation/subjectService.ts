export type SubjectRequest = { image: string; width: number; height: number; model?: string; signal?: AbortSignal }
export type SubjectResponse = { width: number; height: number; mask: Uint8Array; model?: string; source?: string }
export type SubjectErrorCode = 'cancelled' | 'timeout' | 'unauthorized' | 'size-limit' | 'invalid-response' | 'network'
export class SubjectServiceError extends Error { constructor(public readonly code: SubjectErrorCode, message: string) { super(message); this.name = 'SubjectServiceError' } }
export type SubjectAdapter = (request: SubjectRequest) => Promise<SubjectResponse>

export function validateSubjectResponse(value: unknown): SubjectResponse {
  const data = value as Partial<SubjectResponse> | null
  if (!data || !Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width! <= 0 || data.height! <= 0 || !(data.mask instanceof Uint8Array) || data.mask.length !== data.width! * data.height!) throw new SubjectServiceError('invalid-response', '主体服务返回的蒙版尺寸或像素数据无效')
  return { width: data.width!, height: data.height!, mask: data.mask, model: data.model, source: data.source }
}

/** Maps a service mask to document pixels using pixel-center sampling, avoiding edge drift. */
export function mapMaskToDocument(response: SubjectResponse, width: number, height: number): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new SubjectServiceError('size-limit', '文档尺寸必须为正整数')
  const output = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sx = Math.min(response.width - 1, Math.floor((x + .5) * response.width / width))
    const sy = Math.min(response.height - 1, Math.floor((y + .5) * response.height / height))
    output[y * width + x] = response.mask[sy * response.width + sx]
  }
  return output
}

export function maskToSelection(mask: Uint8Array, width: number, height: number, threshold = 1) {
  if (mask.length !== width * height) throw new SubjectServiceError('invalid-response', '蒙版与文档尺寸不一致')
  let left = width, top = height, right = -1, bottom = -1
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (mask[y * width + x] >= threshold) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y) }
  return right < 0 ? null : { x: left / width * 100, y: top / height * 100, width: (right - left + 1) / width * 100, height: (bottom - top + 1) / height * 100 }
}

export function createSubjectAdapter(fetchImpl: typeof fetch, endpoint: string, headers: Record<string, string> = {}): SubjectAdapter {
  return async ({ image, width, height, model, signal }) => {
    if (!endpoint) throw new SubjectServiceError('network', '未配置主体识别服务地址')
    try {
      const response = await fetchImpl(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ image, width, height, model }), signal })
      if (response.status === 401 || response.status === 403) throw new SubjectServiceError('unauthorized', '主体识别服务鉴权失败，请检查服务来源配置')
      if (response.status === 413) throw new SubjectServiceError('size-limit', '图片超过主体识别服务的尺寸限制')
      if (!response.ok) throw new SubjectServiceError('network', `主体识别服务请求失败（${response.status}）`)
      const payload = await response.json() as { width?: number; height?: number; mask?: number[]; alpha?: number[]; model?: string }
      const bytes = new Uint8Array(payload.mask ?? payload.alpha ?? [])
      return validateSubjectResponse({ ...payload, width: payload.width ?? width, height: payload.height ?? height, mask: bytes })
    } catch (error) {
      if (error instanceof SubjectServiceError) throw error
      if (error instanceof DOMException && error.name === 'AbortError') throw new SubjectServiceError('cancelled', '主体识别已取消')
      throw new SubjectServiceError('network', '无法连接主体识别服务，请检查网络或服务地址')
    }
  }
}
