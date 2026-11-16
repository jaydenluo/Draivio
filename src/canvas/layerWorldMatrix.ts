import type { Layer } from '../state/editor'
import { layerParentId } from '../state/layerHierarchy'
import { layerMatrix, multiplyMatrices, type AffineMatrix } from './layerCoordinates'
/** Complete physical SVG transform chain, including each layer's intrinsic content dimensions. */
export function layerWorldPixelMatrix(layers:Layer[],id:string,width:number,height:number,ancestors=new Set<string>()):AffineMatrix{
 const layer=layers.find(item=>item.id===id)
 if(!layer||ancestors.has(id))throw new Error('图层坐标链无效')
 const cw=layer.contentWidth??width,ch=layer.contentHeight??height
 if(![cw,ch].every(value=>Number.isFinite(value)&&value>0))throw new Error('图层内容尺寸无效')
 const m:AffineMatrix=layer.transform?layerMatrix(layer.transform,width,height):[1,0,0,1,0,0]
 const physical:AffineMatrix=[m[0]*width/cw,m[1]*height/cw,m[2]*width/ch,m[3]*height/ch,m[4]*width/100,m[5]*height/100]
 const parent=layerParentId(layers,id)
 return parent?multiplyMatrices(layerWorldPixelMatrix(layers,parent,width,height,new Set([...ancestors,id])),physical):physical
}
/** An integer pixel translation needs no filtering; near-identity float32 chains must not blur a baked PNG again. */
export function isPixelAlignedUnitMatrix(matrix:AffineMatrix):boolean{
 const epsilon=1e-5
 return Math.abs(matrix[0]-1)<epsilon&&Math.abs(matrix[1])<epsilon&&Math.abs(matrix[2])<epsilon&&Math.abs(matrix[3]-1)<epsilon&&Math.abs(matrix[4]-Math.round(matrix[4]))<epsilon&&Math.abs(matrix[5]-Math.round(matrix[5]))<epsilon
}
export function documentDeltaToParentLocal(layers:Layer[],id:string,dx:number,dy:number,width:number,height:number):{x:number;y:number}{
 const parent=layerParentId(layers,id); if(!parent)return {x:dx,y:dy}
 const m=layerWorldPixelMatrix(layers,parent,width,height); const det=m[0]*m[3]-m[1]*m[2]; if(Math.abs(det)<1e-8)return {x:dx,y:dy}
 const a=m[3]/det,b=-m[1]/det,c=-m[2]/det,d=m[0]/det
 return {x:(a*dx+c*dy)*100/width,y:(b*dx+d*dy)*100/height}
}
export function documentPointToLayerLocal(layers:Layer[],id:string,point:{x:number;y:number},width:number,height:number):{x:number;y:number}{
 const m=layerWorldPixelMatrix(layers,id,width,height),det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-8)return point
 const px=point.x*width/100,py=point.y*height/100,a=m[3]/det,b=-m[1]/det,c=-m[2]/det,d=m[0]/det
 const x=a*px+c*py-(a*m[4]+c*m[5]),y=b*px+d*py-(b*m[4]+d*m[5]);const layer=layers.find(item=>item.id===id),cw=layer?.contentWidth??width,ch=layer?.contentHeight??height
 return {x:x/cw*100,y:y/ch*100}
}
