import {expect,it,vi} from 'vitest'
import {createGenerationPlan,generationConfirmation,confirmGenerationPlan,validImagePricing} from './generationJobs'
it('counts actual initial and retry requests and states unknown price without invented totals',()=>{
 const plan=createGenerationPlan({model:'image',sourceName:'relay',count:4,strategy:'split',concurrency:2})
 expect(plan).toMatchObject({requestCount:4,imageCount:4,concurrency:2,cost:{known:false}})
 expect(generationConfirmation(plan)).toContain('费用未知');expect(generationConfirmation(plan)).toContain('image');expect(generationConfirmation(plan)).toContain('4 次请求')
 expect(createGenerationPlan({model:'image',sourceName:'relay',count:3,strategy:'single',concurrency:4}).requestCount).toBe(1)
})
it('known provider-configured unit rates produce honest estimates and explicit unknown-retry warning',()=>{
 const plan=createGenerationPlan({model:'image',sourceName:'relay',count:3,strategy:'split',concurrency:2,pricing:{unit:'image',amount:.25,currency:'USD'},retryUnknown:true})
 expect(plan.cost).toEqual({known:true,amount:.75,currency:'USD'})
 expect(generationConfirmation(plan)).toContain('0.75 USD');expect(generationConfirmation(plan)).toContain('可能重复计费')
 const confirm=vi.fn(()=>false);expect(confirmGenerationPlan(plan,confirm)).toBe(false);expect(confirm).toHaveBeenCalledOnce()
 expect(validImagePricing({x:{unit:'request',amount:-1,currency:'USD'}})).toBe(false)
})
