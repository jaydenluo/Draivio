import {afterEach,expect,it,vi} from 'vitest'
import {cloudAccount,type CloudAccountSnapshot} from './cloudAccount'
import {getOfficialCloudConnection} from './cloudModels'
import {getAvailableSources,isSourceUsable} from '../creation/modelSources'
import {generateOpenAIImages} from '../creation/openaiImages'
import {requestChatCompletion} from '../ai/providers/chatAdapter'
import {defaultGenerationOptions} from '../creation/generationOptions'
const image={id:'image-id',code:'real-image',displayName:'Real Image',modality:'image',capabilities:['image'],constraints:{maxImages:1},availability:{available:true}}
const text={id:'text-id',code:'real-chat',displayName:'Real Chat',modality:'text',capabilities:['chat'],constraints:{supportsImageInput:false},availability:{available:true}}
function session(){const snapshot:CloudAccountSnapshot={authenticated:true,user:{email:'local@test'},balance:12,models:[image,text,{...image,code:'offline',availability:{available:false,reason:'NO_AVAILABLE_SUPPLIER'}},{...image,code:'not-image',capabilities:['video']}]};vi.spyOn(cloudAccount,'getSnapshot').mockReturnValue(snapshot);return snapshot}
afterEach(()=>{vi.restoreAllMocks();localStorage.clear()})
it('lists only actual available image models; logged-out source has no fabricated catalog',()=>{
 const s=session();expect(getAvailableSources()[0].models).toEqual([{code:'real-image',displayName:'Real Image'}]);expect(isSourceUsable('draivio-cloud','Real Image')).toBe(true);expect(isSourceUsable('draivio-cloud','Image Pro')).toBe(false)
 s.authenticated=false;expect(getAvailableSources()[0].models).toEqual([]);expect(isSourceUsable('draivio-cloud','Real Image')).toBe(false)
})
it('routes real catalog generation through the account transport with idempotency and no token copies',async()=>{
 session();const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status:200,body:{data:[{b64_json:'aGVsbG8='}]},retryAfter:1000})
 const connection=getOfficialCloudConnection()!;expect(connection.apiKey).toBe('');expect(JSON.stringify(connection)).not.toContain('Token')
 const result=await generateOpenAIImages(connection,{model:'real-image',prompt:'photo',count:1,size:'1024x1024',options:defaultGenerationOptions})
 expect(result).toEqual(['data:image/png;base64,aGVsbG8=']);expect(send).toHaveBeenCalledWith('/api/model-gateway/v1/images/generations',expect.objectContaining({method:'POST',headers:{'Idempotency-Key':expect.any(String)},body:{model:'real-image',prompt:'photo',n:1,size:'1024x1024'}}))
})
it('rejects unsupported official edit and wrong-modality generation before any request',async()=>{
 session();const send=vi.spyOn(cloudAccount,'request');const connection=getOfficialCloudConnection()!
 await expect(generateOpenAIImages(connection,{model:'real-image',prompt:'erase',count:1,size:'1024x1024',options:defaultGenerationOptions,intent:'edit',reference:'data:image/png;base64,aGVsbG8='})).rejects.toThrow(/编辑|能力/)
 await expect(generateOpenAIImages(connection,{model:'real-chat',prompt:'draw',count:1,size:'1024x1024',options:defaultGenerationOptions})).rejects.toThrow(/能力|生成/)
 expect(send).not.toHaveBeenCalled()
})
it('routes official chat, preserves tools capability restrictions and rejects undeclared image input',async()=>{
 session();const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status:200,body:{choices:[{message:{content:'answer'}}]},retryAfter:1000})
 expect((await requestChatCompletion({sourceId:'draivio-cloud',baseUrl:'',apiKey:'',model:'real-chat',messages:[{role:'user',content:'hello'}]})).text).toBe('answer')
 expect(send).toHaveBeenCalledWith('/api/model-gateway/v1/chat/completions',expect.objectContaining({headers:{'Idempotency-Key':expect.any(String)},body:{model:'real-chat',messages:[{role:'user',content:'hello'}]}}))
 await expect(requestChatCompletion({sourceId:'draivio-cloud',baseUrl:'',apiKey:'',model:'real-chat',messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,aGVsbG8='}}]}]})).rejects.toThrow(/视觉|参考图|图片/)
 expect(send).toHaveBeenCalledTimes(1)
})
it.each([402,403])('maps official insufficient-credit errors distinctly without retrying (%s)',async status=>{
 session();const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status,body:{code:'INSUFFICIENT_CREDITS'},retryAfter:1000})
 await expect(generateOpenAIImages(getOfficialCloudConnection()!,{model:'real-image',prompt:'draw',count:1,size:'1024x1024',options:defaultGenerationOptions})).rejects.toThrow(/积分|额度/)
 expect(send).toHaveBeenCalledTimes(1)
})

it.each([402,403])('explains official chat insufficient credits (%s) without retry or provider details',async status=>{
 session();const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status,body:{code:'INSUFFICIENT_CREDITS',message:'private provider detail'},retryAfter:1000})
 await expect(requestChatCompletion({sourceId:'draivio-cloud',baseUrl:'',apiKey:'',model:'real-chat',messages:[{role:'user',content:'hello'}]})).rejects.toThrow(/额度不足.*充值/)
 expect(send).toHaveBeenCalledTimes(1)
})


import {executeGenerativeOperation} from '../ai/tools/generativeTools'
it('rejects a task whose account changed during asynchronous adapter loading',async()=>{
 session();const version=vi.spyOn(cloudAccount,'getSessionVersion').mockReturnValue(4)
 const send=vi.spyOn(cloudAccount,'request')
 const pending=executeGenerativeOperation(getOfficialCloudConnection()!,{operation:'generate',expectedCloudSession:4,model:'real-image',prompt:'photo',count:1,size:'1024x1024',options:defaultGenerationOptions})
 version.mockReturnValue(5)
 await expect(pending).rejects.toThrow(/账号已更改.*未提交/)
 expect(send).not.toHaveBeenCalled()
})
