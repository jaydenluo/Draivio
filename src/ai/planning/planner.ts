import { parseColorInstruction } from './colorInstructions'
import { BLEND_MODES } from '../../render/blendModes'
import { PLANNER_TOOL_NAMES, type PlannerToolName, plannerPrompt } from './prompts'

export type PlannerLayer = { id: string; name: string; locked?: boolean }
export type PlannerCapability = { name: string; enabled?: boolean; description?: string }
export type PlanStep = { id: string; tool: PlannerToolName; args: Record<string, unknown>; dependsOn: string[]; impact?: 'safe' | 'destructive' | 'overwriting' }
export type PlannerPlan = { steps: PlanStep[]; explanation: string; clarifications: string[]; warnings: string[]; systemPrompt: string }
export type PlannerOptions = { layers?: PlannerLayer[]; selectedLayerId?: string; capabilities?: readonly (string | PlannerCapability)[] }

const dangerous = new Set<PlannerToolName>(['delete','duplicate','rename','group','reorder','opacity','visibility','blend','lock'])
const injection = /(忽略|无视|绕过).{0,12}(之前|系统|规则|提示)|执行.{0,8}(代码|命令|shell|脚本)|把.{0,8}(api[_ -]?key|token|password|密码|密钥).{0,8}(写入|输出|记录)/i
const capName = (c: string | PlannerCapability) => typeof c === 'string' ? c : c.name
function target(text: string, options: PlannerOptions, needsTarget = true): { id?: string; clarification?: string } {
  const layers = options.layers ?? []
  if (/(?:当前|选中)(?:图层|对象)/.test(text.replace(/[“「『][^”」』]*[”」』]/g, ''))) return options.selectedLayerId ? { id: options.selectedLayerId } : { clarification: '请先选择目标图层。' }
  const named = text.match(/(?:图层|对象)(?:[“「『]([^”」』，。]+)[”」』]|\s+([^，。\s]+)|(?!当前|选中)([\u4e00-\u9fff]{2,}))/)
  if (named) {
    const name = named[1] ?? named[2] ?? named[3]
    const matches = layers.filter(l => l.name === name || l.id === name)
    if (matches.length > 1) return { clarification: `“${name}”有多个匹配图层：${matches.map(m => `${m.id}（${m.name}）`).join('、')}；请选择一个 ID。` }
    if (matches.length === 1) return { id: matches[0].id }
    return { clarification: `找不到图层“${name}”，请确认对象。` }
  }
  if (options.selectedLayerId) return { id: options.selectedLayerId }
  if (needsTarget) return { clarification: '请指定目标图层或先选择一个图层。' }
  return {}
}
/** Resolve every explicitly quoted member before any collection operation.
 * Never fall back to all layers when one named member is absent or ambiguous. */
