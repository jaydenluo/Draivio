import { expect,it } from 'vitest'
import { planNaturalLanguage } from './planner'
import { initialEditorState } from '../../state/editor'
import { createEditPreview } from '../execution/preview'
const state=()=>structuredClone(initialEditorState)
it('maps bounded color requests to real preview parameters and color channels',()=>{for(const [text,args] of [['降低高光',{key:'highlights',value:-10}],['只改红色饱和度设为-20',{key:'hsl.red.saturation',value:-20}],['在选区暖一点',{key:'temperature',value:10,scope:'selection'}],['曝光设为1',{key:'exposureEV',value:1}],['投影不透明度设为40',{key:'effect.shadow',value:{opacity:40}}],['重置色温',{key:'reset.temperature'}]]){const b=state(),p=planNaturalLanguage(text as string,{layers:b.layers,selectedLayerId:'art'});expect(p.steps[0],text as string).toMatchObject({tool:'adjustment',args:{layerId:'art',...args as object}});expect(createEditPreview(b,'doc',p.steps,['art']).document.layers).not.toBe(b.layers)}})
it('refuses ambiguity, invalid numeric ranges, negation, and unsupported local effects',()=>{for(const text of ['色温设为101','曝光设为100','色阶伽马设为0','曲线中点设为2','选区投影不透明度设为30','不要降低高光'])expect(planNaturalLanguage(text,{layers:state().layers,selectedLayerId:'art'}).steps).toEqual([]);expect(planNaturalLanguage('将图层“同名”降低高光',{layers:[{id:'a',name:'同名'},{id:'b',name:'同名'}]}).clarifications.join()).toContain('多个')})
