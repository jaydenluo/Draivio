import type { PixelImage } from '../../canvas/rasterTools'
export type PixelCrop = { x: number; y: number; width: number; height: number }
export type MaskSemantics = 'transparent-edit' | 'white-edit'
function dimensions(width:number,height:number,length:number,channels=1){if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||length!==width*height*channels)throw new Error('蒙版或图像尺寸无效')}
export function cropForMask(mask:Uint8Array,width:number,height:number,padding=32):PixelCrop {
 dimensions(width,height,mask.length);let left=width,top=height,right=-1,bottom=-1
 mask.forEach((alpha,i)=>{if(alpha){const x=i%width,y=Math.floor(i/width);left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}})
 if(right<0)throw new Error('选区为空，无法生成填充')
 const p=Math.max(0,Math.ceil(padding)),x=Math.max(0,left-p),y=Math.max(0,top-p)
 return {x,y,width:Math.min(width,right+p+1)-x,height:Math.min(height,bottom+p+1)-y}
}
export function cropPixels(image:PixelImage,crop:PixelCrop):PixelImage {
 dimensions(image.width,image.height,image.data.length,4)
 const data=new Uint8ClampedArray(crop.width*crop.height*4)
 for(let y=0;y<crop.height;y++)data.set(image.data.subarray(((crop.y+y)*image.width+crop.x)*4,((crop.y+y)*image.width+crop.x+crop.width)*4),y*crop.width*4)
 return {...crop,data}
}
export function encodeEndpointMask(mask:Uint8Array,width:number,height:number,semantics:MaskSemantics):PixelImage {
 dimensions(width,height,mask.length);const data=new Uint8ClampedArray(mask.length*4)
 mask.forEach((v,i)=>data.set(semantics==='transparent-edit'?[255,255,255,255-v]:[v,v,v,255],i*4))
 return {width,height,data}
}
/** Premultiplied interpolation is replacement, so original bytes survive wherever mask is zero. */
export function compositeMaskedResult(original:PixelImage,generated:PixelImage,mask:Uint8Array,crop:PixelCrop):PixelImage {
 dimensions(original.width,original.height,mask.length);dimensions(generated.width,generated.height,generated.data.length,4)
 const data=new Uint8ClampedArray(original.data)
 for(let y=0;y<crop.height;y++)for(let x=0;x<crop.width;x++){
  const i=((crop.y+y)*original.width+crop.x+x)*4,t=mask[i/4]/255;if(!t)continue
  const gx=Math.min(generated.width-1,Math.floor((x+.5)*generated.width/crop.width)),gy=Math.min(generated.height-1,Math.floor((y+.5)*generated.height/crop.height)),g=(gy*generated.width+gx)*4
  const a=original.data[i+3]/255,b=generated.data[g+3]/255,out=a*(1-t)+b*t
  for(let c=0;c<3;c++)data[i+c]=out?(original.data[i+c]*a*(1-t)+generated.data[g+c]*b*t)/out:0
  data[i+3]=out*255
 }
 return {width:original.width,height:original.height,data}
}
