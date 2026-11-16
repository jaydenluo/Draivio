import type { EditorState } from '../../state/editor'
export type RecipeValue = null | string | number | boolean | RecipeValue[] | { [key: string]: RecipeValue }
export type RecipeParameter = { type: 'number' | 'string' | 'boolean'; default: string | number | boolean; min?: number; max?: number }
export type Recipe = { schemaVersion: 1; id: string; version: number; name: string; conditions?: { minWidth?: number; minHeight?: number }; inputs: { id: string; required: boolean }[]; parameters: Record<string, RecipeParameter>; steps: { id: string; tool: string; args: Record<string, RecipeValue>; dependsOn?: string[] }[] }
export type RecipeProvenance = { model: string; provider: string; seed?: number; randomness: string }
export type RecipeTool = { deterministic: boolean; validate?: (state: EditorState, args: Record<string, RecipeValue>) => void; execute: (state: EditorState, args: Record<string, RecipeValue>, signal?: AbortSignal) => { state: EditorState; provenance?: RecipeProvenance } | Promise<{ state: EditorState; provenance?: RecipeProvenance }> }
export type RecipeTools = Record<string, RecipeTool>
const own = (value: object, key: string) => Object.hasOwn(value, key)
const identifier = (v: unknown): v is string => typeof v === 'string' && /^[\w.-]{1,100}$/.test(v) && !['__proto__', 'prototype', 'constructor'].includes(v)
export function assertRecipeJson(value: unknown, depth = 0): void {
  if (depth > 12) throw new Error('配方嵌套过深')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) { value.forEach(v => assertRecipeJson(v, depth + 1)); return }
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) { if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('配方包含保留字段'); assertRecipeJson(item, depth + 1) } return
  }
  throw new Error('配方必须是有限 JSON 数据，不能包含脚本')
}
export function parseRecipe(value: unknown): Recipe {
  assertRecipeJson(value)
  if (JSON.stringify(value).length > 128_000) throw new Error('配方过大')
  const r = structuredClone(value) as Recipe
  if (!r || (r.schemaVersion !== 1 && (r as { schemaVersion: number }).schemaVersion !== 0)) throw new Error('不支持的配方格式版本')
  r.schemaVersion = 1 // Version zero used the same data fields; explicit migration is lossless.
  if (!identifier(r.id) || !Number.isSafeInteger(r.version) || r.version < 1 || typeof r.name !== 'string' || !r.name.trim()) throw new Error('配方 ID、名称或版本无效')
  if (!Array.isArray(r.inputs) || !Array.isArray(r.steps) || !r.steps.length || r.steps.length > 64 || !r.parameters || typeof r.parameters !== 'object' || Array.isArray(r.parameters)) throw new Error('配方输入、参数或步骤无效')
  if (r.conditions) { for (const [key,value] of Object.entries(r.conditions)) if (!['minWidth','minHeight'].includes(key) || typeof value !== 'number' || !Number.isFinite(value) || value < 1) throw new Error('配方适用条件无效') }
  const inputs = new Set<string>()
  for (const input of r.inputs) { if (!identifier(input.id) || typeof input.required !== 'boolean' || inputs.has(input.id)) throw new Error('配方输入无效或重复'); inputs.add(input.id) }
  for (const [id, p] of Object.entries(r.parameters)) {
    if (!identifier(id) || !['number', 'string', 'boolean'].includes(p.type) || typeof p.default !== p.type) throw new Error('配方参数 schema 无效')
    if (p.min !== undefined && !Number.isFinite(p.min) || p.max !== undefined && !Number.isFinite(p.max) || p.min !== undefined && p.max !== undefined && p.min > p.max) throw new Error('配方参数范围无效')
  }
  const ids = new Set<string>()
  for (const s of r.steps) { if (!identifier(s.id) || !identifier(s.tool) || ids.has(s.id) || !s.args || typeof s.args !== 'object' || Array.isArray(s.args) || s.dependsOn !== undefined && (!Array.isArray(s.dependsOn) || !s.dependsOn.every(identifier))) throw new Error('配方步骤无效或重复'); ids.add(s.id) }
  return r
}
export function resolveRecipeArgs(value: RecipeValue, parameters: Record<string, RecipeValue>, bindings: Record<string, string>): RecipeValue {
  if (Array.isArray(value)) return value.map(v => resolveRecipeArgs(v, parameters, bindings))
  if (value && typeof value === 'object') {
    if (own(value, '$parameter')) { if (Object.keys(value).length !== 1 || typeof value.$parameter !== 'string' || !own(parameters, value.$parameter)) throw new Error('缺少配方参数'); return parameters[value.$parameter] }
    if (own(value, '$input')) { if (Object.keys(value).length !== 1 || typeof value.$input !== 'string' || !own(bindings, value.$input)) throw new Error('缺少配方输入'); return bindings[value.$input] }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveRecipeArgs(v, parameters, bindings)]))
  }
  return value
}
export function validateRecipe(value: unknown, parameters: Record<string, RecipeValue>, bindings: Record<string, string>, tools: RecipeTools, state: EditorState, options: { resourceChecks?: boolean } = {}) {
  const recipe = parseRecipe(value); assertRecipeJson(parameters); assertRecipeJson(bindings)
  if (recipe.conditions?.minWidth && state.documentWidth < recipe.conditions.minWidth || recipe.conditions?.minHeight && state.documentHeight < recipe.conditions.minHeight) throw new Error('文档不满足配方适用尺寸条件')
  const resolved: Record<string, RecipeValue> = {}
  for (const key of Object.keys(parameters)) if (!own(recipe.parameters, key)) throw new Error(`未知配方参数：${key}`)
  for (const [id, schema] of Object.entries(recipe.parameters)) {
    const value = own(parameters, id) ? parameters[id] : schema.default
    if (typeof value !== schema.type || typeof value === 'number' && (!Number.isFinite(value) || schema.min !== undefined && value < schema.min || schema.max !== undefined && value > schema.max)) throw new Error(`配方参数超出范围：${id}`)
    resolved[id] = value
  }
  for (const slot of recipe.inputs) { const id = bindings[slot.id]; if (slot.required && !id) throw new Error(`缺少输入：${slot.id}`); if (id && !state.layers.some(l => l.id === id)) throw new Error(`输入图层不存在：${slot.id}`) }
  for (const key of Object.keys(bindings)) if (!recipe.inputs.some(s => s.id === key)) throw new Error(`未知输入：${key}`)
  const byId = new Map(recipe.steps.map(s => [s.id, s])), visited = new Set<string>(), visiting = new Set<string>(), ordered: Recipe['steps'] = []
  const visit = (id: string) => { if (visiting.has(id)) throw new Error('配方步骤依赖存在循环'); if (visited.has(id)) return; const step = byId.get(id); if (!step) throw new Error(`缺少依赖步骤：${id}`); visiting.add(id); for (const dep of step.dependsOn ?? []) visit(dep); visiting.delete(id); visited.add(id); ordered.push(step) }
  for (const step of recipe.steps) { if (!own(tools, step.tool)) throw new Error(`缺少配方工具：${step.tool}`); const args = resolveRecipeArgs(step.args, resolved, bindings) as Record<string,RecipeValue>; if(options.resourceChecks!==false) validateRecipeTargets(args,state); tools[step.tool].validate?.(state,args); visit(step.id) }
  return { recipe, parameters: resolved, ordered: ordered.map(step => ({ ...step, args: structuredClone(resolveRecipeArgs(step.args,resolved,bindings)) as Record<string,RecipeValue> })) }
}

/** Literal IDs receive the same boundary check as input slots, including arrays. */
function validateRecipeTargets(args:Record<string,RecipeValue>,state:EditorState){
  for(const key of ['layerId','layerIds'])if(Object.hasOwn(args,key)){const ids=key==='layerIds'?args[key]:[args[key]];if(!Array.isArray(ids)||!ids.length||!ids.every(id=>typeof id==='string'&&state.layers.some(layer=>layer.id===id)))throw new Error('配方目标图层不存在')}
}
