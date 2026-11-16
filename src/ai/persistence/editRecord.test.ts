import { expect, it, vi } from 'vitest'
import { editorReducer, initialEditorState } from '../../state/editor'
import { encodeProject, decodeProject, PROJECT_SCHEMA_VERSION } from '../../document/projectFormat'
import { createDocumentWorkspace } from '../../document/documentWorkspace'
import { encodeWorkspace, decodeWorkspace } from '../../document/workspaceRecovery'
import { createEditPreview } from '../execution/preview'
import { recordConversationRun, undoConversationRun } from '../conversation/session'
import { runRecipe, editorRecipeTools } from '../recipes/runner'

const png='data:image/png;base64,iVBORw0KGgo='
const metadata={id:'offline',name:'离线编辑'}
function recorded(){
 const before=structuredClone(initialEditorState)
 const preview=createEditPreview(before,'old',[{id:'s',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],['art'])
 return recordConversationRun(before,preview.document,'old','run',preview.steps)
}
it('restores conversation against the final workspace ID and preserves later manual edits on undo',async()=>{
 const state=recorded(),workspace=createDocumentWorkspace(state)
 state.conversationRuns![0].documentId=workspace.activeId
 const restored=decodeWorkspace(await encodeWorkspace(workspace)).documents[0]
 expect(restored.state.conversationRuns![0].documentId).toBe(restored.id)
 const manual=editorReducer(restored.state,{type:'rename-layer',id:'art',name:'manual'})
 const result=undoConversationRun(manual,restored.id)
 expect(result.state.layers.find(l=>l.id==='art')!.transform).toBeUndefined()
 expect(result.state.layers.find(l=>l.id==='art')!.name).toBe('manual')
 expect(restored.state.undoStack).toHaveLength(0)
})
it('persists actual resolved conversation arguments and tool versions without prompts',async()=>{
 const state=recorded(),run=decodeProject(await encodeProject(state,metadata)).document.conversationRuns![0] as any
 expect(run.toolVersion).toBe(1)
 expect(run.steps).toEqual([{id:'s',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}])
 expect(run).not.toHaveProperty('prompt')
})
it('versions real recipe executions and embeds candidate blob resources for offline adoption',async()=>{
 const before=structuredClone(initialEditorState)
 const recipe={schemaVersion:1 as const,id:'opacity',version:1,name:'透明度',inputs:[{id:'target',required:true}],parameters:{},steps:[{id:'s',tool:'opacity',args:{layerId:{$input:'target'},value:70}}]}
 const result=await runRecipe(before,recipe,{}, {target:'art'},editorRecipeTools)
 expect((result.saved.records[0] as any).toolVersion).toBe(1)
 before.aiResults=[{id:'candidate',source:'blob:temporary',thumbnail:'blob:temporary',prompt:'result',model:'m',provider:'p',size:'1',createdAt:'2026-11-16',status:'success',favorite:false,adopted:false}]
 const fetcher=vi.fn(async()=>png),text=await encodeProject(before,metadata,fetcher)
 expect(text).not.toContain('blob:temporary')
 expect(fetcher).toHaveBeenCalledTimes(1)
 const restored=editorReducer(before,{type:'restore-project',document:decodeProject(text).document})
 const adopted=editorReducer(restored,{type:'adopt-ai-result-as-layer',id:'candidate'})
 expect(adopted.layers[0].source).toBe(png)
 expect(editorReducer(adopted,{type:'undo'}).layers).toEqual(restored.layers)
})
it('strips nested authentication material before serializing project or recovery',async()=>{
 const state=structuredClone(initialEditorState) as any
 state.layers[0].aiOperation={mode:'generate',prompt:'normal',sourceLayerId:'art',selection:null,parameters:state.composerParameters,headers:{Authorization:'private-header'},apiKey:'private-key',config:{access_token:'private-token'}}
 const text=await encodeProject(state,metadata)
 for(const secret of ['private-header','private-key','private-token','Authorization','apiKey','access_token'])expect(text).not.toContain(secret)
 state.layers[0].name='Bearer abcdefghijklmnopqrstuvwxyz'
 await expect(encodeProject(state,metadata)).rejects.toThrow(/凭据/)
})
it('marks interrupted generation without executable jobs or automatic resubmission',async()=>{
 const state={...structuredClone(initialEditorState),isGenerating:true}
 const text=await encodeProject(state,metadata)
 const restored=editorReducer(initialEditorState,{type:'restore-project',document:decodeProject(text).document})
 expect((restored as any).aiRecovery).toMatchObject({status:'interrupted',model:state.composerParameters.model})
 expect(restored.isGenerating).toBe(false)
 expect(JSON.parse(text).document).not.toHaveProperty('isGenerating')
 expect((editorReducer(restored,{type:'new-document',width:64,height:64}) as any).aiRecovery).toBeUndefined()
})
it('writes schema 3, reads schema 2 and rejects a temporary resource supplied as downloaded content',async()=>{
 expect(PROJECT_SCHEMA_VERSION).toBe(3)
 const state=structuredClone(initialEditorState),text=await encodeProject(state,metadata)
 const legacy=JSON.parse(text);legacy.schemaVersion=2
 expect(decodeProject(JSON.stringify(legacy)).document.layers).toEqual(state.layers)
 state.layers[0].source='https://provider.invalid/signed?token=private'
 await expect(encodeProject(state,metadata,async()=> 'https://provider.invalid/still-temporary')).rejects.toThrow(/资源/)
})

import { captureEditorContext } from '../context/editorContext'
it('keeps a valid downloaded enhancement candidate adoptable after resource materialization, and rejects preexisting stale candidates',async()=>{
 const before=structuredClone(initialEditorState);before.layers[0].source='https://temporary.invalid/input.png'
 const context=captureEditorContext(before,'old','layer')
 before.aiResults=[{id:'enhance',source:png,thumbnail:png,prompt:'',model:'local',provider:'local',size:'1000',createdAt:'2026',status:'success',favorite:false,adopted:false,request:{mode:'edit',prompt:'',sourceLayerId:'art',selection:null,parameters:before.composerParameters,context,restoration:{width:1000,height:1250,scale:2,mode:'size',backend:'local'}}}]
 const loaded=editorReducer(before,{type:'restore-project',document:decodeProject(await encodeProject(before,metadata,async()=>png)).document})
 expect(editorReducer(loaded,{type:'adopt-ai-result-as-layer',id:'enhance'}).layers.length).toBe(loaded.layers.length+1)
 const stale=editorReducer(before,{type:'rename-layer',id:'art',name:'manual'})
 const staleLoaded=editorReducer(stale,{type:'restore-project',document:decodeProject(await encodeProject(stale,metadata,async()=>png)).document})
 expect(editorReducer(staleLoaded,{type:'adopt-ai-result-as-layer',id:'enhance'}).layers).toEqual(staleLoaded.layers)
})
it('rejects credential URLs in nested metadata and future/broken resource payloads',async()=>{
 const state=structuredClone(initialEditorState) as any
 state.layers[0].metadata={url:'https://service.invalid/log?api_key=private-query'}
 await expect(encodeProject(state,metadata)).rejects.toThrow(/凭据/)
 delete state.layers[0].metadata
 const raw=JSON.parse(await encodeProject(state,metadata))
 raw.document.layers[0].source='asset:bad';raw.assets.bad='https://temporary.invalid/signed'
 expect(()=>decodeProject(JSON.stringify(raw))).toThrow(/资源/)
})
it('collects only reachable candidate resources and leaves the original document unchanged on missing downloads',async()=>{
 const state=structuredClone(initialEditorState)
 state.aiResults=[{id:'gone',source:png,prompt:'',model:'m',provider:'p',size:'1',createdAt:'2026',status:'success',favorite:false,adopted:false}]
 expect(Object.keys(JSON.parse(await encodeProject(state,metadata)).assets)).toHaveLength(1)
 const deleted=editorReducer(state,{type:'delete-ai-result',id:'gone'})
 expect(Object.keys(JSON.parse(await encodeProject(deleted,metadata)).assets)).toHaveLength(0)
 state.layers[0].source='blob:lost'
 const original=structuredClone(state)
 await expect(encodeProject(state,metadata,async()=>{throw new Error('资源缺失')})).rejects.toThrow('资源缺失')
 expect(state).toEqual(original)
})

import { makeSoftProofProfile } from '../../color/softProof'
it('round trips a real target ICC byte array and checksum through file and actual project restore',async()=>{
 const state=structuredClone(initialEditorState)
 const profile=makeSoftProofProfile(state.colorManagement.profile.bytes,'目标RGB')
 state.proofSettings={...state.proofSettings,enabled:true,targetProfile:profile}
 const loaded=decodeProject(await encodeProject(state,metadata))
 expect(loaded.document.proofSettings!.targetProfile!.bytes).toBeInstanceOf(Uint8Array)
 expect(loaded.document.proofSettings!.targetProfile!.bytes).toEqual(profile.bytes)
 const restored=editorReducer(initialEditorState,{type:'restore-project',document:loaded.document})
 expect(restored.proofSettings.targetProfile!.checksum).toBe(profile.checksum)
 expect(restored.proofSettings.targetProfile!.bytes).toEqual(profile.bytes)
})
it('rejects corrupt or future workspace projects and duplicate document identities without partially restoring',async()=>{
 const workspace=createDocumentWorkspace(recorded()),text=await encodeWorkspace(workspace),raw=JSON.parse(text)
 expect(()=>decodeWorkspace('{')).toThrow()
 const future=JSON.parse(text);future.version=99
 expect(()=>decodeWorkspace(JSON.stringify(future))).toThrow(/恢复/)
 raw.documents.push({...raw.documents[0]})
 expect(()=>decodeWorkspace(JSON.stringify(raw))).toThrow(/标识/)
 const projectFuture=JSON.parse(text),project=JSON.parse(projectFuture.documents[0].project)
 project.schemaVersion=99;projectFuture.documents[0].project=JSON.stringify(project)
 expect(()=>decodeWorkspace(JSON.stringify(projectFuture))).toThrow(/新版本/)
 const two=createDocumentWorkspace(recorded()),second=createDocumentWorkspace(recorded()).documents[0]
 two.documents.push(second)
 const restored=decodeWorkspace(await encodeWorkspace(two))
 expect(restored.documents[0].state.conversationRuns![0].documentId).toBe(restored.documents[0].id)
 expect(restored.documents[1].state.conversationRuns![0].documentId).toBe(restored.documents[1].id)
 expect(restored.documents[0].id).not.toBe(restored.documents[1].id)
})
it('normalizes legacy version 1 ICC array data to live Uint8Array without losing its checksum',async()=>{
 const raw=JSON.parse(await encodeProject(initialEditorState,metadata));raw.schemaVersion=1
 const decoded=decodeProject(JSON.stringify(raw)).document
 expect(decoded.colorManagement!.profile.bytes).toBeInstanceOf(Uint8Array)
 expect(decoded.colorManagement!.profile.checksum).toBe(initialEditorState.colorManagement.profile.checksum)
 expect(decoded.colorManagement!.profile.bytes).toEqual(initialEditorState.colorManagement.profile.bytes)
 const objectBytes=JSON.parse(JSON.stringify(raw));objectBytes.document.colorManagement.profile.bytes=Object.fromEntries(Array.from(initialEditorState.colorManagement.profile.bytes).map((byte,index)=>[String(index),byte]))
 expect(decodeProject(JSON.stringify(objectBytes)).document.colorManagement!.profile.bytes).toEqual(initialEditorState.colorManagement.profile.bytes)
 objectBytes.document.colorManagement.profile.bytes.gap=0
 expect(()=>decodeProject(JSON.stringify(objectBytes))).toThrow(/字节/ )
 raw.document.colorManagement.profile.checksum='bad'
 expect(()=>decodeProject(JSON.stringify(raw))).toThrow(/校验和/)
})
