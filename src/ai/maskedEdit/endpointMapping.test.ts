import {expect,it} from 'vitest'
import {endpointFrame,endpointSize} from './endpointMapping'
it('chooses a supported endpoint canvas independently of original canvas dimensions',()=>{
 expect(endpointSize('auto',['auto','1024x1024','1536x1024','1024x1536'],{width:164,height:220})).toEqual({width:1024,height:1536})
 expect(endpointSize('1024 × 1024',['1024x1024'],{width:500,height:625})).toEqual({width:1024,height:1024})
 expect(()=>endpointSize('500 × 625',['1024x1024'],{width:500,height:625})).toThrow(/不支持/)
})
it('letterboxes a crop without stretching and keeps deterministic inverse coordinates',()=>{
 expect(endpointFrame({width:100,height:200},{width:1024,height:1024})).toEqual({width:1024,height:1024,content:{x:256,y:0,width:512,height:1024}})
})
