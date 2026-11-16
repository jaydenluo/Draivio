import { afterEach, expect, it, vi } from 'vitest'
import { cloudAccount } from './cloudAccount'
import { quoteCloudImages } from './cloudBilling'
afterEach(()=>vi.restoreAllMocks())
it('quotes actual split requests and reads decimal credits without submitting paid work',async()=>{
 vi.spyOn(cloudAccount,'getSnapshot').mockReturnValue({authenticated:true,user:{email:'test@example.test'},balance:20,models:[]})
 const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status:201,body:{totalCredits:'2.5',model:'image'},retryAfter:1000})
 expect(await quoteCloudImages({model:'image',prompt:'test',n:1,size:'1024x1024'},3)).toBe(7.5)
 expect(send).toHaveBeenCalledExactlyOnceWith('/api/model-gateway/v1/quotes',{method:'POST',body:{model:'image',capability:'image',request:{model:'image',prompt:'test',n:1,size:'1024x1024'}}})
})
it('blocks insufficient balance and invalid prices before any paid request',async()=>{
 vi.spyOn(cloudAccount,'getSnapshot').mockReturnValue({authenticated:true,user:{email:'test@example.test'},balance:1,models:[]})
 const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status:200,body:{totalCredits:4},retryAfter:1000})
 await expect(quoteCloudImages({model:'image',prompt:'test',n:1},1)).rejects.toThrow(/积分不足/)
 send.mockResolvedValue({status:200,body:{totalCredits:'invalid'},retryAfter:1000})
 await expect(quoteCloudImages({model:'image',prompt:'test',n:1},1)).rejects.toThrow(/报价无效/)
 expect(send).toHaveBeenCalledTimes(2)
})
