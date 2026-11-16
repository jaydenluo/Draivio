import type { PixelImage } from '../../canvas/rasterTools'
import { compositeMaskedResult,cropPixels,type PixelCrop } from '../maskedEdit/pixels'
/** Only pixel-aligned crop or full-document responses have a defined mapping. Never silently stretch. */
export function maskedResult(original:PixelImage,generated:PixelImage,mask:Uint8Array,crop:PixelCrop):PixelImage{
 if(![crop.x,crop.y,crop.width,crop.height].every(Number.isSafeInteger)||crop.x<0||crop.y<0||crop.width<1||crop.height<1||crop.x+crop.width>original.width||crop.y+crop.height>original.height)throw new Error('局部结果坐标超出原图，未生成候选')
 if(original.data.length!==original.width*original.height*4||mask.length!==original.width*original.height)throw new Error('原图或蒙版尺寸无效')
 const pixels=generated.width===crop.width&&generated.height===crop.height?generated:generated.width===original.width&&generated.height===original.height?cropPixels(generated,crop):null
 if(!pixels)throw new Error(`生成结果尺寸不符：需要 ${crop.width} × ${crop.height} 的请求裁片或 ${original.width} × ${original.height} 的原图尺寸，未生成候选`)
 return compositeMaskedResult(original,pixels,mask,crop)
}
