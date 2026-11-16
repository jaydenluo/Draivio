import type { PixelImage } from '../../canvas/rasterTools'
import type { DocumentAnchor } from '../../document/documentGeometry'
import type { PixelCrop } from '../maskedEdit/pixels'
export type Expansion = {width:number;height:number;originalWidth:number;originalHeight:number;x:number;y:number}
export type Edges={left:number;right:number;top:number;bottom:number}
function validate(e:Expansion){if(!Object.values(e).every(Number.isInteger)||e.originalWidth<1||e.originalHeight<1||e.width<e.originalWidth||e.height<e.originalHeight||e.width>16384||e.height>16384||e.width*e.height>16777216||e.x<0||e.y<0||e.x+e.originalWidth>e.width||e.y+e.originalHeight>e.height)throw new Error('扩展尺寸或原图位置无效（最多 1600 万像素）');if(e.width===e.originalWidth&&e.height===e.originalHeight)throw new Error('请先扩大画布边界')}
export function expansionFromEdges(w:number,h:number,edges:Edges):Expansion{const {left:x,right,top:y,bottom}=edges;if(Object.values(edges).some(v=>!Number.isInteger(v)||v<0))throw new Error('扩展边距必须为非负整数像素');const e={width:w+x+right,height:h+y+bottom,originalWidth:w,originalHeight:h,x,y};validate(e);return e}
export function expansionFromAnchor(w:number,h:number,width:number,height:number,anchor:DocumentAnchor):Expansion{
 const ax=anchor.includes('left')||anchor==='left'?0:anchor.includes('right')||anchor==='right'?1:.5,ay=anchor.includes('top')?0:anchor.includes('bottom')?1:.5
 const e={width,height,originalWidth:w,originalHeight:h,x:Math.floor((width-w)*ax),y:Math.floor((height-h)*ay)};validate(e);return e
}
export function outpaintMask(e:Expansion):Uint8Array{validate(e);const mask=new Uint8Array(e.width*e.height).fill(255);for(let y=e.y;y<e.y+e.originalHeight;y++)mask.fill(0,y*e.width+e.x,y*e.width+e.x+e.originalWidth);return mask}
export function expandedPixels(original:PixelImage,e:Expansion):PixelImage{validate(e);if(original.width!==e.originalWidth||original.height!==e.originalHeight)throw new Error('原图尺寸已改变');const data=new Uint8ClampedArray(e.width*e.height*4);for(let y=0;y<original.height;y++)data.set(original.data.subarray(y*original.width*4,(y+1)*original.width*4),((y+e.y)*e.width+e.x)*4);return {width:e.width,height:e.height,data}}
export function tilePlan(e:Expansion,limit=1024,overlap=32):PixelCrop[]{
 validate(e);if(!Number.isInteger(limit)||limit<64||limit>2048||!Number.isInteger(overlap)||overlap<1||overlap*2>=limit)throw new Error('端点分块尺寸无效')
 const step=limit-overlap*2,tiles:PixelCrop[]=[]
 for(let y=0;y<e.height;y+=step)for(let x=0;x<e.width;x+=step){const x0=Math.max(0,x-overlap),y0=Math.max(0,y-overlap),right=Math.min(e.width,x+step+overlap),bottom=Math.min(e.height,y+step+overlap);if(x0>=e.x&&y0>=e.y&&right<=e.x+e.originalWidth&&bottom<=e.y+e.originalHeight)continue;tiles.push({x:x0,y:y0,width:right-x0,height:bottom-y0})}
 if(tiles.length>64)throw new Error(`需要 ${tiles.length} 次调用，超过单批 64 次限制；请减小扩展范围`)
 const distance=(t:PixelCrop)=>Math.max(e.x-(t.x+t.width),t.x-(e.x+e.originalWidth),0)+Math.max(e.y-(t.y+t.height),t.y-(e.y+e.originalHeight),0)
 return tiles.sort((a,b)=>distance(a)-distance(b))
}
