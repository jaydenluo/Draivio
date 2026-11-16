import {renderToStaticMarkup} from 'react-dom/server'
import {CanvasScene} from '../../canvas/CanvasScene'
import {MaskDefinitions} from '../../canvas/MaskOverlay'
import type {EditorState} from '../../state/editor'
import {layerParentId,layerSubtreeIds} from '../../state/layerHierarchy'
import {captureEditorContext,type EditorRequestContext,type EditorScope} from './editorContext'
export type PreviewRasterizer=(svg:string,width:number,height:number)=>Promise<string>
export async function rasterizePreview(svg:string,width:number,height:number):Promise<string>{
  const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}))
  try{await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('上下文预览解码超时')),15000);image.onload=()=>{clearTimeout(timeout);resolve()};image.onerror=()=>{clearTimeout(timeout);reject(new Error('无法渲染上下文预览，请检查图像资源'))};image.src=url});const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境不支持上下文位图预览');ctx.drawImage(image,0,0,width,height);const data=canvas.toDataURL('image/png');if(!data.startsWith('data:image/png;base64,'))throw new Error('上下文预览编码失败');return data}finally{URL.revokeObjectURL(url)}
}
export function contextPreviewSvg(state:EditorState,context:EditorRequestContext):string{
 let rendered=state
 if(context.scope==='layer'&&context.targetLayerId){const content=new Set(layerSubtreeIds(state.layers,context.targetLayerId));const ancestors=new Set<string>();let parent=layerParentId(state.layers,context.targetLayerId);while(parent){ancestors.add(parent);parent=layerParentId(state.layers,parent)}rendered={...state,documentBackground:'transparent',layers:state.layers.filter(l=>content.has(l.id)||ancestors.has(l.id)).map(l=>ancestors.has(l.id)?{...l,source:undefined}:l),brushStrokes:state.brushStrokes.filter(s=>content.has(s.layerId)),canvasShapes:state.canvasShapes.filter(s=>content.has(s.layerId)),canvasTexts:state.canvasTexts.filter(s=>content.has(s.layerId))}}
 const full=renderToStaticMarkup(<CanvasScene state={rendered} thumbnail/>);const inner=full.slice(full.indexOf('>')+1,full.lastIndexOf('</svg>'));const b=context.pixelBounds
 const selection=context.scope==='selection'&&context.selection?renderToStaticMarkup(<defs>{MaskDefinitions({selection:context.selection,strokes:[],inverted:false,applied:true},'context-selection',context.width,context.height)}</defs>):''
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${context.preview.width}" height="${context.preview.height}" viewBox="${b.x} ${b.y} ${b.width} ${b.height}">${selection}<g${selection?' mask="url(#context-selection)"':''}>${inner}</g></svg>`
}
export async function captureRenderedEditorContext(state:EditorState,documentId:string,scope:EditorScope,rasterize:PreviewRasterizer=rasterizePreview):Promise<EditorRequestContext>{
 const captured=captureEditorContext(state,documentId,scope),b=captured.pixelBounds
 const scale=Math.min(1,1024/Math.max(b.width,b.height)),width=Math.max(1,Math.round(b.width*scale)),height=Math.max(1,Math.round(b.height*scale))
 const context={...captured,preview:{width,height,scale}}
 const dataUrl=await rasterize(contextPreviewSvg(state,context),width,height)
 if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(dataUrl))throw new Error('上下文预览必须是实际 PNG 位图')
 return Object.freeze({...context,preview:Object.freeze({...context.preview,dataUrl})})
}
