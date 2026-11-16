import type { EditorState } from '../../state/editor'
import { applyRelight, buildRelightPlan, type RelightSettings } from '../workflows/relight'

export const lightingTools = {
  relight: {
    description: '有限非破坏布光：左/右/顶部方向、色温、强度、背景协调和接触阴影。生成式布光需单独配置真实模型。',
    execute: (state: EditorState, args: RelightSettings & { layerId: string }) => applyRelight(state, args.layerId, args),
    preview: (settings: RelightSettings) => buildRelightPlan(settings),
  },
} as const
