import { expect,it } from 'vitest'
import { readFileSync,writeFileSync } from 'node:fs'
import { tiledInference } from '../../src/ai/imaging/tiledInference'
import { requestRestorationTile } from '../../src/ai/tools/restorationTools'
import { testMaskedIO } from '../../src/ai/maskedEdit/testIO'
const root='docs/implementation/fixtures/restoration'
it('runs actual ESPCN 2x/4x through shared HTTP and overlap merge without visible seams',async()=>{
 const source=await testMaskedIO.decode(`data:image/png;base64,${readFileSync(`${root}/synthetic-input.png`).toString('base64')}`),records=[]
 for(const scale of [2,4] as const){
  const infer=(image:typeof source)=>requestRestorationTile({endpoint:'http://127.0.0.1:8767/restore',model:'espcn',scale,mode:'size',image})
  const full=await infer(source),tiled=await tiledInference(source,scale,infer,{tileSize:48,overlap:16})
  expect(tiled.width).toBe(source.width*scale);expect(tiled.height).toBe(source.height*scale)
  let sum=0,max=0,count=0
  for(let i=0;i<full.data.length;i+=4){expect(tiled.data[i+3]).toBe(full.data[i+3]);if(full.data[i+3])for(let c=0;c<3;c++){const delta=Math.abs(full.data[i+c]-tiled.data[i+c]);sum+=delta;max=Math.max(max,delta);count++}}
  const mean=sum/count;expect(mean).toBeLessThan(1.5)
  const png=testMaskedIO.encode(tiled);writeFileSync(`${root}/espcn-tiled-${scale}x.png`,Buffer.from(png.split(',')[1],'base64'))
  records.push({scale,width:tiled.width,height:tiled.height,meanChannelDifferenceFromFullInference:mean,maxChannelDifferenceFromFullInference:max,cost:0,model:'ESPCN',tileSize:48,overlap:16})
 }
 writeFileSync(`${root}/real-tile-metrics.json`,JSON.stringify(records,null,2))
})
