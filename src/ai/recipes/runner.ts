import { EDIT_TOOL_VERSION } from '../persistence/editRecord'
import { validateEditorRecipeArgs } from './toolValidation'
import type { EditorState } from '../../state/editor'
import { executeEditorCommand,type EditorCommand } from '../tools/editorTools'
import { executeTransaction,editorDocumentFingerprint } from '../execution/transaction'
import { assertRecipeJson,validateRecipe,type Recipe,type RecipeValue,type RecipeTools,type RecipeProvenance } from './schema'
export type RecipeStepRecord = { toolVersion?: number; id: string; tool: string; args: Record<string, RecipeValue>; deterministic: boolean; provenance?: RecipeProvenance }
export type SavedRecipe = { recipe: Recipe; parameters: Record<string, RecipeValue>; bindings: Record<string,string>; records: RecipeStepRecord[] }
const operations = ['move','scale','rotate','flip','opacity','visibility','blend','rename','duplicate','delete','lock','reorder','group','align','distribute','adjustment','filter'] as const
export const editorRecipeTools: RecipeTools = Object.fromEntries(operations.map(op => [op, { deterministic: !['duplicate','group'].includes(op), validate: (state: EditorState,args: Record<string,RecipeValue>) => validateEditorRecipeArgs(op,state,args), execute: (state: EditorState,args: Record<string,RecipeValue>) => ({ state: executeEditorCommand(state, { ...args,op } as EditorCommand) }) }]))
// Structural ID generation is explicitly marked non-deterministic; provenance is supplied locally.
for (const op of ['duplicate','group']) editorRecipeTools[op] = { deterministic: false, validate: (state,args) => validateEditorRecipeArgs(op,state,args), execute: (state,args) => ({state: executeEditorCommand(state,{...args,op} as EditorCommand),provenance:{model:'local-editor',provider:'local',randomness:'generated-object-ids'}}) }
export async function runRecipe(state: EditorState, recipe: Recipe, parameters: Record<string,RecipeValue>,bindings:Record<string,string>,tools:RecipeTools,options:{documentId:string;signal?:AbortSignal;current?:()=>EditorState;currentDocumentId?:()=>string}={documentId:'document'}) {
  const validated=validateRecipe(recipe,parameters,bindings,tools,state),records:RecipeStepRecord[]=[]
  const base=editorDocumentFingerprint(state)
  const result=await executeTransaction(state,{id:`recipe:${recipe.id}:${recipe.version}`,base,steps:validated.ordered.map(step=>({id:step.id,apply:async draft=>{
    if(options.currentDocumentId && options.currentDocumentId()!==options.documentId)throw new Error('配方绑定的文档已切换')
    const args=step.args,tool=tools[step.tool]
    const output=await tool.execute(draft,args,options.signal)
    if(options.currentDocumentId && options.currentDocumentId()!==options.documentId)throw new Error('配方绑定的文档已切换')
    if(!tool.deterministic && (!output.provenance?.model||!output.provenance.provider||!output.provenance.randomness)) throw new Error(`非确定性工具缺少模型和随机性记录：${step.tool}`)
    records.push({toolVersion:EDIT_TOOL_VERSION,id:step.id,tool:step.tool,args,deterministic:tool.deterministic,...(output.provenance?{provenance:output.provenance}:{})})
    return output.state
  }}))},{signal:options.signal,current:options.current})
  return {...result,records,saved:{recipe:validated.recipe,parameters:validated.parameters,bindings:structuredClone(bindings),records} satisfies SavedRecipe}
}
export async function previewRecipe(state:EditorState,recipe:Recipe,parameters:Record<string,RecipeValue>,bindings:Record<string,string>,tools:RecipeTools,options:{signal?:AbortSignal}={}) {
  const result=await runRecipe(state,recipe,parameters,bindings,tools,{documentId:'preview',signal:options.signal})
  if(result.status==='failed')throw result.error
  if(result.status!=='committed')throw new Error(result.status==='cancelled'?'配方已取消':'配方冲突')
  return {...result,state:{...result.state,undoStack:state.undoStack,redoStack:state.redoStack}}
}
export function validateSavedRecipes(value:unknown): asserts value is SavedRecipe[] {
  if(!Array.isArray(value)||value.length>30)throw new Error('配方记录无效或过多')
  for(const item of value){parseSaved(item)}
}
function parseSaved(value:unknown) {
  if(!value||typeof value!=='object')throw new Error('配方记录无效')
  assertRecipeJson(value)
  if(JSON.stringify(value).length>256_000)throw new Error('配方记录过大')
  const v=value as SavedRecipe
  // Validate the full JSON envelope before persistence; no functions/scripts survive.
  if(!v.parameters||!v.bindings||!Array.isArray(v.records))throw new Error('配方记录字段无效')
  for(const record of v.records){if(record?.toolVersion!==undefined&&(!Number.isSafeInteger(record.toolVersion)||record.toolVersion<1))throw new Error('配方工具版本无效');if(!record||typeof record.id!=='string'||typeof record.tool!=='string'||typeof record.deterministic!=='boolean'||!record.args||typeof record.args!=='object'||Array.isArray(record.args))throw new Error('配方步骤记录无效');if(!record.deterministic&&(!record.provenance?.model||!record.provenance.provider||!record.provenance.randomness))throw new Error('配方随机性记录缺失')}
  const fakeState={layers:Object.values(v.bindings).map(id=>({id}))} as EditorState
  validateRecipe(v.recipe,v.parameters,v.bindings,Object.fromEntries(v.recipe.steps.map(s=>[s.tool,{deterministic:true,execute:()=>{throw new Error('validation only')}}])),fakeState,{resourceChecks:false})
}
