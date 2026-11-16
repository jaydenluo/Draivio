import {afterEach,expect,it,vi} from 'vitest'
import {aiManualToolCoverage} from './toolCoverage'
import * as catalog from './toolCapabilities'
import * as generative from './generativeTools'
import {defaultGenerationOptions} from '../../creation/generationOptions'
import {initialEditorState} from '../../state/editor'
import {defaultRelightSettings} from '../workflows/relight'
import {testMaskedIO} from '../maskedEdit/testIO'
import {upscalePixels} from '../../imaging/enhancement'
import type {ServiceConnection} from '../../creation/serviceConnections'
const connection={} as ServiceConnection
const common={model:'image',prompt:'test',count:1,size:'auto',options:defaultGenerationOptions}
afterEach(()=>vi.restoreAllMocks())
it.each(['generate','reference','fill','remove','outpaint'] as const)('registered %s preserves the operation and consumes the catalog before workflow execution',async operation=>{
 const guard=vi.spyOn(catalog,'assertManualTool'),workflow=vi.spyOn(generative,'executeGenerativeOperation').mockResolvedValue([])
 const result=operation==='generate'?aiManualToolCoverage.generate.execute(connection,{...common,operation}):operation==='reference'?aiManualToolCoverage.reference.execute(connection,{...common,operation,reference:'png'}):operation==='outpaint'?aiManualToolCoverage.outpaint.execute(connection,{...common,operation,reference:'png',mask:{source:'mask',semantics:'white-edit'}}):aiManualToolCoverage.reference.execute(connection,{...common,operation,reference:'png',mask:{source:'mask',semantics:'white-edit'}})
 await result;expect(guard).toHaveBeenCalledWith(operation==='fill'||operation==='remove'?'reference':operation);expect(workflow.mock.calls[0][1].operation).toBe(operation)
})
it('registered restoration runs the existing real workflow instead of a placeholder',async()=>{
 const image={width:2,height:2,data:new Uint8ClampedArray(16)},source=testMaskedIO.encode(image)
 const state={...initialEditorState,layers:[{...initialEditorState.layers[0],id:'photo',source}],selectedLayerId:'photo'}
 const result=await aiManualToolCoverage.restoration.execute(state,'doc',{scale:2,mode:'size',backend:'fixture'},async tile=>upscalePixels(tile,2),{io:testMaskedIO})
 expect(result.request?.restoration).toMatchObject({width:4,height:4,scale:2});expect(state.aiResults).toHaveLength(0)
})
it('registered relight enforces inherited target locks before workflow publication',()=>{
 const state={...initialEditorState,layers:[{...initialEditorState.layers[0],id:'photo',groupId:'parent'},{...initialEditorState.layers[0],id:'parent',locked:true}]}
 expect(()=>aiManualToolCoverage.relight.execute(state,{...defaultRelightSettings(),layerId:'photo'})).toThrow(/锁定/)
})
it('all five production adapters fail closed when catalog registration is rejected',()=>{
 vi.spyOn(catalog,'assertManualTool').mockImplementation(()=>{throw new Error('catalog denied')})
 expect(()=>aiManualToolCoverage.relight.execute(initialEditorState,{...defaultRelightSettings(),layerId:'art'})).toThrow('catalog denied')
 expect(()=>aiManualToolCoverage.restoration.execute(initialEditorState,'doc',{scale:2,mode:'size',backend:'fixture'},async image=>image)).toThrow('catalog denied')
 expect(()=>aiManualToolCoverage.generate.execute(connection,{...common,operation:'generate'})).toThrow('catalog denied')
 expect(()=>aiManualToolCoverage.reference.execute(connection,{...common,operation:'reference',reference:'png'})).toThrow('catalog denied')
 expect(()=>aiManualToolCoverage.outpaint.execute(connection,{...common,operation:'outpaint',reference:'png',mask:{source:'mask',semantics:'white-edit'}})).toThrow('catalog denied')
})
