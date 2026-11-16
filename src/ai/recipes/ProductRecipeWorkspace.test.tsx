import { act,fireEvent,render,screen } from '@testing-library/react'
import { expect,it } from 'vitest'
import { EditorProvider,useEditor,type EditorState,type EditorAction } from '../../state/editor'
import { ProductRecipeWorkspace } from './ProductRecipeWorkspace'
import { productFixture } from './productFixture'
import { useDocumentWorkspace } from '../../document/DocumentWorkspaceProvider'
let latest:EditorState,edit:(a:EditorAction)=>void
const fixture=()=>productFixture('data:image/png;base64,aGVsbG8=')
function Probe(){const {state,dispatch}=useEditor(),{newDocument}=useDocumentWorkspace();latest=state;edit=dispatch;return <><button onClick={()=>dispatch({type:'restore-project',document:fixture()})}>准备商品</button><button onClick={()=>newDocument()}>新文档</button><ProductRecipeWorkspace/></>}
function setup(){render(<EditorProvider><Probe/></EditorProvider>);fireEvent.click(screen.getByText('准备商品'));fireEvent.click(screen.getByText('产品抠图与投影'))}
it('renders private preview, cancels without writes, invalidates stale targets and adopts once with whole undo',()=>{
 setup();const before=latest
 fireEvent.click(screen.getByText('预览产品配方'));expect(screen.getByLabelText('产品配方预览')).toBeInTheDocument();expect(latest).toBe(before)
 fireEvent.click(screen.getByText('取消产品配方'));expect(latest).toBe(before)
 fireEvent.click(screen.getByText('产品抠图与投影'));fireEvent.click(screen.getByText('预览产品配方'))
 act(()=>edit({type:'rename-layer',id:'art',name:'manual'}));expect(screen.getByText('采用产品配方')).toBeDisabled()
 fireEvent.click(screen.getByText('预览产品配方'));const manual=latest;fireEvent.click(screen.getByText('采用产品配方'))
 expect(latest.layers).toHaveLength(4);expect(latest.undoStack).toHaveLength(manual.undoStack.length+1)
 act(()=>edit({type:'undo'}));expect(latest.layers).toEqual(manual.layers)
})
it('keeps user-approved soft mask available for manual refine and closes preview on document switch',()=>{
 setup();fireEvent.click(screen.getByText('预览产品配方'));fireEvent.click(screen.getByText('新文档'));expect(screen.queryByLabelText('产品配方预览')).not.toBeInTheDocument();expect(latest.layers).toHaveLength(1)
 fireEvent.click(screen.getByText('准备商品'));fireEvent.click(screen.getByText('产品抠图与投影'));const source=latest.layers[0].source
 fireEvent.click(screen.getByText('手工精修商品蒙版'));expect(latest.activeTool).toBe('mask');expect(latest.layers[0].source).toBe(source);expect(latest.layerMasks.art.selection!.path.type).toBe('raster')
})
it('does not synthesize missing masks and background generation requires the existing explicit generation flow',()=>{
 setup();act(()=>edit({type:'restore-project',document:{...fixture(),layerMasks:{}}}));fireEvent.click(screen.getByText('预览产品配方'));expect(screen.getByRole('alert')).toHaveTextContent('请先接受')
 const before=latest.layers;fireEvent.click(screen.getByText('转到背景生成入口'));expect(latest.composerMode).toBe('generate');expect(latest.isGenerating).toBe(false);expect(latest.layers).toBe(before)
})

import { AIComposer } from '../../creation/AIComposer'
function Entry(){const {dispatch}=useEditor();return <><button onClick={()=>dispatch({type:'restore-project',document:fixture()})}>加载入口商品</button><AIComposer/></>}
it('is reachable from the production AI Composer and creates an actual temporary scene',()=>{
 render(<EditorProvider><Entry/></EditorProvider>);fireEvent.click(screen.getByText('加载入口商品'));fireEvent.click(screen.getByText('产品抠图与投影'));fireEvent.click(screen.getByText('预览产品配方'));expect(screen.getByLabelText('产品配方预览').querySelector('svg')).toBeInTheDocument()
})