function collectionTargets(text: string, options: PlannerOptions): { ids?: string[]; clarification?: string } {
  const layers = options.layers ?? []
  const names = [...text.matchAll(/[“「『]([^”」』]+)[”」』]/g)].map(match => match[1])
  if (names.length) {
    const ids: string[] = []
    for (const name of names) {
      const matches = layers.filter(layer => layer.name === name || layer.id === name)
      if (!matches.length) return { clarification: `找不到图层“${name}”，请确认对象。` }
      if (matches.length > 1) return { clarification: `“${name}”有多个匹配图层：${matches.map(layer => `${layer.id}（${layer.name}）`).join('、')}；请选择一个 ID。` }
      if (!ids.includes(matches[0].id)) ids.push(matches[0].id)
    }
    return { ids }
  }
  // Quantifiers describe the collection, not a literal layer name.
  if (/(?:所有|全部).{0,12}(?:图层|对象)/.test(text)) return { ids: layers.filter(layer => !/可编辑/.test(text) || !layer.locked).map(layer => layer.id) }
  return { ids: layers.map(layer => layer.id) }
}
function num(text: string, re: RegExp, fallback = 0) { const m = text.match(re); return m ? Number(m[1]) : fallback }
function makeStep(index: number, tool: PlannerToolName, args: Record<string, unknown>): PlanStep { return { id: `step-${index + 1}`, tool, args, dependsOn: index ? [`step-${index}`] : [], impact: dangerous.has(tool) ? (tool === 'delete' ? 'destructive' : 'overwriting') : 'safe' } }
function parseClause(clause: string, options: PlannerOptions): { tool?: PlannerToolName; args?: Record<string, unknown>; clarification?: string; warning?: string } {
  const t = clause.trim(); if (!t) return {}
  // Preserve offsets for value extraction while excluding quoted data from actions.
  const actionText = t.replace(/[“「『][^”」』]*[”」』]/g, value => ' '.repeat(value.length))
  if (/(?:不要|别|禁止|勿|不必|不允许)\s*(?:再|去|执行)?\s*(?:删除|移除|复制|拷贝|重命名|改名|移动|向[上下左右]|[上下左右]移|旋转|翻转|缩放|放大|缩小|隐藏|显示|锁定|解锁|分组|对齐)/.test(actionText)) return { warning: `已遵守否定要求：${t}` }
  // Collection instructions must resolve their scope before the single-target parser.
  if (/分组|左对齐|右对齐|水平居中|顶部对齐|底部对齐|垂直居中|等距|平均分布/.test(actionText)) {
    const scope = collectionTargets(t, options)
    if (scope.clarification) return { clarification: scope.clarification }
    const layerIds = scope.ids ?? []
    if (!layerIds.length) return { clarification: '请指定可编辑目标图层。' }
    if (/分组/.test(actionText)) return { tool: 'group', args: { layerIds } }
    if (/等距|平均分布/.test(actionText)) return { tool: 'distribute', args: { axis: /垂直/.test(actionText) ? 'vertical' : 'horizontal', layerIds } }
    const mode = /左对齐/.test(actionText) ? 'left' : /右对齐/.test(actionText) ? 'right' : /顶部/.test(actionText) ? 'top' : /底部/.test(actionText) ? 'bottom' : /水平/.test(actionText) ? 'center-horizontal' : 'center-vertical'
    return { tool: 'align', args: { mode, target: 'canvas', layerIds } }
  }
  const targetInfo = target(t, options, !/^(全部|所有)?图层(对齐|等距|平均)/.test(actionText) && !/删除|移除/.test(actionText))
  if (targetInfo.clarification && /图层|对象/.test(actionText)) return { clarification: targetInfo.clarification }
  if (targetInfo.clarification && !/^(全部|所有)?图层(对齐|等距|平均)/.test(actionText) && !/删除|移除/.test(actionText)) return { clarification: targetInfo.clarification }
  const layerId = targetInfo.id
  const color=parseColorInstruction(t,layerId)
  if(color)return color.args?{tool:'adjustment',args:color.args}:color
  if (/USM|锐化|保边降噪|降噪/i.test(actionText)) {
    if(/不要|别|禁止|勿|不允许/.test(actionText))return {warning:'已遵守否定要求，不添加细节滤镜'}
    if(/AI|重建|恢复细节/i.test(actionText))return {clarification:'锐化和降噪为确定性滤波，不能提供 AI 细节重建或真实恢复承诺'}
    const kind=/降噪/.test(actionText)?'denoise':'sharpen'
    const field=(label:string)=>{const m=actionText.match(new RegExp(label+'\\s*(-?\\d+(?:\\.\\d+)?)'));return m?Number(m[1]):NaN}
    const radius=field('半径'),amount=field('强度'),threshold=field('阈值')
    if(![radius,amount,threshold].every(Number.isFinite)||radius<0||radius>(kind==='denoise'?8:64)||amount<0||amount>(kind==='denoise'?1:5)||threshold<0||threshold>(kind==='denoise'?100:255))return {clarification:'请明确有效半径、强度、阈值；降噪上限为 8 / 1 / 100，USM 上限为 64 / 5 / 255'}
    return layerId?{tool:'filter',args:{layerId,kind,radius,amount,threshold,...(/选区|局部/.test(actionText)?{scope:'selection'}:{})}}:{clarification:'细节滤镜需要明确目标图层'}
  }
  if (/高斯模糊|运动模糊|径向模糊|像素化|颗粒|晕影/.test(actionText)) {
    if(/不要|禁止|勿|不允许/.test(actionText))return {warning:'已遵守否定要求，不添加滤镜'}
    const kind=/高斯/.test(actionText)?'gaussian':/运动/.test(actionText)?'motion':/径向/.test(actionText)?'radial':/像素/.test(actionText)?'pixelate':/颗粒/.test(actionText)?'grain':'vignette'
    const radius=num(actionText,/(?:半径|距离)\s*([\d.]+)/,0),amount=num(actionText,/强度\s*([\d.]+)/,0),angle=num(actionText,/(?:方向|角度)\s*(-?[\d.]+)/,0),size=num(actionText,/(?:尺寸|块大小)\s*([\d.]+)/,1),seed=num(actionText,/种子\s*(\d+)/,0)
    return layerId?{tool:'filter',args:{layerId,kind,radius,amount,angle,size,seed}}:{clarification:'滤镜需要明确目标图层。'}
  }
  if (/删除|移除/.test(actionText)) return layerId ? {tool:'delete',args:{layerId}} : {clarification:'删除会移除对象（破坏性操作），请指定唯一目标图层。'}
  if (/重命名|改名/.test(actionText)) { const start=actionText.search(/重命名|改名/); const m=t.slice(start).match(/(?:重命名|改名)(?:为|成)?\s*(?:[“「『]([^”」』]+)[”」』]|([^，。]+))/); return layerId&&m?{tool:'rename',args:{layerId,name:(m[1] ?? m[2]).trim()}}:{clarification:'请同时指定唯一目标图层和新名称。'} }
  if (/复制|拷贝/.test(actionText)) return layerId ? {tool:'duplicate',args:{layerId}} : {clarification:'复制需要明确目标图层。'}
  if (/向右|右移|向左|左移|x\s*\+?/i.test(actionText)) { const n=num(actionText,/([\d.]+)\s*(?:像素|px)?/); return layerId?{tool:'move',args:{layerId,dx: /向左|左移/.test(actionText)?-n:n,dy:0}}:{clarification:'移动需要明确目标图层。'} }
  if (/向上|上移|向下|下移/.test(actionText) && !/排序|[上下]移(?:一层|图层)/.test(actionText)) { const n=num(actionText,/([\d.]+)\s*(?:像素|px)?/,10); return layerId?{tool:'move',args:{layerId,dx:0,dy:/向上|上移/.test(actionText)?-n:n}}:{clarification:'移动需要明确目标图层。'} }
  if (/放大|缩放|缩小/.test(actionText)) { const n=num(actionText,/([\d.]+)\s*倍/,/缩小/.test(actionText)?.5:2); return layerId?{tool:'scale',args:{layerId,sx:n,sy:n}}:{clarification:'缩放需要明确目标图层。'} }
  if (/旋转/.test(actionText)) { const n=num(actionText,/(-?[\d.]+)\s*(?:度|°)/); return layerId?{tool:'rotate',args:{layerId,degrees:n}}:{clarification:'旋转需要明确目标图层。'} }
  if (/翻转|镜像/.test(actionText)) { const axis=/垂直|上下/.test(actionText)?'vertical':'horizontal'; return layerId?{tool:'flip',args:{layerId,axis}}:{clarification:'翻转需要明确目标图层。'} }
  if (/混合模式/.test(actionText)) {
    const requested = t.slice(actionText.indexOf('混合模式')).match(/混合模式(?:设置|设|调整|改|更改)?(?:为|成)?\s*[“「『]?([^”」』\s，。；]+)/)?.[1]
    const mode = BLEND_MODES.find(mode => mode.label === requested || mode.id === requested)
    if (!mode) return { clarification: '请指定已支持的混合模式，例如正片叠底、滤色或柔光。' }
    return layerId ? { tool: 'blend', args: { layerId, blendMode: mode.label } } : { clarification: '混合模式需要明确目标图层。' }
  }
  if (/透明度|不透明度/.test(actionText)) { const n=num(actionText,/([\d.]+)\s*%/); return layerId?{tool:'opacity',args:{layerId,value:n}}:{clarification:'透明度需要明确目标图层。'} }
  if (/隐藏|不可见/.test(actionText)) return layerId?{tool:'visibility',args:{layerId,visible:false}}:{clarification:'隐藏需要明确目标图层。'}
  if (/显示|可见/.test(actionText)) return layerId?{tool:'visibility',args:{layerId,visible:true}}:{clarification:'显示需要明确目标图层。'}
  if (/锁定/.test(actionText)) return layerId?{tool:'lock',args:{layerId,locked:true}}:{clarification:'锁定需要明确目标图层。'}
  if (/解锁/.test(actionText)) return layerId?{tool:'lock',args:{layerId,locked:false}}:{clarification:'解锁需要明确目标图层。'}
  if (/上移一层|上移图层/.test(actionText)) return layerId?{tool:'reorder',args:{layerId,direction:'up'}}:{clarification:'排序需要明确目标图层。'}
  if (/下移一层|下移图层/.test(actionText)) return layerId?{tool:'reorder',args:{layerId,direction:'down'}}:{clarification:'排序需要明确目标图层。'}
  return { warning: `暂不支持“${t}”，请改用已声明的编辑工具或提供替代方案。` }
}
export function planNaturalLanguage(input: string, options: PlannerOptions = {}): PlannerPlan {
  if (!input.trim()) return {steps:[],explanation:'',clarifications:['请输入要执行的编辑目标。'],warnings:[],systemPrompt:plannerPrompt()}
  if (injection.test(input)) return {steps:[],explanation:'',clarifications:[],warnings:['检测到试图修改系统规则或执行代码的内容，已拒绝。'],systemPrompt:plannerPrompt()}
  const available = (options.capabilities ?? PLANNER_TOOL_NAMES).filter(c => typeof c === 'string' || c.enabled !== false).map(capName)
  const separators = input.replace(/[“「『][^”」』]*[”」』]/g, value => ' '.repeat(value.length))
  const clauses: string[] = []
  let clauseStart = 0
  for (const match of separators.matchAll(/(?:然后|接着|并且|同时|之后|，|,|。|；|;)/g)) {
    clauses.push(input.slice(clauseStart, match.index).trim())
    clauseStart = match.index + match[0].length
  }
  clauses.push(input.slice(clauseStart).trim())
  const steps: PlanStep[] = []; const clarifications: string[] = []; const warnings: string[] = []
  let copiedTarget = false
  for (const clause of clauses) {
    if (copiedTarget) {
      clarifications.push('复制会产生新的图层 ID；请先执行复制并选择副本，再规划后续操作，当前未生成后续步骤。')
      break
    }
    const parsed = parseClause(clause, options)
    if (parsed.clarification) clarifications.push(parsed.clarification)
    else if (parsed.warning) warnings.push(parsed.warning)
    else if (parsed.tool && parsed.args) {
      if (!available.includes(parsed.tool)) warnings.push(`当前能力不支持“${parsed.tool}”，未生成该步骤。`)
      else { steps.push(makeStep(steps.length, parsed.tool, parsed.args)); copiedTarget = parsed.tool === 'duplicate' }
    }
  }
  return {steps, explanation: steps.length ? `已拆分为 ${steps.length} 个有依赖步骤，执行前请确认影响。` : '', clarifications:[...new Set(clarifications)], warnings:[...new Set(warnings)], systemPrompt:plannerPrompt(available)}
}
