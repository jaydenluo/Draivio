import { normalizePreset, type AdjustmentPreset } from '../adjustments/presets'
/** Independent local batch pipeline. It never reads or dispatches editor state. */
export const MAX_BATCH_PIXELS = 8_000_000
export const MAX_BATCH_FILES = 1000
export type Watermark = { kind:'none'|'text'|'image'; text:string; image:string; position:'top-left'|'top-right'|'bottom-left'|'bottom-right'|'center'; opacity:number; scale:number; margin:number; color:string }
export type BatchRecipe = { version:1; mode:'long-edge'|'fixed'; longEdge:number; width:number; height:number; fit:'fit'|'fill'; format:'png'|'jpeg'|'webp'; quality:number; preset:'none'|'mono'|'warm'|'bright'; adjustmentPreset:AdjustmentPreset|null; watermark:Watermark }
export function defaultRecipe():BatchRecipe { return {version:1,mode:'long-edge',longEdge:1920,width:1080,height:1080,fit:'fit',format:'png',quality:0.9,preset:'none',adjustmentPreset:null,watermark:{kind:'none',text:'© 版权所有',image:'',position:'bottom-right',opacity:0.65,scale:0.2,margin:16,color:'#ffffff'}} }
export function normalizeRecipe(input:unknown):BatchRecipe {
  if(!input || typeof input!=='object')throw new Error('配方无效')
  const r=input as BatchRecipe,w=r.watermark
  const choice=(value:unknown,values:string[])=>typeof value==='string'&&values.includes(value)
  const number=(value:unknown,min:number,max:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max
  if(r.version!==1 || !choice(r.mode,['long-edge','fixed']) || !choice(r.fit,['fit','fill']) || !choice(r.format,['png','jpeg','webp']) || !choice(r.preset,['none','mono','warm','bright']) || ![r.longEdge,r.width,r.height].every(v=>number(v,1,8192)&&Number.isInteger(v)) || r.width*r.height>MAX_BATCH_PIXELS || !number(r.quality,0.01,1))throw new Error('配方尺寸、格式或质量无效（最多 8MP）')
  if(!w || !choice(w.kind,['none','text','image']) || !choice(w.position,['top-left','top-right','bottom-left','bottom-right','center']) || !number(w.opacity,0,1)||!number(w.scale,0.01,1)||!number(w.margin,0,1024)||typeof w.text!=='string'||w.text.length>200||!/^#[0-9a-f]{6}$/i.test(w.color)||typeof w.image!=='string'||w.image.length>2_800_000||(w.image&&!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(w.image))||(w.kind==='image'&&!w.image))throw new Error('水印无效（图片最多 2MB）')
  return {version:1,mode:r.mode,longEdge:r.longEdge,width:r.width,height:r.height,fit:r.fit,format:r.format,quality:r.quality,preset:r.preset,adjustmentPreset:r.adjustmentPreset?normalizePreset(r.adjustmentPreset):null,watermark:{kind:w.kind,text:w.text,image:w.image,position:w.position,opacity:w.opacity,scale:w.scale,margin:w.margin,color:w.color}}
}
export function resizeGeometry(iw:number,ih:number,r:BatchRecipe) {
  if(![iw,ih].every(v=>Number.isInteger(v)&&v>0)||iw*ih>MAX_BATCH_PIXELS)throw new Error('输入图片超过 8MP 或尺寸无效')
  const scale=r.longEdge/Math.max(iw,ih),width=r.mode==='long-edge'?Math.max(1,Math.round(iw*scale)):r.width,height=r.mode==='long-edge'?Math.max(1,Math.round(ih*scale)):r.height
  if(width*height>MAX_BATCH_PIXELS)throw new Error('输出超过 8MP')
  const fit=Math.min(width/iw,height/ih),fill=Math.max(width/iw,height/ih)
  return r.fit==='fill'&&r.mode==='fixed'?{width,height,sx:(iw-width/fill)/2,sy:(ih-height/fill)/2,sw:width/fill,sh:height/fill,dx:0,dy:0,dw:width,dh:height}:{width,height,sx:0,sy:0,sw:iw,sh:ih,dx:(width-iw*fit)/2,dy:(height-ih*fit)/2,dw:iw*fit,dh:ih*fit}
}
/** 170 UTF-8 bytes leaves room under native's 180-byte limit and for collision suffixes. */
export function outputName(name:string,format:BatchRecipe['format'],index:number) {
  const cleaned=name.split(/[\\/]/).pop()!.replace(/\.[^.]*$/,'').replace(/[<>:"|?*\x00-\x1f]/g,'_').replace(/^[. ]+|[. ]+$/g,'')||'image'
  const suffix=`-batch-${String(index+1).padStart(3,'0')}.${format==='jpeg'?'jpg':format}`
  const encoder=new TextEncoder(),budget=170-encoder.encode(suffix).length
  let stem='',bytes=0
  // Keep combining sequences and emoji families intact where Intl.Segmenter is available.
  const segments=typeof Intl.Segmenter==='function'?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(cleaned),s=>s.segment):Array.from(cleaned)
  for(const segment of segments){const size=encoder.encode(segment).length;if(bytes+size>budget)break;stem+=segment;bytes+=size}
  return `${stem||'image'}${suffix}`
}
export function watermarkRect(width:number,height:number,ww:number,wh:number,position:Watermark['position'],margin:number) {
  const m=Math.min(margin,width/3,height/3),scale=Math.min(1,(width-2*m)/ww,(height-2*m)/wh),w=ww*scale,h=wh*scale
  return {x:position==='center'?(width-w)/2:position.endsWith('right')?width-w-m:m,y:position==='center'?(height-h)/2:position.startsWith('bottom')?height-h-m:m,width:w,height:h}
}
export function applyBatchPreset(source:Uint8ClampedArray,preset:BatchRecipe['preset']) { const out=source.slice(); for(let i=0;i<out.length;i+=4) { if(preset==='mono'){const y=Math.round(out[i]*0.2126+out[i+1]*0.7152+out[i+2]*0.0722);out[i]=out[i+1]=out[i+2]=y}if(preset==='warm'){out[i]*=1.12;out[i+2]*=0.88}if(preset==='bright')for(let c=0;c<3;c++)out[i+c]*=1.15 }return out }
export type BatchInput={id:string;name:string;file?:File;token?:string}
export type BatchItem=BatchInput & {status:'pending'|'running'|'success'|'failed'|'cancelled';output?:string;error?:string;attempts:number;index:number}
export class BatchQueue {
  readonly items:BatchItem[];readonly concurrency:number;private cancelled=false;private running=false
  constructor(inputs:BatchInput[],concurrency=1){if(inputs.length>MAX_BATCH_FILES)throw new Error('每批最多 1000 个文件');this.items=inputs.map((i,index)=>({...i,index,status:'pending',attempts:0}));this.concurrency=Math.max(1,Math.min(2,Math.floor(concurrency)||1))}
  cancel(){this.cancelled=true}
  summary(){return {total:this.items.length,success:this.items.filter(i=>i.status==='success').length,failed:this.items.filter(i=>i.status==='failed').length,cancelled:this.items.filter(i=>i.status==='cancelled').length}}
  async run(work:(item:BatchItem)=>Promise<string>,retryFailed=false,update:()=>void=()=>{}) {if(this.running)throw new Error('任务正在运行');this.running=true;this.cancelled=false;const pending=this.items.filter(i=>retryFailed?i.status==='failed':i.status==='pending');let cursor=0
    try {await Promise.all(Array.from({length:this.concurrency},async()=>{while(!this.cancelled&&cursor<pending.length){const item=pending[cursor++];item.status='running';item.error=undefined;item.attempts++;update();try{item.output=await work(item);item.status='success'}catch(e){item.status='failed';item.error=e instanceof Error?e.message:'处理失败'}update()}}));for(const item of pending.slice(cursor))item.status='cancelled';update()}finally{this.running=false}
  }
}
