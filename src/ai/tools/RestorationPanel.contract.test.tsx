import {ResultStage} from '../../creation/ResultStage'
import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {RestorationPanel} from './RestorationPanel'
import {MessageHost} from '../../components/MessageHost'
import {ResultsPanel} from '../../layers/ResultsPanel'
import {EditorProvider,useEditor,initialEditorState,type EditorState} from '../../state/editor'
import * as pixelIO from '../maskedEdit/workflow'
import {testMaskedIO} from '../maskedEdit/testIO'
import {encodeProject,decodeProject} from '../../document/projectFormat'
const image={width:225,height:4,data:new Uint8ClampedArray(225*4*4)}
for(let i=0;i<image.data.length;i+=4)image.data.set([30,50,70,255],i)
const source=testMaskedIO.encode(image)
let current:EditorState
function Harness(){const {state,dispatch}=useEditor();current=state;return <>
 <button onClick={()=>dispatch({type:'restore-project',document:{...structuredClone(initialEditorState),documentWidth:225,documentHeight:4,layers:[{id:'photo',name:'original portrait',className:'layer-art',kind:'image',source,visible:true,opacity:100,blendMode:'正常'}],selectedLayerId:'photo',selectedLayerIds:['photo'],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[],layerMasks:{},aiResults:[]}})}>prepare original</button>
 <button onClick={()=>dispatch({type:'rename-layer',id:'photo',name:'changed during inference'})}>change content</button>
 <button onClick={()=>dispatch({type:'undo'})}>undo adoption</button>
 <RestorationPanel/><ResultsPanel/><ResultStage/><MessageHost/>
 </>}
function mount(){vi.spyOn(pixelIO,'decodePixels').mockImplementation(testMaskedIO.decode);vi.spyOn(pixelIO,'encodePixels').mockImplementation(testMaskedIO.encode);render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('prepare original'))}
// These fixed RGBA responses exercise transport/tile assembly, not learned model quality.
function reply(body:any,value=100){const width=body.image.width*body.scale,height=body.image.height*body.scale,data=[];for(let i=0;i<width*height;i++)data.push(value,60,80,255);return new Response(JSON.stringify({width,height,data}),{status:200})}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
it('runs production tiles through partial failure, manual retry, candidate preview, adoption/undo and offline project recovery',async()=>{
 const bodies:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_url,options)=>{const body=JSON.parse(options.body);bodies.push(body);return bodies.length===2?new Response('{}',{status:507}):reply(body)}))
 mount();const original=structuredClone(current!),undo=current!.undoStack.length,redo=structuredClone(current!.redoStack)
 expect(screen.getByText(/ESPCN 不提供去模糊/)).toBeInTheDocument()
 fireEvent.click(screen.getByText('开始超分 2x'))
 await screen.findByText(/修复后端显存或内存不足/)
 await waitFor(()=>expect(screen.getByText('开始超分 2x')).toBeEnabled())
 expect(bodies).toHaveLength(2);expect(bodies.map(b=>b.image.width)).toEqual([225,17])
 expect(current!.layers).toEqual(original.layers);expect(current!.aiResults).toHaveLength(0);expect(current!.undoStack).toHaveLength(undo);expect(current!.redoStack).toEqual(redo)
 fireEvent.click(screen.getByText('开始超分 2x'))
 await waitFor(()=>expect(current!.aiResults).toHaveLength(1))
 expect(bodies).toHaveLength(4);for(const body of bodies)expect(body).toMatchObject({protocol:'draivio-restoration-v1',model:'espcn',mode:'size',scale:2})
 const result=current!.aiResults[0],pixels=await testMaskedIO.decode(result.source!)
 expect(pixels).toMatchObject({width:450,height:8});for(let i=0;i<pixels.data.length;i+=4)expect(Array.from(pixels.data.subarray(i,i+4))).toEqual([100,60,80,255])
 expect(current!.layers).toEqual(original.layers);expect(current!.undoStack).toHaveLength(undo);expect(current!.redoStack).toEqual(redo)
 fireEvent.click(screen.getByRole('button',{name:`预览结果 ${result.id}`}));expect(screen.getByRole('region',{name:'生成结果预览'})).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'返回作品'}))
 const candidateProject=await encodeProject(current!,{id:'restore',name:'offline candidate'}),candidate=decodeProject(candidateProject).document
 expect(candidate.aiResults?.[0].request?.reference?.source).toBe(source);expect(candidate.aiResults?.[0].source).toBe(result.source)
 fireEvent.click(screen.getByRole('button',{name:`预览结果 ${result.id}`}));fireEvent.click(screen.getByRole('button',{name:'更多结果操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'添加到当前作品'}))
 expect(current!.layers).toHaveLength(2);expect(current!.layers[0]).toMatchObject({contentWidth:450,contentHeight:8,source:result.source});expect(current!.layers.find(l=>l.id==='photo')?.source).toBe(source);expect(current!.undoStack).toHaveLength(undo+1)
 const adopted=decodeProject(await encodeProject(current!,{id:'restore',name:'offline adopted'})).document
 expect(adopted.layers[0].source).toBe(result.source);expect((await testMaskedIO.decode(adopted.layers[0].source!)).data).toEqual(pixels.data)
 fireEvent.click(screen.getByText('undo adoption'));expect(current!.layers).toEqual(original.layers);expect(current!.aiResults[0].adopted).toBe(false)
 // Saving and opening embedded sources required no network requests beyond the4 tile calls.
 expect(bodies).toHaveLength(4)
})
it('discards cancelled late transport output and stale document results without candidate or content mutation',async()=>{
 let finish:(response:Response)=>void=()=>{},pending:any
 const fetch=vi.fn(async(_url,options)=>{pending=JSON.parse(options.body);return new Promise<Response>(resolve=>{finish=resolve})});vi.stubGlobal('fetch',fetch)
 mount();const original=structuredClone(current!),undo=current!.undoStack.length
 fireEvent.click(screen.getByText('开始超分 2x'));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(1))
 fireEvent.click(screen.getByText('取消增强'));await act(async()=>finish(reply(pending)))
 expect(current!.aiResults).toHaveLength(0);expect(current!.layers).toEqual(original.layers);expect(current!.undoStack).toHaveLength(undo)
 // Second run completes both actual tiles after an intervening content edit.
 fetch.mockImplementation(async(_url,options)=>{const body=JSON.parse(options.body);if(fetch.mock.calls.length===2){pending=body;return new Promise<Response>(resolve=>{finish=resolve})}return reply(body)})
 fireEvent.click(screen.getByText('开始超分 2x'));await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));fireEvent.click(screen.getByText('change content'));const edited=structuredClone(current!.layers),editUndo=current!.undoStack.length
 await act(async()=>finish(reply(pending)))
 await screen.findByText('文档或目标已更改，增强结果已放弃')
 expect(fetch).toHaveBeenCalledTimes(3);expect(current!.aiResults).toHaveLength(0);expect(current!.layers).toEqual(edited);expect(current!.undoStack).toHaveLength(editUndo)
})
