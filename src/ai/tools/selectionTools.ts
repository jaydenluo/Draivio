import type { TargetCandidate } from '../vision/targetResolver'
import type { AffineMatrix } from '../../canvas/layerCoordinates'
import type { Selection } from '../../canvas/selectionGeometry'
import { blurAlpha } from '../../masks/refineMask'
export type TargetMapping={analysisWidth:number;analysisHeight:number;sourceWidth:number;sourceHeight:number;documentWidth:number;documentHeight:number;matrix:AffineMatrix;background?:boolean;feather?:number;signal?:AbortSignal}
/** Nearest original pixel centers, inverse full world affine; no bounding-box approximation. */
export function mapTargetMask(candidate:TargetCandidate,o:TargetMapping):Uint8Array{
 if(![o.analysisWidth,o.analysisHeight,o.sourceWidth,o.sourceHeight,o.documentWidth,o.documentHeight].every(n=>Number.isSafeInteger(n)&&n>0)||o.documentWidth*o.documentHeight>16_777_216||candidate.alpha.length!==o.analysisWidth*o.analysisHeight||!o.matrix.every(Number.isFinite)||!Number.isFinite(o.feather??0)||(o.feather??0)<0||(o.feather??0)>64)throw new Error('分割蒙版映射尺寸或参数无效')
 const [a,b,c,d,e,f]=o.matrix,det=a*d-b*c;if(Math.abs(det)<1e-10)throw new Error('目标图层变换不可逆')
 let alpha=new Uint8Array(o.documentWidth*o.documentHeight)
 for(let y=0;y<o.documentHeight;y++){
  if(o.signal?.aborted)throw new DOMException('分割已取消','AbortError')
  for(let x=0;x<o.documentWidth;x++){
   const dx=x+.5-e,dy=y+.5-f,sx=(d*dx-c*dy)/det,sy=(-b*dx+a*dy)/det
   if(sx<0||sy<0||sx>=o.sourceWidth||sy>=o.sourceHeight)continue
   const ax=Math.floor(sx/o.sourceWidth*o.analysisWidth),ay=Math.floor(sy/o.sourceHeight*o.analysisHeight)
   alpha[y*o.documentWidth+x]=candidate.alpha[ay*o.analysisWidth+ax]
  }
 }
 if(o.feather)alpha=new Uint8Array(blurAlpha(alpha,o.documentWidth,o.documentHeight,o.feather))
 if(o.background)for(let i=0;i<alpha.length;i++)alpha[i]=255-alpha[i]
 return alpha
}
export function maskSelection(alpha:Uint8Array,width:number,height:number):Selection{
 if(alpha.length!==width*height||!width||!height)throw new Error('分割选区尺寸无效')
 const rows:string[]=[],parts:string[]=[];let minX=width,minY=height,maxX=-1,maxY=-1
 for(let y=0;y<height;y++){let row='',start=-1;for(let x=0;x<=width;x++){const hit=x<width&&alpha[y*width+x]>0;if(x<width)row+=hit?'1':'0';if(hit){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);if(start<0)start=x}else if(start>=0){parts.push(`M${start/width*100} ${y/height*100}h${(x-start)/width*100}v${100/height}H${start/width*100}Z`);start=-1}}rows.push(row)}
 if(maxX<0)throw new Error('目标在画布中没有有效像素，请调整图层或选择其他候选')
 return {kind:'path',mode:'new',rect:{x:minX/width*100,y:minY/height*100,width:(maxX-minX+1)/width*100,height:(maxY-minY+1)/height*100},path:{type:'raster',rows,d:parts.join(''),alpha:Array.from(alpha),alphaWidth:width,alphaHeight:height},feather:0,fixedRatio:null}
}
