export type CommonKind='motion'|'radial'|'pixelate'|'grain'|'vignette'
export type CommonParameters={kind:CommonKind;radius:number;amount:number;angle?:number;size?:number;seed?:number}
export type WorkOptions={signal?:AbortSignal;yield?:()=>Promise<void>}
export const checkFilterAbort=(signal?:AbortSignal)=>{if(signal?.aborted)throw new Error('智能滤镜渲染已取消')}
/** Bilinear sampling in premultiplied RGBA; outside image is transparent. */
function sample(p:Uint8ClampedArray,w:number,h:number,x:number,y:number){const result=[0,0,0,0],ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy;for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){const sx=ix+dx,sy=iy+dy;if(sx<0||sy<0||sx>=w||sy>=h)continue;const weight=(dx?fx:1-fx)*(dy?fy:1-fy),i=(sy*w+sx)*4,a=p[i+3]/255;for(let c=0;c<3;c++)result[c]+=p[i+c]*a*weight;result[3]+=p[i+3]*weight}return result}
function unpremultiply(out:Uint8ClampedArray,i:number,v:number[]){out[i+3]=v[3];for(let c=0;c<3;c++)out[i+c]=v[3]>0?v[c]*255/v[3]:0}
function random(seed:number,index:number){let v=(seed^Math.imul(index+1,0x9e3779b1))>>>0;v=Math.imul(v^(v>>>16),0x85ebca6b);v=Math.imul(v^(v>>>13),0xc2b2ae35);return ((v^(v>>>16))>>>0)/4294967296}
export async function applyCommonFilter(p:Uint8ClampedArray,w:number,h:number,f:CommonParameters,options:WorkOptions={}):Promise<Uint8ClampedArray>{
 const out=p.slice(),radius=f.radius,amount=f.amount,cx=(w-1)/2,cy=(h-1)/2,steps=Math.max(1,Math.ceil(radius)*2+1),blocks=new Map<number,number[]>()
 for(let y=0;y<h;y++){checkFilterAbort(options.signal);if(y%16===0){await(options.yield?.()??new Promise<void>(resolve=>setTimeout(resolve,0)));checkFilterAbort(options.signal)}
 for(let x=0;x<w;x++){const i=(y*w+x)*4
  if(f.kind==='grain'){if(p[i+3]===0)continue;const n=(random(f.seed??0,y*w+x)-.5)*amount*255;for(let c=0;c<3;c++)out[i+c]=p[i+c]+n;continue}
  if(f.kind==='vignette'){const d=Math.min(1,Math.hypot((x-cx)/Math.max(1,w/2),(y-cy)/Math.max(1,h/2))/Math.SQRT2),factor=Math.max(0,1-amount*d*d);for(let c=0;c<3;c++)out[i+c]=p[i+c]*factor;continue}
  if(f.kind==='pixelate'){const size=Math.max(1,Math.round(f.size??radius)),x0=Math.floor(x/size)*size,y0=Math.floor(y/size)*size,key=y0*w+x0,cached=blocks.get(key);if(cached){unpremultiply(out,i,cached);continue}const v=[0,0,0,0];let count=0;for(let yy=y0;yy<Math.min(h,y0+size);yy++)for(let xx=x0;xx<Math.min(w,x0+size);xx++){const j=(yy*w+xx)*4,a=p[j+3]/255;for(let c=0;c<3;c++)v[c]+=p[j+c]*a;v[3]+=p[j+3];count++}for(let c=0;c<4;c++)v[c]/=count;blocks.set(key,v);unpremultiply(out,i,v);continue}
  const value=[0,0,0,0],a=(f.angle??0)*Math.PI/180
  for(let s=0;s<steps;s++){const t=steps===1?0:(s/(steps-1)-.5)*2;const sx=f.kind==='motion'?x+Math.cos(a)*radius*t:cx+(x-cx)*(1-t*radius/100),sy=f.kind==='motion'?y+Math.sin(a)*radius*t:cy+(y-cy)*(1-t*radius/100);const v=sample(p,w,h,sx,sy);for(let c=0;c<4;c++)value[c]+=v[c]/steps}unpremultiply(out,i,value)
 }}checkFilterAbort(options.signal);return out
}
