import { afterEach, expect,it,vi } from 'vitest'
import { createServer,type Server } from 'node:http'
import { initialEditorState } from '../../state/editor'
import type { ServiceConnection } from '../../creation/serviceConnections'
import { parseRemotePlan, requestRemotePlan } from './remotePlanner'
const state=()=>structuredClone(initialEditorState)
const valid={steps:[{id:'one',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],explanation:'移动原图',clarifications:[],warnings:[]}
const connection:ServiceConnection={id:'test',name:'local',provider:'Local',baseUrl:'http://127.0.0.1:1/v1',apiKey:'local-test-only',protocol:'openai_compatible',models:['vision'],enabled:true,modelCapabilities:{vision:{text:true,vision:true,image:false}}}
let server:Server|undefined
afterEach(async()=>{vi.restoreAllMocks();if(server)await new Promise<void>(r=>server!.close(()=>r()));server=undefined})
it('validates exact response/step/argument schema and declared capability before any preview',()=>{
 expect(parseRemotePlan(JSON.stringify(valid),state(),['art']).steps[0].tool).toBe('move')
 for(const bad of [{...valid,hidden:true},{...valid,steps:[{...valid.steps[0],args:{...valid.steps[0].args,dx:'10'}}]},{...valid,steps:[{...valid.steps[0],args:{...valid.steps[0].args,op:'delete'}}]},{...valid,steps:[{...valid.steps[0],tool:'brush'}]},{...valid,steps:[{...valid.steps[0],dependsOn:['missing']}]},{...valid,steps:[{...valid.steps[0],args:{...valid.steps[0].args,layerId:'original'}}]}])expect(()=>parseRemotePlan(JSON.stringify(bad),state(),['art'])).toThrow()
 expect(()=>parseRemotePlan(JSON.stringify(valid),state(),['art'],['rename'])).toThrow(/能力/)
 const locked=state();locked.layers[0].locked=true;expect(()=>parseRemotePlan(JSON.stringify(valid),locked,['art'])).toThrow(/锁定/)
 expect(()=>parseRemotePlan(JSON.stringify({...valid,steps:[{id:'a',tool:'visibility',args:{layerId:'art',visible:'false'},dependsOn:[]}]}),state(),['art'])).toThrow()
})
it('calls actual local HTTP completion with text/vision context and validates the returned structured plan',async()=>{
 let request:any
 server=createServer((req,res)=>{let raw='';req.on('data',x=>raw+=x);req.on('end',()=>{request={url:req.url,authorization:req.headers.authorization,body:JSON.parse(raw)};res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{content:JSON.stringify(valid)}}]}))})})
 await new Promise<void>(r=>server!.listen(0,'127.0.0.1',r));const addr=server.address() as {port:number}
 const result=await requestRemotePlan({...connection,baseUrl:`http://127.0.0.1:${addr.port}/v1`},'vision',state(),'doc','向右移动10像素',['art'],{signal:new AbortController().signal,reference:{source:'data:image/png;base64,aGVsbG8=',name:'local reference'}})
 expect(result.steps).toHaveLength(1);expect(request.url).toBe('/v1/chat/completions');expect(request.authorization).toBe('Bearer local-test-only')
 expect(request.body.messages[1].content[1].image_url.url).toBe('data:image/png;base64,aGVsbG8=');expect(request.body.messages[1].content[0].text).toContain('doc');expect(JSON.stringify(request.body)).not.toContain('local-test-only')
})
it('rejects visual upload for text-only/disabled models and drops aborted completions',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 await expect(requestRemotePlan({...connection,modelCapabilities:{vision:{text:true,vision:false,image:false}}},'vision',state(),'d','move',['art'],{signal:new AbortController().signal,reference:{source:'data:image/png;base64,aGVsbG8=',name:'x'}})).rejects.toThrow(/视觉/)
 await expect(requestRemotePlan({...connection,enabled:false},'vision',state(),'d','move',['art'],{signal:new AbortController().signal})).rejects.toThrow(/不可用/)
 const c=new AbortController();c.abort();await expect(requestRemotePlan(connection,'vision',state(),'d','move',['art'],{signal:c.signal})).rejects.toThrow(/取消/);expect(fetcher).not.toHaveBeenCalled()
})

it('lets a recognized GPT text model plan without requiring extra capability metadata',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(valid)}}]})))
 const legacy={...connection,models:['gpt-6.5-sol'],modelCapabilities:undefined}
 const result=await requestRemotePlan(legacy,'gpt-6.5-sol',state(),'doc','复杂排版规划',['art'],{signal:new AbortController().signal})
 expect(result.steps).toHaveLength(1)
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).model).toBe('gpt-6.5-sol')
 expect(legacy.modelCapabilities).toBeUndefined()
 await expect(requestRemotePlan(legacy,'gpt-6.5-sol',state(),'doc','查看参考图',['art'],{signal:new AbortController().signal,reference:{source:'data:image/png;base64,aGVsbG8=',name:'x'}})).rejects.toThrow(/视觉/)
 expect(fetcher).toHaveBeenCalledTimes(1)
})
