import { useSyncExternalStore } from 'react'
import { TOOL_GROUPS } from '../tools/toolRegistry'

export type CommandDefinition = { id:string; label:string; group:string; shortcut:string }
const command = (id:string,label:string,group:string,shortcut=''):CommandDefinition => ({id,label,group,shortcut})
const toolKeys:Record<string,string> = {select:'v','rectangle-select':'m','ellipse-select':'Shift+m','lasso-select':'l','polygon-select':'Shift+l',pen:'p',brush:'b',pencil:'Shift+b',eraser:'e','background-eraser':'Shift+e',healing:'j','clone-stamp':'s',dodge:'o',mask:'q',crop:'c',text:'t',picker:'i',pan:'h',zoom:'z',rotate:'r',shape:'u','shape-ellipse':'Shift+u','gradient-fill':'g',fill:'Shift+g','magic-wand':'w'}
export const commands:CommandDefinition[] = [
 command('new','新建','文件','Mod+n'),command('open','打开','文件','Mod+o'),command('importImage','导入图片','文件'),command('save','保存','文件','Mod+s'),command('saveAs','另存为','文件','Mod+Shift+s'),command('close','关闭文档','文件','Mod+w'),command('export','导出','文件','Mod+Alt+Shift+w'),
 command('swapColors','交换前景色与背景色','颜色','x'),command('resetColors','默认前景色与背景色','颜色','d'),command('fillForeground','前景色填充选区 / 整层','编辑','Alt+Backspace'),command('fillBackground','背景色填充选区 / 整层','编辑','Mod+Backspace'),
 command('undo','撤销','编辑','Mod+z'),command('redo','重做','编辑','Mod+Shift+z'),command('shortcuts','键盘快捷键','编辑','Mod+Alt+Shift+k'),
 command('size','图像大小','图像','Mod+Alt+i'),command('canvasSize','画布大小','图像','Mod+Alt+c'),command('cmyk','文档模式 / CMYK','图像'),command('raw','RAW 显影','图像'),
 command('addLayer','新建图层','图层','Mod+Shift+n'),command('duplicate','复制图层','图层','Mod+j'),command('group','图层编组','图层','Mod+g'),command('ungroup','取消图层编组','图层','Mod+Shift+g'),command('deleteLayer','删除图层','图层',/Mac|iPhone|iPad/.test(navigator.platform)?'Backspace':'Delete'),
 command('all','全部选择','选择','Mod+a'),command('deselect','取消选择','选择','Mod+d'),command('invert','反向选择','选择','Mod+Shift+i'),command('transform','自由变换','编辑','Mod+t'),
 command('zoomIn','放大','视图','Mod+='),command('zoomOut','缩小','视图','Mod+-'),command('fit','适合屏幕','视图','Mod+0'),command('actual','实际像素','视图','Mod+1'),command('proof','校样设置','视图'),
 command('layers','图层面板','视图','F7'),command('properties','属性面板','视图'),command('results','AI 结果面板','视图'),command('precision','高精度资源','工具'),command('creative','创作工具','工具'),command('batch','批量处理','工具'),command('artboards','画板管理','工具'),command('sources','服务来源','工具'),
 ...TOOL_GROUPS.flatMap(group=>group.tools.map(tool=>command(`tool:${tool.id}`,tool.label,'工具选择',toolKeys[tool.id]??''))),
]
const storageKey='draivio-keyboard-shortcuts-v1'
export type Bindings=Record<string,string>
export function readBindings():Bindings {
 try { const data=JSON.parse(localStorage.getItem(storageKey)??'{}'); return Object.fromEntries(commands.filter(c=>typeof data?.[c.id]==='string').map(c=>[c.id,data[c.id]])) } catch { return {} }
}
const listeners=new Set<()=>void>()
let version=0
export function useShortcutVersion(){return useSyncExternalStore(cb=>{listeners.add(cb);return()=>{listeners.delete(cb)}},()=>version)}
export function shortcutFor(id:string, overrides=readBindings()){return overrides[id]??commands.find(c=>c.id===id)?.shortcut??''}
export function saveBindings(bindings:Bindings){localStorage.setItem(storageKey,JSON.stringify(bindings));version++;listeners.forEach(fn=>fn())}
export function formatShortcut(value:string){return value.replace(/(^|\+)([a-z])(?=$|\+)/g,(_,prefix:string,key:string)=>prefix+key.toUpperCase()).replace(/Mod/g,/Mac|iPhone|iPad/.test(navigator.platform)?'⌘':'Ctrl').replace(/Shift/g,'⇧').replace(/Alt/g,/Mac/.test(navigator.platform)?'⌥':'Alt')}
export function eventShortcut(event:Pick<KeyboardEvent,'key'|'metaKey'|'ctrlKey'|'altKey'|'shiftKey'> & {code?:string}){
 const eventKey=event.altKey && /^Key[A-Z]$/.test(event.code??'') ? event.code!.slice(3).toLowerCase() : event.key
 const key=eventKey===' '? 'Space':eventKey==='+'?'=':eventKey.length===1?eventKey.toLowerCase():eventKey
 if(['Control','Meta','Alt','Shift','Dead','Unidentified'].includes(key))return ''
 return [...(event.metaKey||event.ctrlKey?['Mod']:[]),...(event.altKey?['Alt']:[]),...(event.shiftKey && event.key!=='+'?['Shift']:[]),key].join('+')
}
export function matchesShortcut(event:KeyboardEvent,id:string){const value=shortcutFor(id);return !!value&&eventShortcut(event)===value}
export function shortcutConflict(id:string,value:string,bindings:Bindings){return value?commands.find(c=>c.id!==id&&shortcutFor(c.id,bindings)===value):undefined}
export const COMMAND_EVENT='draivio:command'
export function runCommand(id:string){window.dispatchEvent(new CustomEvent(COMMAND_EVENT,{detail:id}))}

export function isShortcutTextTarget(target:EventTarget|null):boolean {
 let element=target instanceof Element?target:null
 while(element){
   const html=element as HTMLElement
   if(element.matches('input,textarea,select,[role="textbox"]')||html.isContentEditable||html.contentEditable==='true'||element.hasAttribute('contenteditable')&&element.getAttribute('contenteditable')!=='false')return true
   element=element.parentElement
 }
 return false
}
export const toolFamilies=[['rectangle-select','ellipse-select'],['lasso-select','polygon-select'],['brush','pencil'],['eraser','background-eraser'],['shape','shape-ellipse'],['gradient-fill','fill']]
export function toolCommandForKey(id:string,current:string,event:KeyboardEvent):string {
 if(!id.startsWith('tool:'))return id
 const family=toolFamilies.find(f=>f.includes(id.slice(5)))
 if(!family||family.some(tool=>shortcutFor(`tool:${tool}`)!==commands.find(c=>c.id===`tool:${tool}`)?.shortcut))return id
 if(event.shiftKey)return `tool:${family[(family.indexOf(current)+1)%family.length]}`
 return family.includes(current)?`tool:${current}`:id
}

// Keep native text editing intact when file commands have been reassigned.
export function matchesFileShortcut(event:KeyboardEvent,id:string){
 if(!matchesShortcut(event,id))return false
 if(!isShortcutTextTarget(event.target)&&!isShortcutTextTarget(document.activeElement))return true
 return shortcutFor(id)===commands.find(command=>command.id===id)?.shortcut
}
