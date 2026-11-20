import { useLayerStyleEditor } from '../layers/LayerStyleEditor'
import { layerStyleUnavailableReason } from '../layers/layerStyleCapability'
import { LayerMenu, type LayerMenuItem } from '../layers/LayerMenu'
import { useEditor } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { executeEditorCommand } from '../commands/editorCommands'
import { formatShortcut, shortcutFor, useShortcutVersion } from '../commands/shortcuts'
import { ToolIcon } from '../components/ToolIcon'
import { EDIT_SELECTION_EVENT } from '../creation/composerEvents'
import './canvasSelectionMenu.css'

function SelectionActionIcon({kind}:{kind:'expand'|'contract'|'invert'|'all'|'deselect'}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2 3"/>{kind==='expand'||kind==='contract'?<path d={kind==='expand'?'M8 12h8M12 8v8':'M8 12h8'}/>:kind==='deselect'?<path d="m8 8 8 8m0-8-8 8"/>:kind==='invert'?<path d="M12 4v16H4V4Z" fill="currentColor" stroke="none"/>:<rect x="8" y="8" width="8" height="8" rx="1"/>}</svg>
}

export function CanvasSelectionMenu({x,y,onClose,onContentFill,onCopySelection,onRefine,anchor}:{anchor?:HTMLElement|null;x:number;y:number;onClose:()=>void;onContentFill:()=>void;onCopySelection:()=>void;onRefine?:()=>void}) {
  const {state,dispatch}=useEditor()
  const {open:openStyleEditor}=useLayerStyleEditor()
  const hasSelection=state.selectionVisible&&state.selection.rect.width>0&&state.selection.rect.height>0
  useShortcutVersion()
  const layer=state.layers.find(item=>item.id===state.selectedLayerId)
  const effective=layer?effectiveLayerState(state.layers,layer.id):{visible:false,locked:true}
  const writable=!!layer&&effective.visible&&!effective.locked
  const copyUnavailable = layer?.kind === 'adjustment'
    ? '调整图层没有可单独复制的像素'
    : !layer || !effective.visible || state.rasterPreviewOnly || state.colorModel === 'cmyk'
      ? '请选择可复制的可见 RGB 图层'
      : undefined
  const hasMask=!!state.layerMasks[state.selectedLayerId]
  const amount=typeof state.toolOptions.selectionAdjustment==='number'?state.toolOptions.selectionAdjustment:1
  const size=`${Math.round(state.selection.rect.width*state.documentWidth/100)} × ${Math.round(state.selection.rect.height*state.documentHeight/100)} px`
  const shortcut=(id:string)=>formatShortcut(shortcutFor(id))
  const items:LayerMenuItem[]=[
    {id:'ai',label:'AI 局部修改',section:'edit',icon:<ToolIcon toolId="magic-wand"/>,disabled:!writable||!!state.isGenerating,title:'打开 AI 输入框，描述选区内的修改；不会立即生成'},
    {id:'fill',label:'内容识别填充',section:'edit',icon:<ToolIcon toolId="healing"/>,disabled:!writable||!!layer?.children,title:'使用本地内容识别填充工作区'},
    {id:'refine',label:'选择并遮住',section:'selection',icon:<ToolIcon toolId="selection"/>,disabled:!onRefine},
    {id:'expand',label:'扩展选区',section:'selection',icon:<SelectionActionIcon kind="expand"/>,shortcut:`${amount}%`,title:'按工具栏的选区调整量扩展'},
    {id:'contract',label:'收缩选区',section:'selection',icon:<SelectionActionIcon kind="contract"/>,shortcut:`${amount}%`,title:'按工具栏的选区调整量收缩'},
    {id:'mask',label:'从选区创建蒙版',section:'selection',icon:<ToolIcon toolId="mask"/>,disabled:!writable||hasMask,title:hasMask?'当前图层已有蒙版，请在蒙版工具中编辑':'创建可继续编辑的图层蒙版'},
    {id:'copy-selection',label:'将选区复制到新图层',section:'selection',disabled:!!copyUnavailable,title:copyUnavailable??'复制当前图层在选区内的可见像素'},
    {id:'all',label:'全部选择',section:'manage',icon:<SelectionActionIcon kind="all"/>,shortcut:shortcut('all')},
    {id:'invert',label:'反向选择',section:'manage',icon:<SelectionActionIcon kind="invert"/>,shortcut:shortcut('invert')},
    {id:'deselect',label:'取消选择',section:'manage',icon:<SelectionActionIcon kind="deselect"/>,shortcut:shortcut('deselect')},
  ]
  const styleItem:LayerMenuItem={id:'layer-style',label:'当前图层的混合选项…',section:'layer',icon:<span aria-hidden="true">fx</span>,disabled:!layer||!!layerStyleUnavailableReason(state,layer.id),title:'编辑当前图层的样式，效果作用于图层全部可见内容'}
  return <LayerMenu x={x} y={y} label={hasSelection?"选区操作":"画布图层操作"} className="canvas-selection-menu" heading={<><span>{hasSelection?'选区':'当前图层'}</span><span className="selection-menu-size">{hasSelection?size:layer?.name}</span></>} items={hasSelection?[...items,styleItem]:[styleItem]} onClose={onClose} onAction={id=>{
    if(id==='layer-style'&&layer){const target=anchor??document.querySelector<HTMLElement>('[aria-label="主画布"]');if(target)openStyleEditor(layer.id,target)}
    else if(id==='ai')window.dispatchEvent(new Event(EDIT_SELECTION_EVENT))
    else if(id==='copy-selection')onCopySelection()
    else if(id==='fill')onContentFill()
    else if(id==='refine')onRefine?.()
    else if(id==='mask')dispatch({type:'selection-to-mask'})
    else if(id==='expand'||id==='contract')dispatch({type:'morph-selection',amount:id==='expand'?amount:-amount})
    else executeEditorCommand(id,state,dispatch)
  }}/>
}
