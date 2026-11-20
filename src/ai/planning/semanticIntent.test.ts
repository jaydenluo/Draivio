import { expect, test } from 'vitest'
import { parseSemanticIntent } from './semanticIntent'
const context={selectionVisible:true,selectedLayerId:'title',selectedLayerIds:['title'],layers:[{id:'title',name:'标题'},{id:'bg',name:'背景'}]}
test('accepts a semantic edit with explicit validated target and scope',()=>{
 expect(parseSemanticIntent(JSON.stringify({kind:'image-edit',target:'selection',targetIds:[],summary:'替换选区天空',question:''}),context)).toMatchObject({kind:'image-edit',target:'selection'})
})
test('rejects invented targets and unavailable selections',()=>{
 expect(()=>parseSemanticIntent(JSON.stringify({kind:'smart-plan',target:'object',targetIds:['fake'],summary:'移动',question:''}),context)).toThrow()
 expect(()=>parseSemanticIntent(JSON.stringify({kind:'image-edit',target:'selection',targetIds:[],summary:'修改',question:''}),{...context,selectionVisible:false})).toThrow()
})
test('mixed or ambiguous tasks must ask instead of executing partially',()=>{
 expect(()=>parseSemanticIntent(JSON.stringify({kind:'mixed',target:'auto',targetIds:[],summary:'换背景并移动标题',question:''}),context)).toThrow()
})
test('resolves implicit edit scope and rejects contradictory executable output',()=>{
 const base={kind:'image-edit',target:'auto',targetIds:[],summary:'修改当前图片',question:''}
 expect(parseSemanticIntent(JSON.stringify(base),context)).toMatchObject({target:'selection',targetIds:[]})
 expect(parseSemanticIntent(JSON.stringify(base),{...context,selectionVisible:false})).toMatchObject({target:'object',targetIds:['title']})
 expect(()=>parseSemanticIntent(JSON.stringify({...base,target:'document',targetIds:['title']}),context)).toThrow()
 expect(()=>parseSemanticIntent(JSON.stringify({...base,question:'要修改哪张？'}),context)).toThrow()
})
test('native object edits cannot silently claim to operate on uploaded pixels or a pixel selection',()=>{
 const base={kind:'smart-plan',target:'upload',targetIds:[],summary:'修改上传图',question:''}
 expect(()=>parseSemanticIntent(JSON.stringify(base),context)).toThrow()
 expect(()=>parseSemanticIntent(JSON.stringify({...base,target:'selection'}),context)).toThrow()
})
test('rejects contradictory auto scope IDs before a selection can replace the named target',()=>{
 expect(()=>parseSemanticIntent(JSON.stringify({kind:'image-edit',target:'auto',targetIds:['bg'],summary:'将背景改成蓝色',question:''}),context)).toThrow()
})
test('keeps structured image overrides but rejects unknown or unsafe parameters',()=>{
 const base={kind:'generate',target:'document',targetIds:[],summary:'生成两张竖版猫咪',question:''}
 expect(parseSemanticIntent(JSON.stringify({...base,imageParameters:{count:2,ratio:'9:16'}}),context)).toMatchObject({imageParameters:{count:2,ratio:'9:16'}})
 expect(()=>parseSemanticIntent(JSON.stringify({...base,imageParameters:{apiKey:'secret'}}),context)).toThrow()
})
