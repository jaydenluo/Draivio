export const DETAIL_FIXTURE_SEED=0x5a17d00d
export function detailFixture(width=64,height=32){
 const clean=new Uint8ClampedArray(width*height*4),noisy=clean.slice();let seed=DETAIL_FIXTURE_SEED
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296}
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4,base=x<width/2?80:175,texture=Math.sin(x*1.6)*3+Math.sin(y*.8)*2;for(let c=0;c<3;c++){clean[i+c]=base+texture+[8,0,-5][c];noisy[i+c]=clean[i+c]+(random()-.5)*40}clean[i+3]=noisy[i+3]=255}
 return {clean,noisy,width,height}
}
export function psnr(reference:Uint8ClampedArray,actual:Uint8ClampedArray){let error=0,count=0;for(let i=0;i<reference.length;i++)if(i%4!==3){error+=(reference[i]-actual[i])**2;count++}return error===0?Infinity:10*Math.log10(255**2/(error/count))}
export function edgeContrast(p:Uint8ClampedArray,w:number,h:number){let total=0;for(let y=0;y<h;y++)for(let c=0;c<3;c++)total+=p[(y*w+w/2)*4+c]-p[(y*w+w/2-1)*4+c];return total/(h*3)}
