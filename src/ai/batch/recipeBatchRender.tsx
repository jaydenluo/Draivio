import {renderToStaticMarkup} from 'react-dom/server'
import {CanvasScene} from '../../canvas/CanvasScene'
import {initialEditorState,type EditorState} from '../../state/editor'
import {readBatchInput,imageHeaderSize} from '../../batch/batchIO'
import type {BatchInput} from '../../batch/batchProcessor'
import {runRecipe,editorRecipeTools} from '../recipes/runner'
import {exportSvgImage} from '../../render/exportImage'
import type {RecipeBatchConfig} from './recipeBatch'
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('配方批处理已取消','AbortError')}
export async function createRecipeInputDocument(input:BatchInput,signal?:AbortSignal):Promise<EditorState>{
 check(signal);const blob=await readBatchInput(input),bytes=new Uint8Array(await blob.arrayBuffer()),{width,height}=imageHeaderSize(bytes);check(signal)
 let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192))
 const mime=bytes[0]===137?'image/png':bytes[0]===255?'image/jpeg':'image/webp',layerId='recipe-input'
 return {...structuredClone(initialEditorState),documentWidth:width,documentHeight:height,documentBackground:'transparent',colorModel:'rgb',cmykRaster:undefined,aiRecovery:undefined,savedRecipes:[],conversationRuns:[],proofSettings:{...initialEditorState.proofSettings,enabled:false},layers:[{id:layerId,name:input.name,className:'layer-art',source:`data:${mime};base64,${btoa(binary)}`,contentWidth:width,contentHeight:height,visible:true,opacity:100,blendMode:'正常'}],selectedLayerId:layerId,selectedLayerIds:[layerId],artboards:[{id:'recipe-board',name:input.name,x:0,y:0,width,height,background:'transparent',layerIds:[layerId]}],activeArtboardId:'recipe-board',canvasTexts:[],canvasShapes:[],brushStrokes:[],layerMasks:{},smartObjectSources:{},aiResults:[],sceneOrder:[],undoStack:[],redoStack:[],history:[],selectionVisible:false,cropRect:null}
}
export type RecipeRenderDependencies={render?:(svg:string,state:EditorState,signal:AbortSignal)=>Promise<Blob>}
export async function processRecipeBatchInput(input:BatchInput,config:RecipeBatchConfig,signal:AbortSignal,deps:RecipeRenderDependencies={}):Promise<Blob>{
 // Provider tools are not installed: reject them before reading or charging anything.
 if(config.recipe.steps.some(s=>!Object.hasOwn(editorRecipeTools,s.tool)))throw new Error('批量配方仅支持已注册本地工具；未接入模型收费调用')
 const state=await createRecipeInputDocument(input,signal),documentId=`recipe-file:${input.id}:${crypto.randomUUID()}`
 const result=await runRecipe(state,config.recipe,config.parameters,{[config.inputSlot]:state.selectedLayerId},editorRecipeTools,{documentId,signal,current:()=>state,currentDocumentId:()=>documentId})
 if(result.status!=='committed')throw result.status==='failed'?result.error:new Error('配方已取消或文档冲突')
 check(signal);const svg=renderToStaticMarkup(<CanvasScene state={result.state} thumbnail/>).replace('<svg ',`<svg width="${result.state.documentWidth}" height="${result.state.documentHeight}" `)
 const blob=await(deps.render??((source,document,abort)=>exportSvgImage(source,{format:'png',width:document.documentWidth,height:document.documentHeight,profile:document.colorManagement.profile},{signal:abort})))(svg,result.state,signal)
 check(signal);if(blob.type!=='image/png'||!blob.size)throw new Error('配方PNG编码失败');return blob
}
