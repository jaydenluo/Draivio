import type { ToolDefinition, ToolGroupDefinition, ToolGroupId, ToolId } from './toolTypes'

const tool = (id: ToolId, groupId: ToolGroupId, label: string, shortcut?: string, glyph?: string): ToolDefinition => ({ id, groupId, label, shortcut, glyph })

export const TOOL_GROUPS: readonly ToolGroupDefinition[] = [
  { id: 'select-move', label: '选择/移动', defaultToolId: 'select', tools: [tool('select', 'select-move', '选择', 'V', '⌁'), tool('move', 'select-move', '移动', 'H', '✥')] },
  { id: 'selection', label: '选区', defaultToolId: 'selection', tools: [tool('selection', 'selection', '选区'), tool('rectangle-select', 'selection', '矩形选框', 'M', '▧'), tool('ellipse-select', 'selection', '椭圆选框', 'M', '◯'), tool('lasso-select', 'selection', '套索', 'L'), tool('polygon-select', 'selection', '多边形套索', 'L', '⌁'), tool('bezier-select', 'selection', '贝塞尔路径', 'P', '⌘'), tool('magic-wand', 'selection', '魔棒', 'W'), tool('subject-select', 'selection', '主体选择')] },
  { id: 'brush', label: '画笔', defaultToolId: 'brush', tools: [tool('brush', 'brush', '画笔', 'B', '✎'), tool('pencil', 'brush', '铅笔'), tool('gradient-brush', 'brush', '渐变画笔'), tool('brush-line', 'brush', '直线画笔'), tool('soft-brush', 'brush', '柔边笔'), tool('smudge', 'brush', '涂抹')] },
  { id: 'erase-heal', label: '擦除/修复', defaultToolId: 'eraser', tools: [tool('eraser', 'erase-heal', '橡皮', 'E', '◌'), tool('background-eraser', 'erase-heal', '背景橡皮擦'), tool('healing', 'erase-heal', '修复画笔', 'J'), tool('clone-stamp', 'erase-heal', '仿制图章', 'S')] },
  { id: 'mask', label: '蒙版', defaultToolId: 'mask', tools: [tool('mask', 'mask', '蒙版', 'Q', '◩'), tool('mask-quick', 'mask', '快速蒙版'), tool('mask-gradient', 'mask', '渐变蒙版'), tool('mask-subject', 'mask', '主体蒙版')] },
  { id: 'crop-transform', label: '裁剪/变换', defaultToolId: 'crop', tools: [tool('crop', 'crop-transform', '裁剪', 'C', '⌗'), tool('perspective-crop', 'crop-transform', '透视裁剪'), tool('transform', 'crop-transform', '变换')] },
  { id: 'text-shape', label: '文字/形状', defaultToolId: 'text', tools: [tool('text', 'text-shape', '文字', 'T', 'T'), tool('shape', 'text-shape', '形状', 'U', '□'), tool('shape-ellipse', 'text-shape', '圆形', 'U', '◯'), tool('shape-line', 'text-shape', '线条', 'U', '╱'), tool('shape-arrow', 'text-shape', '箭头', 'U', '↗'), tool('pen', 'text-shape', '钢笔')] },
  { id: 'color-fill', label: '颜色/填充', defaultToolId: 'picker', tools: [tool('picker', 'color-fill', '取色', 'I', '◉'), tool('fill', 'color-fill', '填充', 'G'), tool('gradient-fill', 'color-fill', '渐变')] },
  { id: 'navigation', label: '导航', defaultToolId: 'pan', tools: [tool('pan', 'navigation', '平移', 'H', '✋'), tool('zoom', 'navigation', '缩放', 'Z'), tool('rotate', 'navigation', '旋转画布', 'R')] },
  { id: 'cutout', label: '扣图', defaultToolId: 'cutout', tools: [tool('cutout', 'cutout', '扣图', undefined, '◐')] },
  { id: 'upscale', label: '超分', defaultToolId: 'upscale', tools: [tool('upscale', 'upscale', '超分', undefined, '↗')] },
]

export const toolRegistry: Record<ToolGroupId, ToolGroupDefinition> = Object.fromEntries(TOOL_GROUPS.map((group) => [group.id, group])) as Record<ToolGroupId, ToolGroupDefinition>

const toolsById = new Map<ToolId, ToolDefinition>(TOOL_GROUPS.flatMap((group) => group.tools).map((definition) => [definition.id, definition]))

export function getTool(toolId: ToolId | string): ToolDefinition | undefined { return toolsById.get(toolId as ToolId) }
export function getToolGroup(toolId: ToolId | string): ToolGroupDefinition | undefined {
  const definition = getTool(toolId)
  return definition ? toolRegistry[definition.groupId] : undefined
}
