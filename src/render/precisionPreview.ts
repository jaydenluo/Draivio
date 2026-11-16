import { readNormalized, type PixelBuffer } from './pixelBuffer'

const srgb = (v: number) => v <= .0031308 ? 12.92*v : 1.055*Math.pow(v,1/2.4)-.055
/** Display-only conversion; never store this image as the original resource. */
export function precisionPreviewBytes(buffer: PixelBuffer, maxSide = 1024, encoding: 'linear' | 'srgb' = 'linear'): {width: number; height: number; data: Uint8ClampedArray; clippedChannels: number} {
  const scale=Math.min(1,maxSide/Math.max(buffer.width,buffer.height)),width=Math.max(1,Math.round(buffer.width*scale)),height=Math.max(1,Math.round(buffer.height*scale))
  const data=new Uint8ClampedArray(width*height*4);let clippedChannels=0
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const sourceX=Math.min(buffer.width-1,Math.floor(x/scale)),sourceY=Math.min(buffer.height-1,Math.floor(y/scale)),rgba=readNormalized(buffer,sourceY*buffer.width+sourceX)
    for(let c=0;c<4;c++) {
      if(c!==3&&(rgba[c]<0||rgba[c]>1))clippedChannels++
      const normalized=Math.max(0,Math.min(1,rgba[c]))
      data[(y*width+x)*4+c]=Math.round((c===3||encoding==='srgb'?normalized:srgb(normalized))*255)
    }
  }
  return {width,height,data,clippedChannels}
}
export function precisionPreviewPng(buffer: PixelBuffer, maxSide = 1024, encoding: 'linear' | 'srgb' = 'linear'): string {
  const preview=precisionPreviewBytes(buffer,maxSide,encoding),canvas=document.createElement('canvas')
  canvas.width=preview.width;canvas.height=preview.height
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法创建高精度显示预览')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(preview.data),preview.width,preview.height),0,0)
  return canvas.toDataURL('image/png')
}
