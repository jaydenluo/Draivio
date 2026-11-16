/** Image API presets describe configuration, not a completed generation adapter. */
export const imageProtocols = [
  { id: 'openai_compatible', label: 'OpenAI Images（兼容）', baseUrl: 'https://api.openai.com/v1', auth: 'Bearer', format: 'JSON', path: '/images/generations', async: false, listTest: true, docs: 'https://developers.openai.com/api/docs/guides/image-generation' },
  { id: 'gemini', label: 'Gemini 图片生成', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', auth: 'x-goog-api-key', format: 'JSON', path: '/models/{model}:generateContent', async: false, listTest: true, docs: 'https://ai.google.dev/api/generate-content' },
  { id: 'volcengine', label: '火山方舟 Images', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', auth: 'Bearer', format: 'JSON', path: '/images/generations', async: false, listTest: true, docs: 'https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh' },
  { id: 'dashscope', label: '通义万相 / Qwen Image', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', auth: 'Bearer', format: 'JSON', path: '/services/aigc/multimodal-generation/generation', async: false, listTest: false, docs: 'https://www.alibabacloud.com/help/en/model-studio/qwen-image-api' },
  { id: 'bfl', label: 'BFL / FLUX', baseUrl: 'https://api.bfl.ai/v1', auth: 'x-key', format: 'JSON', path: '/{model}', async: true, listTest: false, docs: 'https://docs.bfl.ai/quick_start/generating_images' },
  { id: 'stability', label: 'Stability AI', baseUrl: 'https://api.stability.ai/v2beta', auth: 'Bearer', format: 'multipart/form-data', path: '/stable-image/generate/{model}', async: false, listTest: false, docs: 'https://platform.stability.ai/docs/api-reference' },
  { id: 'native', label: '自定义原生 API', baseUrl: '', auth: '按供应商文档', format: '自定义', path: '按供应商文档', async: false, listTest: false, docs: '' },
] as const
export type ImageProtocol = typeof imageProtocols[number]['id']
export const getImageProtocol = (id: ImageProtocol) => imageProtocols.find(item => item.id === id)!
export const isImageProtocol = (id: unknown): id is ImageProtocol => imageProtocols.some(item => item.id === id)
export const unsupportedTestMessage = '该协议不提供免费模型列表测试；可保存配置，生图权限以实际请求为准'
export function switchProtocol<T extends { protocol: ImageProtocol; baseUrl: string }>(value: T, protocol: ImageProtocol): T {
  const oldDefault = getImageProtocol(value.protocol).baseUrl
  const replace = !value.baseUrl.trim() || value.baseUrl.trim().replace(/\/+$/, '') === oldDefault
  return { ...value, protocol, baseUrl: replace ? getImageProtocol(protocol).baseUrl : value.baseUrl }
}
export const providerProtocols: Record<string, ImageProtocol> = {
  OpenAI: 'openai_compatible', Google: 'gemini', '火山引擎': 'volcengine', '阿里云': 'dashscope', 'Black Forest Labs': 'bfl', 'Stability AI': 'stability', '自定义': 'native',
}
