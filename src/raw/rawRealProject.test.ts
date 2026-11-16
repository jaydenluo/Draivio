import {it,expect} from 'vitest'
import {readFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {initialEditorState,editorReducer} from '../state/editor'
import {encodeProject,decodeProject} from '../document/projectFormat'
it.runIf(!!process.env.DRAIVIO_RAW_PROJECT_FIXTURE)('saves real decoded NEF bytes and 16-bit asset offline through production action and restores exactly',async()=>{
 const {record,result}=JSON.parse(readFileSync(process.env.DRAIVIO_RAW_PROJECT_FIXTURE!,'utf8'))
 const state={...structuredClone(initialEditorState),layers:[],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[],artboards:[{...initialEditorState.artboards[0],layerIds:[]}]}
 const imported=editorReducer(state,{type:'apply-raw',id:'real-nef',name:'Nikon D2H',record,asset:result.asset,preview:result.preview,replace:false,expectedState:state})
 const text=await encodeProject(imported,{id:'real-nef-project',name:'真实RAW离线恢复'},async()=>{throw new Error('offline only')});const restored=decodeProject(text).document
 expect(restored.layers[0].rawSource).toEqual(record);expect(restored.layers[0].highPrecision).toEqual(result.asset);expect(restored.artboards?.[0].layerIds).toContain('real-nef')
 expect(createHash('sha256').update(Uint8Array.from(restored.layers[0].rawSource!.bytes)).digest('hex')).toBe(record.checksum)
 const reopened={...imported,...restored};const changed=editorReducer(reopened,{type:'apply-raw',id:'real-nef',name:'r',record:{...record,settings:{...record.settings,exposureEV:1}},asset:result.asset,preview:result.preview,replace:true,expectedState:reopened})
 expect(changed.layers[0].rawSource?.settings.exposureEV).toBe(1);expect(editorReducer(changed,{type:'undo'}).layers[0].rawSource?.settings.exposureEV).toBe(0)
},30000)
