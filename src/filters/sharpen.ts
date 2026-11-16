import { checkFilterAbort,type WorkOptions } from './common'
export type DetailParameters={radius:number;amount:number;threshold:number}
export function validateDetailPixels(p:Uint8ClampedArray,w:number,h:number,f:DetailParameters,maxRadius:number,maxAmount:number){
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w*h>16_777_216||p.length!==w*h*4)throw new Error('细节滤镜像素尺寸无效或超过 1600 万像素')
 if(![f.radius,f.amount,f.threshold].every(Number.isFinite)||f.radius<0||f.radius>maxRadius||f.amount<0||f.amount>maxAmount||f.threshold<0||f.threshold>255)throw new Error('细节滤镜参数超出范围')
}
export async function detailYield(y:number,options:WorkOptions){checkFilterAbort(options.signal);if(y%16===0){await(options.yield?.()??new Promise<void>(resolve=>setTimeout(resolve,0)));checkFilterAbort(options.signal)}}
/** Alpha-weighted Gaussian: hidden transparent RGB never contributes to visible detail. */
async function gaussianRGB(p:Uint8ClampedArray,w:number,h:number,radius:number,options:WorkOptions){
 const reach=Math.ceil(radius*3),weights=Array.from({length:reach*2+1},(_,i)=>Math.exp(-((i-reach)**2)/(2*radius*radius)))
 const horizontal=new Float64Array(p.length),output=new Float64Array(p.length)
 for(let y=0;y<h;y++){await detailYield(y,options);for(let x=0;x<w;x++){const i=(y*w+x)*4;for(let d=-reach;d<=reach;d++){const xx=x+d;if(xx<0||xx>=w)continue;const j=(y*w+xx)*4,k=weights[d+reach],a=p[j+3]/255;for(let c=0;c<3;c++)horizontal[i+c]+=p[j+c]*a*k;horizontal[i+3]+=a*k}}}
 for(let y=0;y<h;y++){await detailYield(y,options);for(let x=0;x<w;x++){const i=(y*w+x)*4;for(let d=-reach;d<=reach;d++){const yy=y+d;if(yy<0||yy>=h)continue;const j=(yy*w+x)*4,k=weights[d+reach];for(let c=0;c<4;c++)output[i+c]+=horizontal[j+c]*k}if(output[i+3]>0)for(let c=0;c<3;c++)output[i+c]/=output[i+3]}}
 return output
}
/** Deterministic USM. Threshold is the maximum RGB residual in 8-bit levels, not an AI recovery confidence. */
export async function applyUnsharpMask(p:Uint8ClampedArray,w:number,h:number,f:DetailParameters,options:WorkOptions={}):Promise<Uint8ClampedArray>{
 validateDetailPixels(p,w,h,f,64,5);checkFilterAbort(options.signal);const out=p.slice();if(!f.radius||!f.amount)return out
 const low=await gaussianRGB(p,w,h,f.radius,options)
 for(let y=0;y<h;y++){await detailYield(y,options);for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!p[i+3])continue;const delta=[0,1,2].map(c=>p[i+c]-low[i+c]);if(Math.max(...delta.map(Math.abs))<f.threshold)continue;for(let c=0;c<3;c++)out[i+c]=p[i+c]+f.amount*delta[c]}}
 checkFilterAbort(options.signal);return out
}
