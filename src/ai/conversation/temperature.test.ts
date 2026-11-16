import { expect,it } from 'vitest'
import { planNaturalLanguage } from '../planning/planner'
const options={layers:[{id:'subject',name:'主体'}],selectedLayerId:'other'}
it('resolves explicit temperature target and signed bounded value',()=>{expect(planNaturalLanguage('将图层“主体”色温设为10',options).steps[0]).toMatchObject({tool:'adjustment',args:{layerId:'subject',key:'temperature',value:10}});expect(planNaturalLanguage('将图层“主体”色温设为-23.5',options).steps[0].args.value).toBe(-23.5)})
it('clarifies missing, oversized and malformed values and honors negation',()=>{for(const text of ['色温更暖','色温设为101','色温设为10oops'])expect(planNaturalLanguage(text,options).steps).toEqual([]);expect(planNaturalLanguage('不要将图层“主体”色温设为10',options).steps).toEqual([])})
