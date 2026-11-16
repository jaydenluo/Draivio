import {act,fireEvent,render,screen} from '@testing-library/react'
import {it,expect,vi,afterEach} from 'vitest'
import {EditorProvider,useEditor} from '../../state/editor'
import {OcrWorkspace} from './OcrWorkspace'
import * as capture from './ocrCapture'
import * as native from './nativeOcr'
import * as fill from '../../retouch/contentFill'
import * as raster from '../../canvas/rasterTools'
import {encodeProject,decodeProject} from '../../document/projectFormat'
import {defaultProfile} from '../../color/iccPipeline'
function Harness(){const {state,dispatch}=useEditor();return <><button onClick={()=>dispatch({type:'create-text-layer',object:{id:'unknown-font-text',layerId:'unknown-font-layer',x:0,y:0,text:'missing',fontFamily:'DefinitelyNotInstalledOCRFamily',fontSize:14,fontWeight:'400',color:'#000000',align:'left'}})}>未知字体文字</button><button onClick={()=>dispatch({type:'restore-project',document:{documentWidth:40,documentHeight:20,artboards:[{id:"board-1",name:"test",layerIds:["source"],x:0,y:0,width:40,height:20,background:"transparent"}],documentBackground:'transparent',layers:[{id:'source',name:'source',className:'layer-image',source:'data:image/png;base64,actual',contentWidth:40,contentHeight:20,opacity:100,visible:true,blendMode:'正常'}],selectedLayerId:'source',selectedLayerIds:['source'],canvasTexts:[],canvasShapes:[],brushStrokes:[],layerMasks:{},sceneOrder:[],selectionVisible:false}})}>图像</button><button onClick={()=>dispatch({type:'undo'})}>撤销</button><button onClick={()=>dispatch({type:'rename-layer',id:'source',name:'changed'})}>更改</button><output data-testid="state">{JSON.stringify(state)}</output><OcrWorkspace/></>}
const current=()=>JSON.parse(screen.getByTestId('state').textContent!)
function setup(){const before={width:40,height:20,data:new Uint8ClampedArray(3200).fill(255)},after={...before,data:before.data.slice()};after.data[4]=10;vi.spyOn(capture,'captureOcrImage').mockResolvedValue(before);vi.spyOn(raster,'imageToPng').mockReturnValue('data:image/png;base64,pixels');vi.spyOn(fill,'contentFill').mockResolvedValue({image:after,metadata:{method:'local-context-patch-v1',targetPixels:20,donorPixels:780,protectedPixels:0,changedPixels:1,elapsedMs:1}});vi.spyOn(native,'recognizeNativeText').mockResolvedValue(['a','b'].map(id=>({id,text:'99',confidence:.3,sourceLayerId:'source',quad:[{x:2,y:2},{x:10,y:2},{x:10,y:6},{x:2,y:6}]})));render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('图像'));fireEvent.click(screen.getByText('识字与文字替换'));return current()}
afterEach(()=>{vi.restoreAllMocks();delete (document as unknown as {fonts?:unknown}).fonts})
it('requires a position, low-confidence confirmation and repair preview; commits once and roundtrips',async()=>{const before=setup();await act(async()=>fireEvent.click(screen.getByText('识别当前图层')));expect(current()).toEqual(before);expect(screen.getByText('预览文字修补')).toBeDisabled();fireEvent.click(screen.getByText(/99 · a/));expect(screen.getByText('预览文字修补')).toBeDisabled();fireEvent.click(screen.getByLabelText('我已核对低置信度文字和位置'));fireEvent.change(screen.getByLabelText('替换文字'),{target:{value:'129'}});await act(async()=>fireEvent.click(screen.getByText('预览文字修补')));expect(current()).toEqual(before);fireEvent.click(screen.getByText('确认替换'));const next=current();expect(next.layers).toHaveLength(3);expect(next.canvasTexts[0].text).toBe('129');expect(next.undoStack).toHaveLength(1);const restored=decodeProject(await encodeProject({...next,colorManagement:{...next.colorManagement,profile:defaultProfile('srgb')}},{id:'ocr',name:'OCR'}));expect(restored.document.canvasTexts).toEqual(next.canvasTexts);expect(restored.document.layers.some(l=>l.className==='layer-repair')).toBe(true);fireEvent.click(screen.getByText('撤销'));expect(current().layers).toEqual(before.layers)})
it('refuses a stale recognition result before any pixel repair or document write',async()=>{setup();await act(async()=>fireEvent.click(screen.getByText('识别当前图层')));fireEvent.click(screen.getByText(/99 · a/));fireEvent.click(screen.getByLabelText('我已核对低置信度文字和位置'));fireEvent.click(screen.getByText('更改'));const before=current();await act(async()=>fireEvent.click(screen.getByText('预览文字修补')));expect(screen.getByRole('alert')).toHaveTextContent('更改');expect(fill.contentFill).not.toHaveBeenCalled();expect(current()).toEqual(before)})
it('discards cancelled native completion and failed repair without history changes',async()=>{const before=setup();let resolve!:(value:Awaited<ReturnType<typeof native.recognizeNativeText>>)=>void;vi.mocked(native.recognizeNativeText).mockImplementationOnce(()=>new Promise(done=>{resolve=done}));fireEvent.click(screen.getByText('识别当前图层'));await act(async()=>{});fireEvent.click(screen.getByText('停止处理'));await act(async()=>resolve([{id:'late',text:'late',confidence:1,quad:[{x:1,y:1},{x:8,y:1},{x:8,y:5},{x:1,y:5}]}]));expect(screen.queryByText(/late ·/)).not.toBeInTheDocument();expect(current()).toEqual(before);await act(async()=>fireEvent.click(screen.getByText('识别当前图层')));fireEvent.click(screen.getByText(/99 · a/));fireEvent.click(screen.getByLabelText('我已核对低置信度文字和位置'));vi.mocked(fill.contentFill).mockRejectedValueOnce(new Error('真实修补失败'));await act(async()=>fireEvent.click(screen.getByText('预览文字修补')));expect(screen.getByRole('alert')).toHaveTextContent('修补失败');expect(screen.getByText('确认替换')).toBeDisabled();expect(current()).toEqual(before)})
it('never trusts fonts.check true for an unknown original font; confirmation resets on font, target and cancellation',async()=>{
 setup();Object.defineProperty(document,'fonts',{configurable:true,value:{check:vi.fn(()=>true)}})
 fireEvent.click(screen.getByText('取消'))
 // Add an editable text object through the real reducer using the harness below.
 fireEvent.click(screen.getByText('未知字体文字'));fireEvent.click(screen.getByText('识字与文字替换'))
 fireEvent.change(screen.getByLabelText('已有文字层'),{target:{value:'unknown-font-text'}})
 expect(screen.getByText('预览文字替换')).toBeDisabled()
 expect(document.fonts.check).not.toHaveBeenCalled()
 fireEvent.click(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体'))
 await act(async()=>fireEvent.click(screen.getByText('预览文字替换')))
 expect(screen.getByText('确认替换')).toBeEnabled()
 fireEvent.change(screen.getByLabelText('替代字体'),{target:{value:'serif'}})
 expect(screen.getByText('确认替换')).toBeDisabled()
 fireEvent.change(screen.getByLabelText('替代字体'),{target:{value:'DefinitelyNotInstalledOCRFamily'}})
 expect(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体')).not.toBeChecked()
 expect(screen.getByText('预览文字替换')).toBeDisabled()
 fireEvent.click(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体'))
 fireEvent.click(screen.getByText('取消'));fireEvent.click(screen.getByText('识字与文字替换'))
 fireEvent.change(screen.getByLabelText('已有文字层'),{target:{value:'unknown-font-text'}})
 expect(screen.getByText('预览文字替换')).toBeDisabled()
})
it('requires explicit unverified substitution acknowledgement for OCR preset even when fonts.check succeeds',async()=>{
 setup();Object.defineProperty(document,'fonts',{configurable:true,value:{check:vi.fn(()=>true)}})
 await act(async()=>fireEvent.click(screen.getByText('识别当前图层')))
 fireEvent.click(screen.getByText(/99 · a/));fireEvent.click(screen.getByLabelText('我已核对低置信度文字和位置'))
 fireEvent.change(screen.getByLabelText('替代字体'),{target:{value:'Noto Sans SC'}})
 expect(screen.getByText('预览文字修补')).toBeDisabled()
 expect(document.fonts.check).not.toHaveBeenCalled()
 fireEvent.click(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体'))
 await act(async()=>fireEvent.click(screen.getByText('预览文字修补')))
 expect(screen.getByText('确认替换')).toBeEnabled()
 fireEvent.click(screen.getByText('更改'))
 expect(screen.getByText('确认替换')).toBeDisabled()
 expect(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体')).not.toBeChecked()
 fireEvent.click(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体'))
 fireEvent.change(screen.getByLabelText('替代字体'),{target:{value:'Inter'}})
 expect(screen.getByText('确认替换')).toBeDisabled()
 expect(screen.getByLabelText('我确认此字体未验证且可能回退为系统字体')).not.toBeChecked()
 expect(screen.getByText('预览文字修补')).toBeDisabled()
})
