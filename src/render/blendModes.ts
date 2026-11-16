/** W3C Compositing and Blending Level 1, in sRGB. Byte inputs/outputs are straight alpha. */
export const BLEND_MODES = [
 {id:'normal',label:'正常',category:'正常'},
 {id:'darken',label:'变暗',category:'变暗'}, {id:'multiply',label:'正片叠底',category:'变暗'}, {id:'color-burn',label:'颜色加深',category:'变暗'},
 {id:'lighten',label:'变亮',category:'变亮'}, {id:'screen',label:'滤色',category:'变亮'}, {id:'color-dodge',label:'颜色减淡',category:'变亮'},
 {id:'overlay',label:'叠加',category:'对比'}, {id:'soft-light',label:'柔光',category:'对比'}, {id:'hard-light',label:'强光',category:'对比'},
 {id:'difference',label:'差值',category:'比较'}, {id:'exclusion',label:'排除',category:'比较'},
 {id:'hue',label:'色相',category:'颜色'}, {id:'saturation',label:'饱和度',category:'颜色'}, {id:'color',label:'颜色',category:'颜色'}, {id:'luminosity',label:'明度',category:'颜色'},
] as const
export type BlendMode = typeof BLEND_MODES[number]['id']
export function resolveBlendMode(value: string): BlendMode {
 const mode=BLEND_MODES.find(m=>m.id===value||m.label===value)
 if(!mode) throw new Error(`不支持的混合模式：${value}`)
 return mode.id
}
type RGB=[number,number,number]
const lum=(c:RGB)=>.3*c[0]+.59*c[1]+.11*c[2]
const sat=(c:RGB)=>Math.max(...c)-Math.min(...c)
function setLum(c:RGB,l:number):RGB {
 const d=l-lum(c),r=c.map(v=>v+d) as RGB,L=lum(r),n=Math.min(...r),x=Math.max(...r)
 if(n<0) for(let i=0;i<3;i++) r[i]=L+(r[i]-L)*L/(L-n)
 if(x>1) for(let i=0;i<3;i++) r[i]=L+(r[i]-L)*(1-L)/(x-L)
 return r
}
function setSat(c:RGB,s:number):RGB {
 const order=[0,1,2].sort((a,b)=>c[a]-c[b]),[lo,mid,hi]=order,r:RGB=[0,0,0]
 if(c[hi]>c[lo]) {r[mid]=(c[mid]-c[lo])*s/(c[hi]-c[lo]);r[hi]=s}
 return r
}
export function blendColor(base:RGB,source:RGB,mode:BlendMode):RGB {
 if(mode==='hue') return setLum(setSat(source,sat(base)),lum(base))
 if(mode==='saturation') return setLum(setSat(base,sat(source)),lum(base))
 if(mode==='color') return setLum(source,lum(base))
 if(mode==='luminosity') return setLum(base,lum(source))
 return base.map((b,i)=>{
  const s=source[i]
  switch(mode){
   case 'multiply':return b*s
   case 'screen':return b+s-b*s
   case 'overlay':return b<=.5?2*b*s:1-2*(1-b)*(1-s)
   case 'hard-light':return s<=.5?2*b*s:1-2*(1-b)*(1-s)
   case 'soft-light':{const d=b<=.25?((16*b-12)*b+4)*b:Math.sqrt(b);return s<=.5?b-(1-2*s)*b*(1-b):b+(2*s-1)*(d-b)}
   case 'darken':return Math.min(b,s)
   case 'lighten':return Math.max(b,s)
   case 'color-dodge':return b===0?0:s===1?1:Math.min(1,b/(1-s))
   case 'color-burn':return b===1?1:s===0?0:1-Math.min(1,(1-b)/s)
   case 'difference':return Math.abs(b-s)
   case 'exclusion':return b+s-2*b*s
   default:return s
  }
 }) as RGB
}
export function blendPixel(base:readonly number[],source:readonly number[],value:string,opacity=1,mask=1):[number,number,number,number] {
 const mode=resolveBlendMode(value),ab=base[3]/255,as=source[3]/255*opacity*mask,ao=as+ab*(1-as)
 if(!ao)return [0,0,0,0]
 const cb=base.slice(0,3).map(c=>c/255) as RGB,cs=source.slice(0,3).map(c=>c/255) as RGB,b=blendColor(cb,cs,mode)
 const rgb=cb.map((c,i)=>Math.round(255*((1-as)*ab*c+as*(1-ab)*cs[i]+as*ab*b[i])/ao))
 return [rgb[0],rgb[1],rgb[2],Math.round(ao*255)]
}
