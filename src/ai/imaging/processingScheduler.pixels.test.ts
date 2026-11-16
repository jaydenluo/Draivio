import {expect,it} from 'vitest'
import {BLEND_MODES,blendPixel} from '../../render/blendModes'
import {processRaster,disposeRaster} from './processingScheduler'
import {solidImage} from '../../engine/raster/composite'
it('agrees with independent W3C blendPixel math across modes, masks and alpha extremes',async()=>{
 for(const mode of BLEND_MODES){
  const base=solidImage(33,5,[0,0,0,0]),top=solidImage(33,5,[0,0,0,0]),mask=new Uint8Array(165)
  for(let i=0;i<165;i++){for(let c=0;c<4;c++){base.data[i*4+c]=(i*37+c*13)%256;top.data[i*4+c]=(i*43+c*17)%256}mask[i]=i*7%256}
  const result=await processRaster({width:33,height:5,layers:[{image:base},{image:top,blendMode:mode.id,opacity:.63,mask}]},{execution:'cooperative'})
  for(let i=0;i<165;i++){
   const expected=blendPixel([...base.data.slice(i*4,i*4+4)],[...top.data.slice(i*4,i*4+4)],mode.id,.63,mask[i]/255)
   for(let c=0;c<4;c++)expect(Math.abs(result.image.data[i*4+c]-expected[c])).toBeLessThanOrEqual(1)
  }
  disposeRaster(result.image)
 }
})
