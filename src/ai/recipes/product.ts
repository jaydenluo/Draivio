import { editorReducer,type EditorState,type Layer } from '../../state/editor'
import { contentRevision } from '../context/editorContext'
import { effectiveLayerState,layerParentId } from '../../state/layerHierarchy'
import { layerWorldPixelMatrix } from '../../canvas/layerWorldMatrix'
import { multiplyPoint } from '../../canvas/layerCoordinates'

export type ProductSettings={background:'solid'|'existing';color:string;backgroundLayerId:string;dx:number;dy:number;shadowX:number;shadowY:number;shadowWidth:number;shadowHeight:number;shadowBlur:number;shadowOpacity:number}
export type ProductRecord={version:1;role:'product'|'shadow'|'background';sourceLayerId:string;settings:ProductSettings}
export type ProductCandidate={documentId:string;base:string;sourceLayerId:string;state:EditorState}
export const defaultProductSettings=():ProductSettings=>({background:'solid',color:'#f0ebe4',backgroundLayerId:'',dx:0,dy:0,shadowX:0,shadowY:0,shadowWidth:1,shadowHeight:.08,shadowBlur:8,shadowOpacity:28})
export function validateProductSettings(s:ProductSettings){
 if(!s||Object.keys(s).some(k=>!Object.keys(defaultProductSettings()).includes(k))||!['solid','existing'].includes(s.background)||!/^#[0-9a-f]{6}$/i.test(s.color)||typeof s.backgroundLayerId!=='string')throw new Error('产品背景参数无效')
 for(const [key,lo,hi] of [['dx',-16384,16384],['dy',-16384,16384],['shadowX',-2048,2048],['shadowY',-2048,2048],['shadowWidth',.1,3],['shadowHeight',.01,.5],['shadowBlur',0,128],['shadowOpacity',0,100]] as const)if(!Number.isFinite(s[key])||s[key]<lo||s[key]>hi)throw new Error(`产品参数 ${key} 超出范围`)
}
export function validateProductRecord(value:unknown){const r=value as ProductRecord;if(!r||r.version!==1||!['product','shadow','background'].includes(r.role)||typeof r.sourceLayerId!=='string'||!r.sourceLayerId||Object.keys(r).some(k=>!['version','role','sourceLayerId','settings'].includes(k)))throw new Error('产品配方记录无效');validateProductSettings(r.settings)}
const svgSource=(svg:string)=>`data:image/svg+xml;base64,${btoa(svg)}`
function target(state:EditorState,id:string){
 const layer=state.layers.find(l=>l.id===id),effective=effectiveLayerState(state.layers,id)
 if(!layer||!effective.visible||effective.locked)throw new Error('商品目标不存在、隐藏或已锁定')
 if(layerParentId(state.layers,id)||layer.children||layer.smartObject||layer.warpRecipe||layer.clipBaseId||layer.documentSpace||['text','shape','group','adjustment','mask'].includes(layer.kind??'')||!layer.source||layer.source==='fixture')throw new Error('请选择顶层普通商品图片；嵌套或特殊图层请先创建普通图片副本')
 if(state.canvasTexts.some(t=>t.layerId===id)||state.canvasShapes.some(t=>t.layerId===id)||state.brushStrokes.some(t=>t.layerId===id))throw new Error('商品含独立绘制对象，请先合成普通图片副本；不会删除或重绘文字')
 const mask=state.layerMasks[id]
 if(!mask?.applied||!mask.selection||mask.inverted)throw new Error('请先接受商品主体图层蒙版（不反相），或手工精修蒙版；不会自动猜测商品')
 return {layer,mask}
}
export function createProductCandidate(state:EditorState,documentId:string,input:ProductSettings):ProductCandidate{
 if(state.colorModel==='cmyk')throw new Error('产品配方需要RGB工作副本，CMYK原稿保留')
 validateProductSettings(input);const settings=structuredClone(input),{layer,mask}=target(state,state.selectedLayerId)
 const {documentWidth:w,documentHeight:h}=state
 const active=state.artboards.find(b=>b.id===state.activeArtboardId)
 if(state.artboards.length>1&&!active?.layerIds.includes(layer.id))throw new Error('商品不属于当前画板')
 const matrix=layerWorldPixelMatrix(state.layers,layer.id,w,h),cw=layer.contentWidth??w,ch=layer.contentHeight??h,r=mask.selection!.rect
 if(!(r.width>0&&r.height>0))throw new Error('商品蒙版为空')
 const points=[[r.x,r.y],[r.x+r.width,r.y],[r.x,r.y+r.height],[r.x+r.width,r.y+r.height]].map(([x,y])=>multiplyPoint(matrix,{x:x/100*cw,y:y/100*ch}))
 const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),bottom=Math.max(...points.map(p=>p.y))
 const centerX=(minX+maxX)/2+settings.dx+settings.shadowX,centerY=bottom+settings.dy+settings.shadowY,radius=Math.max(1,(maxX-minX)*settings.shadowWidth/2)
 const prefix=`product-${crypto.randomUUID()}`,productId=`${prefix}-subject`,shadowId=`${prefix}-shadow`,backgroundId=`${prefix}-background`
 const record=(role:ProductRecord['role']):ProductRecord=>({version:1,role,sourceLayerId:layer.id,settings})
 let product:Layer={...structuredClone(layer),id:productId,name:'商品保护层 · 原始像素',visible:true,locked:false,productRecipe:record('product')}
 if(settings.dx||settings.dy){const t=layer.transform??{kind:'transform' as const,rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false};product={...product,transform:t.affine?{...t,affine:[t.affine[0],t.affine[1],t.affine[2],t.affine[3],t.affine[4]+settings.dx/w*100,t.affine[5]+settings.dy/h*100]}:{...t,rect:{...t.rect,x:t.rect.x+settings.dx/w*100,y:t.rect.y+settings.dy/h*100}}}}
 const shadow:Layer={id:shadowId,name:'商品接触投影 · 独立可调',className:'layer-art',visible:true,opacity:settings.shadowOpacity,blendMode:'正常',documentSpace:true,contentWidth:w,contentHeight:h,productRecipe:record('shadow'),source:svgSource(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><filter id="blur" x="-100%" y="-300%" width="300%" height="700%" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${settings.shadowBlur}"/></filter></defs><ellipse cx="${centerX}" cy="${centerY}" rx="${radius}" ry="${Math.max(1,radius*settings.shadowHeight)}" fill="#000000" filter="url(#blur)"/></svg>`)}
 let background:Layer
 if(settings.background==='existing'){
  const chosen=state.layers.find(l=>l.id===settings.backgroundLayerId)
  if(!chosen?.source||chosen.id===layer.id||chosen.smartObject||layerParentId(state.layers,chosen.id)||chosen.children||chosen.clipBaseId||state.canvasTexts.some(t=>t.layerId===chosen.id)||state.canvasShapes.some(t=>t.layerId===chosen.id)||state.brushStrokes.some(t=>t.layerId===chosen.id))throw new Error('请选择另一顶层普通图片作为背景；先通过现有生成入口生成并采用也可')
  background={...structuredClone(chosen),id:backgroundId,name:'商品背景 · 已有图片',visible:true,locked:false,productRecipe:record('background')}
 }else background={id:backgroundId,name:'商品背景 · 纯色',className:'layer-art',visible:true,opacity:100,blendMode:'正常',documentSpace:true,contentWidth:w,contentHeight:h,productRecipe:record('background'),source:svgSource(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="${settings.color}"/></svg>`)}
 const layerMasks={...state.layerMasks,[productId]:structuredClone(mask)}
 if(settings.background==='existing'&&state.layerMasks[settings.backgroundLayerId])layerMasks[backgroundId]=structuredClone(state.layerMasks[settings.backgroundLayerId])
 const layers=[product,shadow,background,...state.layers.map(l=>l.id===layer.id?{...l,visible:false}:l)]
 const added=[productId,shadowId,backgroundId]
 const artboards=state.artboards.map(b=>b.id===state.activeArtboardId?{...b,layerIds:[...added,...b.layerIds]}:b)
 return {documentId,base:contentRevision(state),sourceLayerId:layer.id,state:{...state,layers,layerMasks,artboards,selectedLayerId:productId,selectedLayerIds:[productId]}}
}
export function productCanCommit(c:ProductCandidate,state:EditorState,documentId:string){return c.documentId===documentId&&c.base===contentRevision(state)&&state.selectedLayerId===c.sourceLayerId}
export function adoptProductCandidate(c:ProductCandidate,state:EditorState,documentId:string){if(!productCanCommit(c,state,documentId))throw new Error('产品预览已过期，请重新预览');target(state,c.sourceLayerId);return editorReducer(state,{type:'apply-edit-plan',document:c.state})}
