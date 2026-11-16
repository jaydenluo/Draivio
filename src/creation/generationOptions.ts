export type GenerationOptions = {
  multiImage: 'single' | 'split'
  concurrency: number
  sendSize: boolean
  quality: 'omit' | 'auto' | 'low' | 'medium' | 'high'
}
export type GenerationConfiguration = { generation?: Partial<GenerationOptions>; modelGeneration?: Record<string, Partial<GenerationOptions>> }
export const defaultGenerationOptions: GenerationOptions = { multiImage: 'single', concurrency: 2, sendSize: true, quality: 'omit' }
export function resolveGenerationOptions(config: GenerationConfiguration, model: string): GenerationOptions {
  return { ...defaultGenerationOptions, ...config.generation, ...config.modelGeneration?.[model] }
}
export function validGenerationOptions(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const v = value as Record<string, unknown>
  return Object.keys(v).every(key => ['multiImage', 'concurrency', 'sendSize', 'quality'].includes(key)) &&
    (v.multiImage === undefined || ['single', 'split'].includes(v.multiImage as string)) &&
    (v.concurrency === undefined || (Number.isInteger(v.concurrency) && Number(v.concurrency) >= 1 && Number(v.concurrency) <= 4)) &&
    (v.sendSize === undefined || typeof v.sendSize === 'boolean') &&
    (v.quality === undefined || ['omit', 'auto', 'low', 'medium', 'high'].includes(v.quality as string))
}
export function validGenerationConfiguration(config: GenerationConfiguration): boolean {
  if (config.generation !== undefined && !validGenerationOptions(config.generation)) return false
  const models = config.modelGeneration
  return models === undefined || (!!models && typeof models === 'object' && !Array.isArray(models) && Object.values(models).every(validGenerationOptions))
}
