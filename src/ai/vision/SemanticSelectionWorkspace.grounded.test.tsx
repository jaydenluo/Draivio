import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {EditorProvider,useEditor,type EditorState} from '../../state/editor'
import {SemanticSelectionWorkspace,SEMANTIC_SELECTION_EVENT} from './SemanticSelectionWorkspace'
import * as raster from '../../canvas/rasterTools'
import {encodeProject,decodeProject} from '../../document/projectFormat'
import {mapTargetMask} from '../tools/selectionTools'
import {parseSegmentation} from './targetResolver'
const endpoint=process.env.SEMANTIC_LIVE_ENDPOINT
let state:EditorState
function Observe(){const editor=useEditor();state=editor.state;return <><button onClick={()=>editor.dispatch({type:'restore-project',document:{documentWidth:1280,documentHeight:720,documentBackground:'transparent',layers:[{id:'photo',name:'原始双人照片',className:'layer-image',source:'data:image/png;base64,'+readFileSync(process.env.SEMANTIC_CLOTHING_IMAGE!).toString('base64'),contentWidth:1280,contentHeight:720,opacity:100,visible:true,blendMode:'正常'}],selectedLayerId:'photo',selectedLayerIds:['photo'],canvasShapes:[],canvasTexts:[],brushStrokes:[],layerMasks:{},sceneOrder:[],selectionVisible:false}})}>真实照片</button><button onClick={()=>editor.dispatch({type:'undo'})}>撤销语义选区</button><SemanticSelectionWorkspace/></>}
function mount(){
 const bytes=readFileSync(process.env.SEMANTIC_CLOTHING_IMAGE!),image='data:image/png;base64,'+bytes.toString('base64')
 // jsdom has no browser SVG decoder. Only this raster capture boundary is
 // supplied with actual photo bytes; HTTP, model inference, UI/reducer are real.
 vi.spyOn(raster,'rasterizeSvgPixels').mockResolvedValue({width:640,height:360,data:new Uint8ClampedArray(640*360*4)})
 vi.spyOn(raster,'imageToPng').mockReturnValue(image)
 localStorage.removeItem('draivio-semantic-endpoint-v1');render(<EditorProvider><Observe/></EditorProvider>);fireEvent.click(screen.getByText('真实照片'));act(()=>window.dispatchEvent(new Event(SEMANTIC_SELECTION_EVENT)))
 fireEvent.change(screen.getByLabelText('分割服务地址'),{target:{value:endpoint}})
}
function objectQuery(query:string){fireEvent.change(screen.getByLabelText('语义目标'),{target:{value:'object'}});fireEvent.change(screen.getByLabelText('物体描述'),{target:{value:query}});fireEvent.click(screen.getByText('分析目标'))}
afterEach(()=>{vi.restoreAllMocks();localStorage.removeItem('draivio-semantic-endpoint-v1')})
it.skipIf(!endpoint)('uses real text clothing inference in the UI, requires explicit instance choice and maps original coordinates',async()=>{
 mount();const before=state!,image='data:image/png;base64,'+readFileSync(process.env.SEMANTIC_CLOTHING_IMAGE!).toString('base64');objectQuery('衣服')
 const group=await screen.findByRole('group',{name:'对象候选'}, {timeout:60000});const choices=within(group).getAllByRole('button');expect(choices.length).toBeGreaterThanOrEqual(2);expect(screen.getByText('应用为选区')).toBeDisabled();expect(state).toEqual(before)
 fireEvent.click(choices[0]);expect(screen.getByText('应用为选区')).toBeEnabled();fireEvent.click(screen.getByText('应用为选区'));expect(state!.selectionVisible).toBe(true)
 const path=state!.selection.path;expect(path.type).toBe('raster');if(path.type!=='raster')throw new Error('no actual raster mask')
 const response=await fetch(endpoint!,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image,target:'object',query:'衣服'})});expect(response.ok).toBe(true);const actual=parseSegmentation(await response.json());const alpha=actual.candidates[0].alpha
 let mismatches=0;for(let y=0;y<720;y++)for(let x=0;x<1280;x++)if(path.alpha![y*1280+x]!==alpha[Math.floor(y/2)*640+Math.floor(x/2)])mismatches++;expect(mismatches).toBe(0)
 expect(state!.undoStack).toHaveLength(before.undoStack.length+1)
 const restored=decodeProject(await encodeProject(state!,{id:'real-semantic',name:'真实语义分割'}));expect(restored.document.selection).toEqual(state!.selection)
 fireEvent.click(screen.getByText('撤销语义选区'));expect(state!.selectionVisible).toBe(before.selectionVisible)
},120000)
it.skipIf(!endpoint)('real empty text target fails without fabricating a mask or changing document',async()=>{
 mount();const before=state!;objectQuery('elephant');expect(await screen.findByRole('alert',{}, {timeout:60000})).toHaveTextContent(/失败/);expect(screen.getByText('应用为选区')).toBeDisabled();expect(state).toEqual(before)
},90000)
it.skipIf(!endpoint)('cancels a real local inference request and never adopts its late completion',async()=>{
 mount();const before=state!,transport=vi.spyOn(globalThis,'fetch');objectQuery('衣服');await waitFor(()=>expect(transport).toHaveBeenCalled());await screen.findByText('取消分割');fireEvent.click(screen.getByText('取消分割'));expect(screen.getByText('应用为选区')).toBeDisabled();expect(state).toEqual(before)
 await act(async()=>{await fetch(endpoint!,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:'data:image/png;base64,'+readFileSync(process.env.SEMANTIC_CLOTHING_IMAGE!).toString('base64'),target:'object',query:'衣服'})})});expect(screen.queryByRole('group',{name:'对象候选'})).toBeNull();expect(state).toEqual(before)
},90000)
it.skipIf(!process.env.SEMANTIC_REAL_SUBJECT)('maps a real lowresolution subject into rotated/scaled original coordinates with exact complementary feathered background',()=>{
 const result=parseSegmentation(JSON.parse(readFileSync(process.env.SEMANTIC_REAL_SUBJECT!,'utf8'))),candidate=result.candidates[0]
 const mapping={analysisWidth:result.width,analysisHeight:result.height,sourceWidth:1280,sourceHeight:720,documentWidth:1500,documentHeight:1500,matrix:[0,1,-1,0,1000,100] as [number,number,number,number,number,number]}
 const foreground=mapTargetMask(candidate,mapping),background=mapTargetMask(candidate,{...mapping,background:true})
 for(const[x,y]of [[500,300],[500,1000],[900,500]]){const sx=y+.5-100,sy=1000-(x+.5);expect(foreground[y*1500+x]).toBe(candidate.alpha[Math.floor(sy/720*result.height)*result.width+Math.floor(sx/1280*result.width)])}
 for(let i=0;i<foreground.length;i++)if(foreground[i]+background[i]!==255)throw new Error('complement mismatch')
 const feather=mapTargetMask(candidate,{...mapping,feather:3}),featherBackground=mapTargetMask(candidate,{...mapping,feather:3,background:true});expect(feather.some((a,i)=>a!==foreground[i])).toBe(true);for(let i=0;i<feather.length;i++)if(feather[i]+featherBackground[i]!==255)throw new Error('feather complement mismatch')
})
