import { expect,it } from 'vitest'
import { initialEditorState } from '../../state/editor'
import { createEditPreview } from '../execution/preview'
import { recordConversationRun,undoConversationRun,validateConversationRuns } from './session'
import { encodeProject,decodeProject } from '../../document/projectFormat'
import { createDocumentSession } from '../../document/documentWorkspace'
function recorded(){const before=structuredClone(initialEditorState),preview=createEditPreview(before,'old-doc',[{id:'s',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],['art']);return recordConversationRun(before,preview.document,'old-doc','run',preview.steps)}
it('saves actual whitelisted results, rebinds reopened session, and safely corrects it',async()=>{const text=await encodeProject(recorded(),{id:'project',name:'测试'});const decoded=decodeProject(text);expect(decoded.document.conversationRuns![0].results).toEqual([{tool:'move',targetIds:['art'],changed:true}]);const loaded=createDocumentSession('测试',undefined,decoded);expect(loaded.state.conversationRuns![0].documentId).toBe(loaded.id);expect(undoConversationRun(loaded.state,loaded.id).state.layers.find(l=>l.id==='art')!.transform).toBeUndefined();expect(createDocumentSession('新文档').state.conversationRuns??[]).toEqual([])})
it('rejects unknown metadata, secret values, prototype paths and malformed results',()=>{const runs=recorded().conversationRuns!;for(const mutate of [(r:any)=>{r.prompt='private'},(r:any)=>{r.patches[0].after={apiKey:'private'}},(r:any)=>{r.patches[0].path=['transform','__proto__','x']},(r:any)=>{r.results[0].changed='yes'},(r:any)=>{r.absentRoots[0].key='password'}]){const bad=structuredClone(runs);mutate(bad[0]);expect(()=>validateConversationRuns(bad)).toThrow()}})
