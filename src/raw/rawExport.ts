import {exportSvgImage,type ExportDependencies} from '../render/exportImage'
import type {IccProfile} from '../color/iccPipeline'
import type {RawDecodeResult} from './rawPipeline'
/** Explicit 8-bit display export; 16-bit original stays in the project. */
export function exportRawPreview(result:RawDecodeResult,profile:IccProfile,deps:ExportDependencies={}){
 if(!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(result.preview))throw new Error('RAW预览无效')
 const {width,height}=result.asset
 return exportSvgImage(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><image href="${result.preview}" width="${width}" height="${height}"/></svg>`,{format:'png',width,height,profile},deps)
}
