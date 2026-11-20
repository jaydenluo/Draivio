import {expect,test} from 'vitest'
import {resolveChatImageParameters,parseImageOverrides} from './chatImageParameters'
const defaults={model:'image-a',ratio:'1:1',size:'1024 × 1024',count:'1 张',strength:'强度 48%'}
test('inherits all composer settings without modifying the input',()=>{
 const resolved=resolveChatImageParameters(defaults,{})
 expect(resolved).toEqual(defaults);expect(resolved).not.toBe(defaults)
})
test('overrides only this task and resolves ratio-only instructions from presets',()=>{
 expect(resolveChatImageParameters(defaults,{count:2,ratio:'9:16'})).toMatchObject({model:'image-a',ratio:'9:16',size:'720 × 1280',count:'2 张'})
 expect(defaults.size).toBe('1024 × 1024')
 expect(resolveChatImageParameters({...defaults,ratio:'9:16',size:'1080 × 1920'},{count:2,ratio:'9:16'}).size).toBe('1080 × 1920')
})
test('validates explicit sizes, ratios, unknown parameters and limits',()=>{
 for(const value of [{count:0},{count:9},{count:1.5},{size:'banana'},{ratio:'banana'},{apiKey:'x'},{size:'0x100'},{quality:'ultra'}])expect(()=>parseImageOverrides(value)).toThrow()
 expect(resolveChatImageParameters(defaults,{size:'1280x720'})).toMatchObject({size:'1280 × 720',ratio:'16:9'})
 expect(()=>resolveChatImageParameters(defaults,{size:'1280x720',ratio:'9:16'})).toThrow(/比例/)
})
test('keeps canvas edit dimensions and rejects explicit output resizing',()=>{
 expect(resolveChatImageParameters(defaults,{count:2},{width:500,height:625})).toMatchObject({count:'2 张',size:'500 × 625'})
 expect(()=>resolveChatImageParameters(defaults,{ratio:'9:16'},{width:500,height:625})).toThrow(/局部修图/)
})
test('does not silently send auto size when a concrete ratio is explicitly required',()=>{
 expect(resolveChatImageParameters({...defaults,size:'auto',ratio:'9:16'},{ratio:'9:16'}).size).toBe('720 × 1280')
 expect(()=>resolveChatImageParameters(defaults,{ratio:'9:16',size:'auto'})).toThrow(/自动尺寸/)
})
