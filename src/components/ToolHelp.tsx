import { useRef, useState } from 'react'
import { AnchoredWindow } from '../ui/AnchoredWindow'
import { useEditor } from '../state/editor'
import { getTool } from '../tools/toolRegistry'
import { toolInstructions, toolUnavailableReason } from '../tools/toolHelp'
import { formatShortcut, shortcutFor, useShortcutVersion } from '../commands/shortcuts'
export function ToolHelp(){
 const {state}=useEditor(),[open,setOpen]=useState(false),anchor=useRef<HTMLButtonElement>(null)
 useShortcutVersion()
 const tool=getTool(state.activeToolId),reason=toolUnavailableReason(state)
 return <><button ref={anchor} className="tool-help-trigger" aria-label="当前工具用法" title="当前工具用法" onClick={()=>setOpen(!open)}>?</button>{open?<AnchoredWindow anchor={anchor} title={`${tool?.label??'工具'} · 用法`} onClose={()=>setOpen(false)} width={330} className="tool-help-window" dismissOnOutside><p>{toolInstructions[state.activeToolId]}</p>{reason?<p role="status">{reason}</p>:null}<p>工具快捷键：{formatShortcut(shortcutFor(`tool:${state.activeToolId}`))||'未设置，可在编辑 → 键盘快捷键中设置'}</p><p>按住 Space 临时平移；Esc 取消当前操作。</p>{['fill','gradient-fill','brush','pencil','gradient-brush'].includes(state.activeToolId)?<p>前景色用于绘画；背景色用于背景色填充，不改变画布背景。交换：{formatShortcut(shortcutFor('swapColors'))}；恢复黑白：{formatShortcut(shortcutFor('resetColors'))}。</p>:null}{state.activeToolId==='fill'?<p>连续：只填相连区域。关闭连续：填充取样范围内的相近颜色。提高容差可包含更多边缘颜色。整层或选区填色请使用“前景色填充选区 / 整层”。</p>:null}</AnchoredWindow>:null}</>
}
