import type { PixelImage } from '../canvas/rasterTools'
import type { SelectionPoint, SelectionRect } from '../canvas/selectionGeometry'

export type SampleScope = 'current' | 'below' | 'visible'
export type RetouchOptions = { size: number; hardness?: number; opacity?: number; aligned?: boolean }
function valid(image: PixelImage) { if (!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.data.length!==image.width*image.height*4) throw new Error('图像尺寸或像素数据无效') }
function point(image: PixelImage,p:SelectionPoint){if(![p.x,p.y].every(Number.isFinite)||p.x<0||p.x>100||p.y<0||p.y>100)throw new Error('坐标必须位于画板的 0–100% 范围内');return {x:Math.min(image.width-1,Math.round(p.x/100*(image.width-1))),y:Math.min(image.height-1,Math.round(p.y/100*(image.height-1)))} }
function idx(image:PixelImage,x:number,y:number){return x<0||y<0||x>=image.width||y>=image.height?-1:(y*image.width+x)*4}
function offsets(size:number){if(!Number.isFinite(size)||size<=0||size>2048)throw new Error('笔刷直径必须大于 0，且不超过 2048 像素');const r=Math.max(1,Math.round(size/2));const a:{x:number;y:number}[]=[];for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++)if(x*x+y*y<=r*r)a.push({x,y});return a}
/** Heals a stroke by sampling a surrounding annulus and blending luminance/chroma into the target. */
export function healPixels(image:PixelImage, points:SelectionPoint[], options:RetouchOptions & { signal?: AbortSignal }):PixelImage { valid(image); if (options.signal?.aborted) throw new DOMException('操作已取消', 'AbortError');if(!points.length)throw new Error('修复笔触不能为空');const d=points.map(p=>point(image,p)), os=offsets(options.size), opacity=Math.max(0,Math.min(1,(options.opacity??100)/100));const out={width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)};for(const p of d){let sums=[0,0,0,0],n=0;const ring=Math.max(2,Math.round(options.size));for(let y=-ring;y<=ring;y++)for(let x=-ring;x<=ring;x++){const dist=Math.hypot(x,y);if(dist<ring*.75||dist>ring*1.25)continue;const i=idx(image,p.x+x,p.y+y);if(i<0)continue;for(let c=0;c<4;c++)sums[c]+=image.data[i+c];n++}if(!n)continue;const avg=sums.map(v=>v/n);for(const o of os){const i=idx(image,p.x+o.x,p.y+o.y);if(i<0)continue;const edge=Math.max(0,1-Math.hypot(o.x,o.y)/(options.size/2));const a=opacity*edge;for(let c=0;c<4;c++)out.data[i+c]=Math.round(out.data[i+c]*(1-a)+avg[c]*a)}}return out}
/** Patch clone from a source rectangle into a destination rectangle with feathered edge. */
export function patchPixels(image:PixelImage, source:SelectionRect, destination:SelectionRect, feather=0, signal?: AbortSignal):PixelImage { valid(image); if (signal?.aborted) throw new DOMException('操作已取消', 'AbortError');for(const r of [source,destination])if(![r.x,r.y,r.width,r.height].every(Number.isFinite)||r.width<=0||r.height<=0)throw new Error('修补范围无效');const out={width:image.width,height:image.height,data:new Uint8ClampedArray(image.data)};const w=Math.max(1,Math.round(destination.width/100*image.width)),h=Math.max(1,Math.round(destination.height/100*image.height));const sx=source.x/100*image.width,sy=source.y/100*image.height,dx=destination.x/100*image.width,dy=destination.y/100*image.height;const f=Math.max(0,Math.min(100,feather))/100;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const tx=Math.round(dx+x),ty=Math.round(dy+y),u=x/Math.max(1,w-1),v=y/Math.max(1,h-1),ix=Math.round(sx+u*(source.width/100*image.width-1)),iy=Math.round(sy+v*(source.height/100*image.height-1)),ti=idx(image,tx,ty),si=idx(image,ix,iy);if(ti<0||si<0)continue;const edge=Math.min(u,1-u,v,1-v),a=f?Math.min(1,edge/f):1;for(let c=0;c<4;c++)out.data[ti+c]=Math.round(image.data[ti+c]*(1-a)+image.data[si+c]*a)}return out}
export function resolveSampleScope(layers:{id:string;visible:boolean;locked?:boolean}[],selectedId:string,scope:SampleScope){const i=layers.findIndex(x=>x.id===selectedId);if(i<0)throw new Error('当前图层不存在');if(scope==='current')return [selectedId];const candidates=layers.filter(x=>x.visible&&!x.locked);return scope==='below'?candidates.filter(x=>layers.indexOf(x)>=i).map(x=>x.id):candidates.map(x=>x.id)}

/** A repair layer paints only changed pixels; unchanged sampled content stays transparent. */
export function repairDeltaPixels(before: PixelImage, after: PixelImage): PixelImage {
  valid(before); valid(after)
  if (before.width !== after.width || before.height !== after.height) throw new Error('修复结果尺寸与采样图不一致')
  const data = new Uint8ClampedArray(after.data)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === before.data[i] && data[i + 1] === before.data[i + 1] && data[i + 2] === before.data[i + 2] && data[i + 3] === before.data[i + 3]) data.fill(0, i, i + 4)
  }
  return { width: after.width, height: after.height, data }
}

/** Binary coverage in document pixels, including changes to transparent pixels. */
export function repairCoveragePath(before: PixelImage, after: PixelImage): string {
  valid(before); valid(after)
  if (before.width !== after.width || before.height !== after.height) throw new Error('修复结果尺寸与采样图不一致')
  const parts: string[] = []
  for (let y = 0; y < before.height; y++) {
    let start = -1
    for (let x = 0; x <= before.width; x++) {
      const i = (y * before.width + x) * 4
      const changed = x < before.width && (before.data[i] !== after.data[i] || before.data[i + 1] !== after.data[i + 1] || before.data[i + 2] !== after.data[i + 2] || before.data[i + 3] !== after.data[i + 3])
      if (changed && start < 0) start = x
      if (!changed && start >= 0) { parts.push(`M${start} ${y}h${x - start}v1H${start}Z`); start = -1 }
    }
  }
  return parts.join('')
}
