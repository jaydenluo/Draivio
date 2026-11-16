export type RulerTick = { value: number; screen: number; major: boolean }
const positive=(n:number)=>Number.isFinite(n)&&n>0
function niceStep(min:number):number {const power=10**Math.floor(Math.log10(min));return [1,2,5,10].map(x=>x*power).find(x=>x>=min)??power*10}
/** originPx is where document coordinate zero falls in the visible ruler. */
export function rulerTicks({zoomPercent,originPx,viewportPx,minMajorPx=50}: {zoomPercent:number;originPx:number;viewportPx:number;minMajorPx?:number}):RulerTick[]{
 if(!positive(zoomPercent)||!positive(viewportPx)||!positive(minMajorPx)||!Number.isFinite(originPx))throw new Error('标尺视口无效')
 const scale=zoomPercent/100,major=niceStep(Math.max(minMajorPx,viewportPx/200)*1/scale)
 const divisions=major*scale/5>=8?5:2,minor=major/divisions
 const first=Math.ceil(-originPx/scale/minor),last=Math.floor((viewportPx-originPx)/scale/minor)
 if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last))throw new Error('标尺范围无效')
 return Array.from({length:Math.max(0,last-first+1)},(_,i)=>{const n=first+i,value=n*minor;return {value:Object.is(value,-0)?0:value,screen:value*scale+originPx,major:n%divisions===0}})
}
/** Coarsening affects display only; snapping always uses the configured actual grid spacing. */
export function visibleGridLines({view,spacingX,spacingY,originX=0,originY=0,maxLines=1000}: {view:{x:number;y:number;width:number;height:number};spacingX:number;spacingY:number;originX?:number;originY?:number;maxLines?:number}):{x:number[];y:number[];stepX:number;stepY:number}{
 if(![view.x,view.y,originX,originY].every(Number.isFinite)||![view.width,view.height,spacingX,spacingY].every(positive)||!Number.isSafeInteger(maxLines)||maxLines<4||maxLines>10000)throw new Error('网格视口或间距无效')
 const perAxis=Math.floor(maxLines/2)
 const lines=(start:number,length:number,spacing:number,origin:number)=>{
  const stride=Math.max(1,Math.ceil(length/spacing/(perAxis-1))),step=spacing*stride
  const first=Math.ceil((start-origin)/step),last=Math.floor((start+length-origin)/step)
  if(!Number.isFinite(step)||!Number.isSafeInteger(first)||!Number.isSafeInteger(last))throw new Error('网格范围无效')
  return {positions:Array.from({length:Math.max(0,last-first+1)},(_,i)=>origin+(first+i)*step),step}
 }
 const x=lines(view.x,view.width,spacingX,originX),y=lines(view.y,view.height,spacingY,originY)
 return {x:x.positions,y:y.positions,stepX:x.step,stepY:y.step}
}
