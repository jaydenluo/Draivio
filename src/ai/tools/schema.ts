/** Deliberately small JSON-schema subset: every object is closed and every field required. */
export type ToolSchema =
  | { type: 'number' | 'integer'; minimum: number; maximum: number }
  | { type: 'string'; maxLength: number; minLength?: number; pattern?: string; enum?: readonly string[] }
  | { type: 'boolean' }
  | { type: 'object'; properties: Record<string, ToolSchema>; required: readonly string[]; additionalProperties: false; oneOf?: readonly ToolSchema[] }

export class ToolValidationError extends Error {}
export function validateSchema(schema: ToolSchema, value: unknown, path = '参数'): void {
  const fail = () => { throw new ToolValidationError(`${path}无效或超出允许范围`) }
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum || schema.type === 'integer' && !Number.isInteger(value)) fail()
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || value.length > schema.maxLength || value.length < (schema.minLength ?? 0) || schema.pattern !== undefined && !new RegExp(schema.pattern).test(value) || schema.enum && !schema.enum.includes(value)) fail()
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') fail()
  } else if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return fail()
    const descriptors = Object.getOwnPropertyDescriptors(value)
    const keys = Reflect.ownKeys(value)
    if (keys.length !== Object.keys(schema.properties).length || keys.some(key => typeof key !== 'string' || !Object.hasOwn(schema.properties, key))) return fail()
    for (const [key, child] of Object.entries(schema.properties)) {
      const descriptor = descriptors[key]
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) return fail()
      validateSchema(child, descriptor.value, `${path}.${key}`)
    }
    if (schema.oneOf && schema.oneOf.filter(variant => { try { validateSchema(variant, value, path); return true } catch { return false } }).length !== 1) fail()
  }
}
