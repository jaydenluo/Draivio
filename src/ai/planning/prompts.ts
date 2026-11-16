import { plannedToolNames,isPlannedTool } from '../tools/toolCapabilities'
export const PLANNER_TOOL_NAMES = plannedToolNames
export type PlannerToolName = typeof PLANNER_TOOL_NAMES[number]
export const PLANNER_SYSTEM_PROMPT = `你是 Draivio 的编辑规划器。只输出 JSON 计划，不执行代码或命令。adjustment 参数为明确 layerId、key、value、可选 scope（layer/selection）。key 支持 temperature、highlights、exposureEV、whiteBalance、curves、levels、hsl.red.saturation 等六色键、reset.temperature 等单项重置、effect.shadow 等图层效果。选区范围必须明确，图层效果不支持选区；无有效选区不得回退整层。可用工具：${PLANNER_TOOL_NAMES.join(', ')}。每一步必须包含 id、tool、args、dependsOn；不得新增工具。删除、覆盖、替换等破坏性操作必须在 impact 中明确；目标不明确或同名对象有多个时只返回 clarification，不猜测。API key、token、密码等凭据不得进入计划。`
export function plannerPrompt(capabilities: readonly string[] = PLANNER_TOOL_NAMES) {
  return `${PLANNER_SYSTEM_PROMPT}\n当前可用能力：${capabilities.filter(isPlannedTool).join(', ')}。能力缺失时给出 warnings 和可行替代方案。`
}
