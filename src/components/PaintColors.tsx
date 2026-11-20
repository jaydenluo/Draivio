import { useEditor } from '../state/editor'
import { formatShortcut, shortcutFor, useShortcutVersion } from '../commands/shortcuts'
import { ColorPicker } from './ColorPicker'
import './paintColors.css'

export function PaintColors(){
 const {state,dispatch}=useEditor()
 useShortcutVersion()
 return <div className="paint-colors" role="group" aria-label="前景色与背景色">
  <div className="paint-color-background"><ColorPicker label="背景色" value={state.backgroundColor??'#ffffff'} recentColors={state.recentColors} onChange={color=>dispatch({type:'set-background-color',color})}/></div>
  <div className="paint-color-foreground"><ColorPicker label="前景色" value={state.brushColor} recentColors={state.recentColors} onChange={color=>dispatch({type:'set-brush-color',color})}/></div>
  <button className="paint-colors-swap" aria-label="交换前景色与背景色" title={`交换前景色与背景色（${formatShortcut(shortcutFor('swapColors'))}）`} onClick={()=>dispatch({type:'swap-colors'})}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 5h8a8 8 0 0 1 8 8v8M7 1 3 5l4 4M15 17l4 4 4-4" /></svg></button>
  <button className="paint-colors-reset" aria-label="默认前景色与背景色" title={`重置黑白（${formatShortcut(shortcutFor('resetColors'))}）`} onClick={()=>dispatch({type:'reset-colors'})}><i/><i/></button>
 </div>
}
