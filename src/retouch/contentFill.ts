import type { PixelImage } from '../canvas/rasterTools'
export type FillMetadata = { method: 'local-context-patch-v1'; targetPixels: number; donorPixels: number; protectedPixels: number; changedPixels: number; elapsedMs: number }
export type FillOptions = { target: Uint8Array; donors?: Uint8Array; protect?: Uint8Array; signal?: AbortSignal; timeoutMs?: number; maxTargetPixels?: number; onProgress?: (value:number)=>void }
/** Percentage brush points, continuously rasterized in document pixels. */
export function brushMask(width:number,height:number,points:{x:number;y:number}[],size:number):Uint8Array {
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>4_194_304||!Number.isFinite(size)||size<=0||points.some(p=>![p.x,p.y].every(Number.isFinite)))throw new Error('移除笔刷范围无效')
 const mask=new Uint8Array(width*height),r=Math.max(.5,size/2)
 const dot=(x:number,y:number)=>{for(let yy=Math.max(0,Math.floor(y-r));yy<Math.min(height,Math.ceil(y+r));yy++)for(let xx=Math.max(0,Math.floor(x-r));xx<Math.min(width,Math.ceil(x+r));xx++)if((xx+.5-x)**2+(yy+.5-y)**2<=r*r)mask[yy*width+xx]=255}
 for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[i],ax=a.x/100*width,ay=a.y/100*height,bx=b.x/100*width,by=b.y/100*height,n=Math.max(1,Math.ceil(Math.hypot(bx-ax,by-ay)/Math.max(1,r/2)));for(let j=0;j<=n;j++)dot(ax+(bx-ax)*j/n,ay+(by-ay)*j/n)}return mask
}
/** Bounded exemplar inpainting: fill boundary first, matching known 5×5 context to
 * immutable allowed donor patches. Synthesized pixels never become donors. */
export async function contentFill(image:PixelImage,options:FillOptions):Promise<{image:PixelImage;metadata:FillMetadata}> {
 const {width:w,height:h,data}=image,n=w*h,start=performance.now(),deadline=start+(options.timeoutMs??10_000)
 const check=()=>{if(options.signal?.aborted)throw new DOMException('补洞已取消','AbortError');if(performance.now()>=deadline)throw new Error('本地补洞超时，请缩小选区')}
 check()
 if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||n>4_194_304||data.length!==n*4)throw new Error('图像过大或像素数据无效（最多 4194304 像素）')
 for(const m of [options.target,options.donors,options.protect])if(m&&(!(m instanceof Uint8Array)||m.length!==n))throw new Error('补洞覆盖范围与图像不符')
 const target=new Uint8Array(n),known=new Uint8Array(n),donors:number[]=[];let protectedPixels=0,count=0
 for(let i=0;i<n;i++){if(i%16384===0){await new Promise<void>(resolve=>setTimeout(resolve,0));check()}if(options.protect?.[i])protectedPixels++;target[i]=options.target[i]&&!options.protect?.[i]?1:0;count+=target[i];known[i]=target[i]?0:1;if(!options.target[i]&&!options.protect?.[i]&&(!options.donors||options.donors[i])&&data[i*4+3]>0)donors.push(i)}
 if(!count)throw new Error('待填区域为空或全部受保护')
 if(count>(options.maxTargetPixels??16384)||count>n*.75)throw new Error('待填区域过大，请缩小选区（最多 16384 像素且不超过图像 75%）')
 check()
 if(!donors.length)throw new Error('没有有效采样像素，请调整采样或保护区域')
 // Evenly distributed candidate budget. All candidates remain inside the donor mask.
 const candidates=donors.length<=768?donors:Array.from({length:768},(_,i)=>donors[Math.floor(i*donors.length/768)])
 const out=data.slice(),pending=new Set<number>();for(let i=0;i<n;i++)if(target[i])pending.add(i)
 const offsets:{dx:number;dy:number}[]=[];for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)if(dx||dy)offsets.push({dx,dy})
 let operations=0,done=0;const maxOperations=40_000_000
 // Maintain a bounded frontier: each pixel's known-neighbor count changes only
 // when one of its 24 neighbors is filled. Avoid repeatedly scanning the hole.
 const counts=new Uint8Array(n),buckets=Array.from({length:25},()=>new Set<number>())
 for(const p of pending){const x=p%w,y=Math.floor(p/w);let k=0;for(const {dx,dy}of offsets){const xx=x+dx,yy=y+dy;if(xx>=0&&yy>=0&&xx<w&&yy<h&&known[yy*w+xx]&&!options.protect?.[yy*w+xx])k++;operations++}counts[p]=k;buckets[k].add(p);if(operations%98304===0){await new Promise<void>(resolve=>setTimeout(resolve,0));check()}}
 while(pending.size){check();let mostKnown=24;while(mostKnown>0&&!buckets[mostKnown].size)mostKnown--
  const bestTarget=buckets[mostKnown].values().next().value??-1
  if(mostKnown<=0)throw new Error('保护区域隔断了补洞边界，无法匹配有效采样')
  const px=bestTarget%w,py=Math.floor(bestTarget/w);let best=-1,score=Infinity
  for(const q of candidates){const qx=q%w,qy=Math.floor(q/w);let sum=0,k=0
   for(const {dx,dy} of offsets){if(++operations>maxOperations)throw new Error('补洞计算预算已达上限，请缩小待填区域');const tx=px+dx,ty=py+dy,sx=qx+dx,sy=qy+dy;if(tx<0||ty<0||tx>=w||ty>=h||!known[ty*w+tx]||options.protect?.[ty*w+tx])continue
    if(sx<0||sy<0||sx>=w||sy>=h||options.target[sy*w+sx]||options.protect?.[sy*w+sx]||(options.donors&&!options.donors[sy*w+sx])||data[(sy*w+sx)*4+3]===0)continue
    const a=(ty*w+tx)*4,b=(sy*w+sx)*4;for(let c=0;c<4;c++)sum+=(out[a+c]-data[b+c])**2;k++
   }
   // A single manually allowed donor remains useful even without a full patch.
   const distance=(qx-px)**2+(qy-py)**2;const value=k?sum/k+distance*.001:1e7+distance
   if(value<score){score=value;best=q}
  }
  if(best<0)throw new Error('没有可匹配的有效采样')
  const i=bestTarget*4,j=best*4,a=options.target[bestTarget]/255;for(let c=0;c<4;c++)out[i+c]=Math.round(data[i+c]*(1-a)+data[j+c]*a)
  pending.delete(bestTarget);buckets[mostKnown].delete(bestTarget);known[bestTarget]=1;done++
  for(const {dx,dy}of offsets){const x=px+dx,y=py+dy;if(x<0||y<0||x>=w||y>=h)continue;const p=y*w+x;if(pending.has(p)){buckets[counts[p]].delete(p);counts[p]++;buckets[counts[p]].add(p)}operations++}
  if(operations>maxOperations)throw new Error('补洞计算预算已达上限，请缩小待填区域')
  if(done%16===0){options.onProgress?.(done/count);await new Promise<void>(resolve=>setTimeout(resolve,0));check()}
 }
 let changedPixels=0;for(let i=0;i<n;i++)if(target[i]&&[0,1,2,3].some(c=>out[i*4+c]!==data[i*4+c]))changedPixels++
 if(!changedPixels)throw new Error('补洞未产生像素变化，原图保持不变')
 options.onProgress?.(1)
 return {image:{width:w,height:h,data:out},metadata:{method:'local-context-patch-v1',targetPixels:count,donorPixels:donors.length,protectedPixels,changedPixels,elapsedMs:performance.now()-start}}
}
