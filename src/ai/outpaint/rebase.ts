import type {EditorState,Layer} from '../../state/editor'
import {layerParentId} from '../../state/layerHierarchy'
import {layerMatrix,multiplyMatrices,invertMatrix,type AffineMatrix} from '../../canvas/layerCoordinates'
import {layerWorldPixelMatrix} from '../../canvas/layerWorldMatrix'
import type {Expansion} from './geometry'
/** Keep every original physical local transform; expand only the root document basis.
 * Document-space rasters previously cancel their complete transform chain. Normalize
 * that exact effective local matrix into an ordinary affine layer so editor tools
 * and rendering share one coordinate model after expansion.
 */
export function rebaseOutpaintLayers(state:EditorState,e:Expansion):Layer[]{
 const w=state.documentWidth,h=state.documentHeight
 return state.layers.map(layer=>{
  const cw=layer.contentWidth??w,ch=layer.contentHeight??h
  const m=layer.transform?layerMatrix(layer.transform,w,h):[1,0,0,1,0,0] as AffineMatrix
  let physical:AffineMatrix=layer.documentSpace?invertMatrix(layerWorldPixelMatrix(state.layers,layer.id,w,h)):[m[0]*w/cw,m[1]*h/cw,m[2]*w/ch,m[3]*h/ch,m[4]*w/100,m[5]*h/100]
  if(!layerParentId(state.layers,layer.id))physical=multiplyMatrices([1,0,0,1,e.x,e.y],physical)
  const [a,b,c,d,x,y]=physical
  return {...layer,sourceInterpolation:layer.documentSpace?'nearest':layer.sourceInterpolation,documentSpace:false,contentWidth:cw,contentHeight:ch,transform:{kind:'transform',rect:{x:0,y:0,width:cw/e.width*100,height:ch/e.height*100},rotation:0,flipX:false,flipY:false,affine:[a,b*e.width/e.height,c*e.height/e.width,d,x/e.width*100,y/e.height*100]}}
 })
}
