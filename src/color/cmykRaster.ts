import type { EditorState } from '../state/editor'
import { snapshot } from '../state/editor'
import { defaultProfile } from './iccPipeline'
export type CmykRaster={width:number;height:number;data:string;profile:string;profileName:string;previewPng:string;maximumInk:number;rgb:string;totalInkLimit:number;sourcePreviewPng?:string;sourceDocument?:Partial<EditorState>}
export type CmykBackendRequest={operation:'capabilities'|'convert'|'render'|'export';width?:number;height?:number;data?:string;profile?:string;sourceProfile?:string;renderingIntent?:string;blackPointCompensation?:boolean;simulatePaperWhite?:boolean;simulateBlackInk?:boolean;totalInkLimit?:number}
export type CmykBackendResult=Omit<CmykRaster,'totalInkLimit'> & {available?:boolean;systemProfile?:boolean;backend?:string;tiff?:string;verifiedChannels?:number}
export const base64Bytes=(bytes:Uint8Array)=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)}
export const fromBase64=(text:string)=>Uint8Array.from(atob(text),x=>x.charCodeAt(0))
export async function cmykBackend(request:CmykBackendRequest):Promise<CmykBackendResult>{
 if(!(window as unknown as {__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__)throw new Error('CMYK ICC 转换和 TIFF 需要桌面版及本机 Python 3 + Pillow（LittleCMS2/libtiff）；浏览器仍可打开已有 CMYK 项目预览。')
 const {invokeCommand}=await import('../lib/native');return invokeCommand<CmykBackendResult>('cmyk_process',{request})
}
export function validateCmykRaster(value:unknown):asserts value is CmykRaster{
 if(!value||typeof value!=='object')throw new Error('CMYK 像素资源无效')
 const r=value as CmykRaster
 if(JSON.stringify(r).length*8>384*1024*1024)throw new Error('CMYK 源与预览超出项目保守内存预算；请先缩小工作副本')
 if(!Number.isInteger(r.width)||!Number.isInteger(r.height)||r.width<=0||r.height<=0||r.width*r.height>4_000_000)throw new Error('CMYK 像素尺寸无效')
 if(typeof r.data!=='string'||r.data.length>24_000_000||fromBase64(r.data).length!==r.width*r.height*4)throw new Error('CMYK 四通道数据无效')
 if(typeof r.profile!=='string'||r.profile.length>5_600_000)throw new Error('CMYK ICC 数据无效')
 const profile=fromBase64(r.profile);if(profile.length<132||new TextDecoder().decode(profile.slice(16,20))!=='CMYK'||new TextDecoder().decode(profile.slice(36,40))!=='acsp')throw new Error('CMYK ICC 配置不匹配')
 if(!r.previewPng?.startsWith('data:image/png;base64,')||typeof r.profileName!=='string'||!Number.isFinite(r.maximumInk)||r.maximumInk<0||r.maximumInk>4||!Number.isFinite(r.totalInkLimit)||r.totalInkLimit<=0||r.totalInkLimit>4)throw new Error('CMYK 预览或墨量无效')
 if(typeof r.rgb!=='string'||fromBase64(r.rgb).length!==r.width*r.height*4)throw new Error('CMYK RGB 预览数据无效')
 if(r.sourceDocument?.cmykRaster)throw new Error('CMYK 源文档不能递归嵌套')
}
/** Cached RGB is display-only. Device channels remain authoritative for print. */
export function cmykState(before:EditorState,raster:CmykRaster):EditorState{
 validateCmykRaster(raster)
 const id='cmyk-preview',boardId='cmyk-board'
 return {...before,pixelFormat:'rgba8',colorModel:'cmyk',cmykRaster:raster,colorManagement:{profile:defaultProfile(),renderingIntent:'relative-colorimetric'},documentWidth:raster.width,documentHeight:raster.height,documentBackground:'#ffffff',layers:[{id,name:`CMYK · ${raster.profileName}`,source:raster.previewPng,visible:true,opacity:100,blendMode:'正常',className:'layer-art'}],selectedLayerId:id,selectedLayerIds:[id],canvasTexts:[],canvasShapes:[],brushStrokes:[],layerMasks:{},smartObjectSources:{},sceneOrder:[],cropRect:null,selectionVisible:false,artboards:[{id:boardId,name:'CMYK 文档',x:0,y:0,width:raster.width,height:raster.height,background:'#ffffff',layerIds:[id]}],activeArtboardId:boardId}
}
export function retainRgbSource(state:EditorState):Partial<EditorState>{const source=structuredClone(snapshot(state));delete source.cmykRaster;return source}
export function rgbWorkingCopy(state:EditorState):EditorState{
 if(!state.cmykRaster)throw new Error('没有 CMYK 源像素')
 return {...state,colorModel:'rgb',notice:'已显式转换为 RGB 工作副本；CMYK 源通道保留，可撤销'}
}
export function cmykPixel(raster:CmykRaster,x:number,y:number,channels:number[]):string{
 if(!Number.isInteger(x)||!Number.isInteger(y)||x<0||y<0||x>=raster.width||y>=raster.height||channels.length!==4||channels.some(v=>!Number.isFinite(v)||v<0||v>100))throw new Error('CMYK 坐标或通道百分比无效')
 const data=fromBase64(raster.data);data.set(channels.map(v=>Math.round(v/100*255)),(y*raster.width+x)*4);return base64Bytes(data)
}

/** Soft-proof consumers use this cached ICC result; they must not convert CMYK twice. */
export function cmykDisplayRgba(raster:CmykRaster):Uint8ClampedArray{validateCmykRaster(raster);return new Uint8ClampedArray(fromBase64(raster.rgb))}
