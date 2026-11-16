import {message,messageStore} from '../ui/message'
import {it,expect,vi,afterEach} from 'vitest'
import {generateOpenAIImages} from './openaiImages'
import {imageCapabilitiesFor} from './imageEditCapabilities'
import type {ServiceConnection} from './serviceConnections'
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
const connection:ServiceConnection={id:'one',provider:'OpenAI',name:'official-compatible',baseUrl:'https://provider.example/v1',apiKey:'fixture',protocol:'openai_compatible',models:['gpt-image-1','unknown'],enabled:true}
const input={model:'gpt-image-1',prompt:'recolor',count:1,size:'1024 × 1024',options:{multiImage:'single' as const,concurrency:1,sendSize:true,quality:'high' as const},reference:png}
afterEach(()=>{vi.restoreAllMocks();message.destroy()})
it('reference intent retains its image and uses real PNG file parts at edits endpoint',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'AAAA'}]})))
 await generateOpenAIImages(connection,{...input,intent:'reference'})
 expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
 const form=fetcher.mock.calls[0][1]?.body as FormData;expect(form.get('image')).toBeInstanceOf(File);expect(form.get('size')).toBe('1024x1024')
})
it('generic protocol does not infer reference/edit support for an unknown model',()=>{expect(imageCapabilitiesFor(connection,'unknown').edit).toBe(false)})
it('rejects unsupported size rather than silently sending a different scope or size',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 await expect(generateOpenAIImages(connection,{...input,intent:'edit',size:'900 × 900'})).rejects.toThrow('尺寸')
 expect(fetcher).not.toHaveBeenCalled()
})
it('unknown protocol preset never gains an adapter solely from claimed model capabilities',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 await expect(generateOpenAIImages({...connection,protocol:'bfl'},{...input,intent:'edit',capabilities:{generate:true,edit:true,reference:true,encoding:'base64-json'}})).rejects.toThrow('协议')
 expect(fetcher).not.toHaveBeenCalled()
})

import {executeGenerativeOperation,negotiateGenerativeRoute,createGenerativeBatch} from '../ai/tools/generativeTools'
import {validImageCapabilities} from './imageEditCapabilities'
const custom={...connection,imageCapabilities:{unknown:{generate:true,edit:true,reference:true,encoding:'base64-json' as const,maskedEdit:{semantics:'white-edit' as const}}}}
it.each(['fill','remove','outpaint'] as const)('%s preserves custom JSON mask and strips undeclared controls',async operation=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{url:'https://cdn.example/image.png'}]})))
 await executeGenerativeOperation(custom,{...input,model:'unknown',operation,prompt:operation==='remove'?'':input.prompt,reference:png,mask:{source:png,semantics:'white-edit'},parameters:{steps:30,guidance:7,strength:.5}})
 expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
 const body=JSON.parse(fetcher.mock.calls[0][1]?.body as string)
 expect(body).toMatchObject({image:png,mask:png});expect(body).not.toHaveProperty('quality');expect(body).not.toHaveProperty('steps');expect(body).not.toHaveProperty('guidance');expect(body).not.toHaveProperty('strength')
 expect(messageStore.getSnapshot()).toEqual(expect.arrayContaining([expect.objectContaining({type:'warning',content:expect.stringMatching(/未发送.*步数.*引导强度.*编辑强度.*画质/)} )]))
})
it('mask direction mismatch and missing mask fail before any network request',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 await expect(executeGenerativeOperation(connection,{...input,operation:'fill',reference:png,mask:{source:png,semantics:'white-edit'}})).rejects.toThrow('方向')
 expect(()=>negotiateGenerativeRoute(connection,input,'fill')).toThrow('蒙版')
 expect(fetcher).not.toHaveBeenCalled()
})
it('rejects invalid counts and incompatible declared quality',()=>{
 expect(()=>negotiateGenerativeRoute(connection,{...input,count:1.5},'reference')).toThrow('数量')
 expect(()=>negotiateGenerativeRoute(connection,{...input,parameters:{quality:'ultra'}},'reference')).toThrow('质量')
})
it('rejects malformed capability declarations',()=>{
 expect(validImageCapabilities({x:{generate:true,edit:true,reference:false,encoding:'multipart'}})).toBe(false)
 expect(validImageCapabilities({x:{generate:true,edit:true,reference:true,encoding:'multipart',maskedEdit:{semantics:'black-edit'}}})).toBe(false)
})
it('multipart rejects URL strings and truncated or mismatched PNG input without a request',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 await expect(generateOpenAIImages(connection,{...input,intent:'reference',reference:'https://cdn.example/ref.png'})).rejects.toThrow('PNG')
 await expect(generateOpenAIImages(connection,{...input,intent:'reference',reference:'data:image/png;base64,AAAA'})).rejects.toThrow('PNG')
 const bytes=Uint8Array.from(atob(png.split(',')[1]),c=>c.charCodeAt(0));bytes[19]=2
 const other=`data:image/png;base64,${btoa(String.fromCharCode(...bytes))}`
 await expect(generateOpenAIImages(connection,{...input,intent:'edit',mask:other})).rejects.toThrow('尺寸')
 expect(fetcher).not.toHaveBeenCalled()
})
it('single-result relay requires explicit missing-slot retries and never replaces successes',async()=>{
 const request=vi.fn().mockResolvedValue(['one']),receive=vi.fn()
 const batch=createGenerativeBatch(3,'single',2,request,receive)
 await batch.run();expect(request.mock.calls[0][0]).toBe(3);expect(batch.getSnapshot().items.map(i=>i.status)).toEqual(['succeeded','missing','missing'])
 await batch.retry();expect(request.mock.calls.map(call=>call[0])).toEqual([3,2]);expect(receive.mock.calls.map(call=>call.slice(0,2))).toEqual([['one',0],['one',1]])
 await batch.retry();expect(request.mock.calls.map(call=>call[0])).toEqual([3,2,1]);expect(batch.getSnapshot().items.every(i=>i.status==='succeeded')).toBe(true)
})
