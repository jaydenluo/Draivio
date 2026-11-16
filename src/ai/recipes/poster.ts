import type {CanvasTextObject} from '../../canvas/TextObject'
import {wrapParagraphLines,paragraphMeasurer} from '../../text/paragraphLayout'
import {dimensionError} from '../../document/documentGeometry'
export type PosterPreset={name:string;width:number;height:number;safeMargin:number}
export type PosterContent={title:string;body:string;fontFamily:string;fontAvailable?:boolean;logo?:{sourceLayerId:string;source:string;protected:boolean};image?:{sourceLayerId:string;source:string;protected:boolean}}
export type ProtectedSource={layerId:string;source:string;reason:'logo-protected'|'source-protected'}
export type PosterPlan={name:string;width:number;height:number;safeMargin:number;texts:CanvasTextObject[];protectedSources:ProtectedSource[];overflow:string[];missingFont:boolean;generatedTextPixels:false}
export function posterPresets():PosterPreset[]{return [{name:'竖版',width:1080,height:1350,safeMargin:72},{name:'方形',width:1080,height:1080,safeMargin:72},{name:'横版',width:1350,height:1080,safeMargin:72}]}
export function planPoster(content:PosterContent,preset:PosterPreset):PosterPlan{
 const sizeError=dimensionError(preset.width,preset.height);if(sizeError)throw new Error(sizeError)
 if(!Number.isFinite(preset.safeMargin)||preset.safeMargin<0||preset.safeMargin*2>=Math.min(preset.width,preset.height))throw new Error('安全边距超过画布')
 if(/[\p{Extended_Pictographic}\u200d]/u.test(content.title+content.body))throw new Error('海报文字含尚未验证导出字形的表情或组合符，请改用普通文字；原输入已保留')
 if(content.fontAvailable===false)throw new Error(`字体不可用：${content.fontFamily}`)
 const availableWidth=preset.width-preset.safeMargin*2, titleSize=Math.max(24,Math.min(96,Math.round(preset.width*.075))),bodySize=Math.max(16,Math.min(36,Math.round(preset.width*.026)))
 const titleLines=wrapParagraphLines(content.title,availableWidth,titleSize,0,{fontFamily:content.fontFamily,fontWeight:'700'}),bodyLines=wrapParagraphLines(content.body,availableWidth,bodySize,0,{fontFamily:content.fontFamily,fontWeight:'400'})
 const titleMeasure=paragraphMeasurer(titleSize,0,{fontFamily:content.fontFamily,fontWeight:'700'}),bodyMeasure=paragraphMeasurer(bodySize,0,{fontFamily:content.fontFamily,fontWeight:'400'})
 if(titleLines.some(line=>titleMeasure(line)>availableWidth)||bodyLines.some(line=>bodyMeasure(line)>availableWidth))throw new Error('字形宽度溢出安全区域，请增大画布宽度或减少安全边距')
 const titleHeight=titleLines.length*titleSize*1.2, bodyHeight=bodyLines.length*bodySize*1.5, imageHeight=Math.round(preset.height*.28), gap=Math.max(20,Math.round(preset.height*.025)),total=titleHeight+gap+imageHeight+gap+bodyHeight
 if(total>preset.height-preset.safeMargin*2)throw new Error(`文字或版式溢出安全区域（需要 ${Math.ceil(total)}px）`)
 const x=preset.safeMargin/ preset.width*100;let y=preset.safeMargin/preset.height*100
 const texts:CanvasTextObject[]=[],namespace=crypto.randomUUID()
 const add=(role:string,text:string,size:number,height:number)=>{const id=`poster-${namespace}-${role}`;const object:CanvasTextObject={id,layerId:`${id}-layer`,x,y,text,layout:'paragraph',width:availableWidth,height,fontFamily:content.fontFamily,fontSize:size,fontWeight:role==='title'?'700':'400',color:'#111111',align:'left',lineHeight:role==='title'?1.2:1.5,letterSpacing:0};texts.push(object);y+=(height+gap)/preset.height*100}
 add('title',content.title,titleSize,titleHeight);y+=imageHeight/preset.height*100;add('body',content.body,bodySize,bodyHeight)
 const protectedSources:ProtectedSource[]=[];if(content.logo?.protected)protectedSources.push({layerId:content.logo.sourceLayerId,source:content.logo.source,reason:'logo-protected'});if(content.image?.protected)protectedSources.push({layerId:content.image.sourceLayerId,source:content.image.source,reason:'source-protected'})
 return {name:preset.name,width:preset.width,height:preset.height,safeMargin:preset.safeMargin,texts,protectedSources,overflow:[],missingFont:false,generatedTextPixels:false}
}
