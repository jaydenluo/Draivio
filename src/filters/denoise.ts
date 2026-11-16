import { checkFilterAbort,type WorkOptions } from './common'
import { detailYield,validateDetailPixels,type DetailParameters } from './sharpen'
/** Two separable joint-bilateral passes, guided by original RGB. Range threshold is sigma in byte levels.
 * Alpha weights normalize each pass; output alpha and hidden RGB are retained exactly. */
export async function applyDenoise(p:Uint8ClampedArray,w:number,h:number,f:DetailParameters,options:WorkOptions={}):Promise<Uint8ClampedArray>{
 validateDetailPixels(p,w,h,f,8,1);if(f.threshold>100)throw new Error('降噪阈值最多 100 色阶');checkFilterAbort(options.signal)
 const out=p.slice();if(!f.radius||!f.amount||!f.threshold)return out
 const reach=Math.ceil(f.radius),sigma=Math.max(.1,f.radius/2),spatial=Array.from({length:reach*2+1},(_,i)=>Math.exp(-((i-reach)**2)/(2*sigma*sigma)))
 let current=Float64Array.from(p)
 for(const axis of [0,1]){const next=current.slice();for(let y=0;y<h;y++){await detailYield(y,options);for(let x=0;x<w;x++){const i=(y*w+x)*4;if(!p[i+3])continue;const sum=[0,0,0];let total=0;for(let d=-reach;d<=reach;d++){const xx=x+(axis===0?d:0),yy=y+(axis===1?d:0);if(xx<0||xx>=w||yy<0||yy>=h)continue;const j=(yy*w+xx)*4;if(!p[j+3])continue;let distance=0;for(let c=0;c<3;c++)distance+=(p[j+c]-p[i+c])**2;const weight=spatial[d+reach]*Math.exp(-distance/(6*f.threshold*f.threshold))*p[j+3]/255;for(let c=0;c<3;c++)sum[c]+=current[j+c]*weight;total+=weight}if(total>0)for(let c=0;c<3;c++)next[i+c]=sum[c]/total}}current=next}
 for(let i=0;i<p.length;i+=4)if(p[i+3])for(let c=0;c<3;c++)out[i+c]=p[i+c]+f.amount*(current[i+c]-p[i+c])
 checkFilterAbort(options.signal);return out
}
