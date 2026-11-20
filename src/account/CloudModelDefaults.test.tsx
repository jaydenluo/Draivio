import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { cloudAccount, type CloudAccountSnapshot, type CloudModel } from './cloudAccount'
import { EditorProvider, useEditor } from '../state/editor'
import { useAssistantModel } from '../creation/useAssistantModel'
import { saveComposerPreferences } from '../creation/composerPreferences'

const custom={id:'private',provider:'OpenAI',name:'个人',baseUrl:'https://fixture.invalid/v1',apiKey:'fixture-only',protocol:'openai_compatible',enabled:true,models:['gpt-4o','gpt-image-2']}
const model=(code:string,modality:'image'|'text'|'video',isDefault=false,available=true)=>({id:code,code,displayName:`显示 ${code}`,modality,capabilities:[modality],constraints:{},isDefault,availability:{available}})
const catalog=[model('image-first','image'),model('text-first','text'),model('image-offline','image',true,false),model('image-default','image',true),model('text-default','text',true),model('video-default','video',true)]
let editor:ReturnType<typeof useEditor>, assistant:ReturnType<typeof useAssistantModel>
function Probe(){editor=useEditor();assistant=useAssistantModel();return <><output aria-label="image">{editor.state.composerSourceId}:{editor.state.composerParameters.model}</output><output aria-label="text">{assistant.selected?.sourceId}:{assistant.selected?.model}</output></>}
function setup(models:CloudModel[]=catalog){
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([custom]))
 saveComposerPreferences({sourceId:'private',model:'gpt-image-2'})
 localStorage.setItem('draivio-assistant-selection-v1',JSON.stringify({sourceId:'private',model:'gpt-4o'}))
 let snapshot:CloudAccountSnapshot={authenticated:false,user:null,balance:null,models:[]}
 const listeners=new Set<()=>void>()
 vi.spyOn(cloudAccount,'getSnapshot').mockImplementation(()=>snapshot)
 vi.spyOn(cloudAccount,'subscribe').mockImplementation(listener=>{listeners.add(listener);return()=>{listeners.delete(listener)}})
 const publish=(next:Partial<CloudAccountSnapshot>)=>act(()=>{snapshot={...snapshot,...next};listeners.forEach(listener=>listener())})
 const login=()=>publish({authenticated:true,user:{email:'fixture@example.test'},balance:10,models})
 return {publish,login}
}
afterEach(()=>vi.restoreAllMocks())

test('login chooses available official defaults by output purpose instead of the saved API models',()=>{
 const {login}=setup();render(<EditorProvider><Probe/></EditorProvider>)
 expect(screen.getByLabelText('image')).toHaveTextContent('private:gpt-image-2')
 const undoCount=editor.state.undoStack.length
 login()
 expect(screen.getByLabelText('image')).toHaveTextContent('draivio-cloud:显示 image-default')
 expect(screen.getByLabelText('text')).toHaveTextContent('draivio-cloud:text-default')
 expect(editor.state.undoStack).toHaveLength(undoCount)
 expect(JSON.parse(localStorage.getItem('draivio-assistant-selection-v1')!)).toEqual({sourceId:'draivio-cloud',model:'text-default'})
})
test('balance/catalog refresh preserves manual API choices, while a new login selects cloud defaults again',()=>{
 const {login,publish}=setup();render(<EditorProvider><Probe/></EditorProvider>);login()
 act(()=>{editor.dispatch({type:'set-composer-source',sourceId:'private'});editor.dispatch({type:'set-composer-parameter',parameter:'model',value:'gpt-image-2'});assistant.choose({sourceId:'private',model:'gpt-4o'})})
 publish({balance:99,models:catalog.map(m=>({...m}))})
 expect(screen.getByLabelText('image')).toHaveTextContent('private:gpt-image-2')
 expect(screen.getByLabelText('text')).toHaveTextContent('private:gpt-4o')
 publish({authenticated:false,user:null,models:[]})
 login()
 expect(screen.getByLabelText('image')).toHaveTextContent('draivio-cloud:显示 image-default')
 expect(screen.getByLabelText('text')).toHaveTextContent('draivio-cloud:text-default')
})
test('falls back to the first available same-purpose model and does not invent a missing image model',()=>{
 const {login}=setup([model('text-only','text')]);render(<EditorProvider><Probe/></EditorProvider>);login()
 expect(screen.getByLabelText('image')).toHaveTextContent('private:gpt-image-2')
 expect(screen.getByLabelText('text')).toHaveTextContent('draivio-cloud:text-only')
})
test('applies late catalog defaults once and preserves the unavailable cloud selection after logout',()=>{
 const {login,publish}=setup([]);render(<EditorProvider><Probe/></EditorProvider>);login()
 publish({models:catalog})
 expect(screen.getByLabelText('image')).toHaveTextContent('draivio-cloud:显示 image-default')
 expect(screen.getByLabelText('text')).toHaveTextContent('draivio-cloud:text-default')
 publish({authenticated:false,user:null,models:[]})
 expect(screen.getByLabelText('image')).toHaveTextContent('draivio-cloud:显示 image-default')
 expect(assistant.selected).toBeUndefined()
 expect(assistant.label).toBe('推理模型不可用')
})


test('restored authentication selects cloud models once and keeps later edits across child remounts',()=>{
 const {login,publish}=setup();login()
 const view=render(<EditorProvider><Probe/></EditorProvider>)
 expect(screen.getByLabelText('image')).toHaveTextContent('draivio-cloud:显示 image-default')
 act(()=>assistant.choose({sourceId:'private',model:'gpt-4o'}))
 view.rerender(<EditorProvider><Probe key="remounted"/></EditorProvider>)
 publish({balance:9})
 expect(screen.getByLabelText('text')).toHaveTextContent('private:gpt-4o')
})
