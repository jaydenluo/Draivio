import {describe,it,expect} from 'vitest'
import {createSelection} from '../../canvas/selectionGeometry'
import {solidImage} from '../../engine/raster/composite'
import {defaultPortraitSettings,processPortrait,type PortraitMasks} from './portrait'
const ellipse=(x:number,y:number,w:number,h:number)=>createSelection('ellipse',{x,y,width:w,height:h})
const masks=():PortraitMasks=>({confirmed:true,person:ellipse(0,0,75,100),skin:ellipse(5,10,50,75),eyes:ellipse(10,25,35,10),protect:ellipse(20,60,15,15)})
const photo=()=>{const p=solidImage(32,32,[140,100,80,255]);for(let i=0;i<1024;i++)for(let c=0;c<3;c++)p.data[i*4+c]+=i%3*8;return p}
describe('natural portrait pixel recipe',()=>{
 it('changes only explicitly confirmed person/skin/eye pixels while preserving source alpha and geometry',async()=>{
  const image=photo(),before=image.data.slice(),result=await processPortrait(image,masks(),{...defaultPortraitSettings(),skinTone:8,eyes:8})
  expect(result.image).toMatchObject({width:32,height:32});expect(image.data).toEqual(before)
  expect(result.image.data.some((v,i)=>v!==before[i])).toBe(true)
  for(let i=0;i<1024;i++){expect(result.image.data[i*4+3]).toBe(before[i*4+3]);if(i%32>=25)expect(result.image.data.slice(i*4,i*4+4)).toEqual(before.slice(i*4,i*4+4))}
  expect(result.generated).toBe(false);expect(result.geometryChanged).toBe(false)
 })
 it('rejects unconfirmed/rectangular feature masks and masks outside the chosen person',async()=>{
  await expect(processPortrait(photo(),{...masks(),confirmed:false},defaultPortraitSettings())).rejects.toThrow('确认')
  await expect(processPortrait(photo(),{...masks(),skin:createSelection('rectangle',{x:0,y:0,width:100,height:100})},defaultPortraitSettings())).rejects.toThrow('矩形')
  await expect(processPortrait(photo(),{...masks(),skin:ellipse(80,0,15,100)},defaultPortraitSettings())).rejects.toThrow('目标人物')
 })
 it('preserves every protected pixel exactly and no-op switches preserve all pixels',async()=>{
  const image=photo(),result=await processPortrait(image,masks(),{...defaultPortraitSettings(),skinTone:8})
  for(let y=20;y<23;y++)for(let x=8;x<10;x++)expect(result.image.data.slice((y*32+x)*4,(y*32+x)*4+4)).toEqual(image.data.slice((y*32+x)*4,(y*32+x)*4+4))
  expect((await processPortrait(image,masks(),{denoise:0,heal:0,skinTone:0,eyes:0,blemishes:[]})).image).toEqual(image)
 })
 it('cancels before publishing and rejects impossible or unsafe controls',async()=>{
  const controller=new AbortController();controller.abort()
  await expect(processPortrait(photo(),masks(),defaultPortraitSettings(),{signal:controller.signal})).rejects.toMatchObject({name:'AbortError'})
  await expect(processPortrait(photo(),masks(),{...defaultPortraitSettings(),eyes:500})).rejects.toThrow('参数')
 })
})
it('keeps semi-transparent alpha and hidden RGB exact, and rejects healing a protected point',async()=>{
 const image=photo();for(let i=0;i<1024;i++)image.data[i*4+3]=i%3?128:0
 const result=await processPortrait(image,masks(),{...defaultPortraitSettings(),skinTone:8,eyes:8})
 for(let i=0;i<1024;i++){expect(result.image.data[i*4+3]).toBe(image.data[i*4+3]);if(!image.data[i*4+3])expect(result.image.data.slice(i*4,i*4+3)).toEqual(image.data.slice(i*4,i*4+3))}
 await expect(processPortrait(photo(),masks(),{...defaultPortraitSettings(),blemishes:[{x:27,y:67}]})).rejects.toThrow('保护区域')
})
it('rejects a disguised rectangular feature mask after affine capture',async()=>{
 const region=createSelection('rectangle',{x:5,y:5,width:40,height:40})
 await expect(processPortrait(photo(),{...masks(),skin:{...region,path:{type:'affine',source:region.path,matrix:[1,0,0,1,0,0]}}},defaultPortraitSettings())).rejects.toThrow('矩形')
})
