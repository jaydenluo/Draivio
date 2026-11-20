import { expect, test, vi } from 'vitest'
import { createDocumentSession, documentSignature } from './documentWorkspace'
import { contentRevision, captureEditorContext, contextCanCommit } from '../ai/context/editorContext'

test('raster preview cache changes never dirty the document or invalidate AI', () => {
 const doc=createDocumentSession('identity')
 doc.state.layers=[{id:'r',name:'原件',className:'layer-art',visible:true,opacity:100,blendMode:'正常',rasterRef:{assetId:'a'.repeat(64),revision:1,originalHash:'b'.repeat(64)} as never, source:'blob:old',thumbnail:'blob:old'}]
 const signature=documentSignature(doc), context=captureEditorContext(doc.state,doc.id,'document')
 const cached={...doc,state:{...doc.state,layers:doc.state.layers.map(l=>({...l,source:'blob:ready',thumbnail:'blob:ready'})),selectedCanvasTargets:[]}}
 expect(documentSignature(cached)).toBe(signature)
 expect(contextCanCommit(cached.state,context)).toBe(true)
 expect(contentRevision({...cached.state,layers:cached.state.layers.map(l=>({...l,rasterRef:{...l.rasterRef!,revision:2}}))})).not.toBe(context.revision)
})

test('color profile and pixel precision changes invalidate a captured AI context', () => {
 const doc=createDocumentSession('ICC'), context=captureEditorContext(doc.state,doc.id,'document')
 expect(contextCanCommit({...doc.state,colorManagement:{...doc.state.colorManagement,profile:{...doc.state.colorManagement.profile,bytes:new Uint8Array([7,8,9])}}},context)).toBe(false)
 expect(contextCanCommit({...doc.state,pixelFormat:'rgba16' as never},context)).toBe(false)
})

test('unchanged structurally shared artwork is not serialized again for view or dirty checks', () => {
 const doc=createDocumentSession('big')
 doc.state.layers=[{id:'i',name:'inline',className:'layer-art',visible:true,opacity:100,blendMode:'正常',source:'data:image/png;base64,'+'A'.repeat(1000000)}]
 documentSignature(doc); contentRevision(doc.state)
 const stringify=vi.spyOn(JSON,'stringify')
 documentSignature({...doc,state:{...doc.state,zoom:80}}); contentRevision({...doc.state,notice:'ready'})
 expect(stringify.mock.calls.some(args=>typeof args[0]==='object' && args[0]!==null && 'layers' in args[0])).toBe(false)
 expect(stringify.mock.calls.map(args=>typeof args[0]==='string'?args[0].length:0).some(n=>n>10000)).toBe(false)
 stringify.mockRestore()
})
