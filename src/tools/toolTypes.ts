export type ToolGroupId =
  | 'select-move'
  | 'selection'
  | 'brush'
  | 'erase-heal'
  | 'mask'
  | 'crop-transform'
  | 'text-shape'
  | 'color-fill'
  | 'navigation'
  | 'cutout'
  | 'upscale'

export type ToolId =
  | 'select'
  | 'move'
  | 'selection'
  | 'rectangle-select'
  | 'ellipse-select'
  | 'lasso-select'
  | 'polygon-select'
  | 'bezier-select'
  | 'subject-select'
  | 'magic-wand'
  | 'brush'
  | 'pencil'
  | 'gradient-brush'
  | 'brush-line'
  | 'soft-brush'
  | 'smudge'
  | 'eraser'
  | 'background-eraser'
  | 'remove-object'
  | 'dodge'
  | 'burn'
  | 'healing'
  | 'clone-stamp'
  | 'patch'
  | 'mask'
  | 'mask-quick'
  | 'mask-gradient'
  | 'mask-subject'
  | 'crop'
  | 'perspective-crop'
  | 'transform'
  | 'text'
  | 'shape'
  | 'shape-ellipse'
  | 'shape-line'
  | 'shape-arrow'
  | 'pen'
  | 'picker'
  | 'fill'
  | 'gradient-fill'
  | 'pan'
  | 'zoom'
  | 'rotate'
  | 'cutout'
  | 'upscale'

export type ToolOptions = Record<string, unknown>

export type ToolDefinition = {
  id: ToolId
  groupId: ToolGroupId
  label: string
  shortcut?: string
  glyph?: string
  options?: ToolOptions
}

export type ToolGroupDefinition = {
  id: ToolGroupId
  label: string
  defaultToolId: ToolId
  tools: readonly ToolDefinition[]
}
