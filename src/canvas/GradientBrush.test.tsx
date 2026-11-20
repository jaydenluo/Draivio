import {fireEvent,render,screen} from '@testing-library/react'
import {renderToStaticMarkup} from 'react-dom/server'
import {Resvg} from '@resvg/resvg-js'
import {expect,it,vi} from 'vitest'
import {AppShell} from '../app/AppShell'
import {EditorProvider,useEditor,type EditorState} from '../state/editor'
import {BrushScene} from './BrushScene'
import {createBrushStroke} from './BrushEngine'
import {paintBrushStroke} from './rasterBrush'
import {encodeProject,decodeProject} from '../document/projectFormat'
let latest:EditorState
function Probe(){const {state,dispatch}=useEditor();latest=state;return <><button onClick={()=>{dispatch({type:'set-brush-color',color:'#ff0000'});dispatch({type:'set-tool-options',options:{gradientEndColor:'#0000ff',smoothing:0}})}}>准备渐变颜色</button><button onClick={()=>dispatch({type:'commit-layer-transform',layerId:'art',transform:{kind:'transform',rect:{x:10,y:20,width:50,height:50},rotation:0,flipX:false,flipY:false}})}>准备变换图层</button><button onClick={()=>dispatch({type:'undo'})}>撤销渐变笔迹</button></>}
const settings={size:8,hardness:100,opacity:100,flow:100,smoothing:0,color:'#ff0000',endColor:'#0000ff'}
const stroke=()=>({...createBrushStroke('gradient','paint','art',{x:10,y:50},settings),points:[{x:10,y:50},{x:90,y:50}]})
it('captures gradient end color in live previews and committed strokes with undo',()=>{
 const view=render(<EditorProvider><AppShell/><Probe/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'打开工具组菜单：画笔'}));fireEvent.click(screen.getByRole('menuitem',{name:'渐变画笔'}));fireEvent.click(screen.getByText('准备渐变颜色'))
 vi.spyOn(view.container.querySelector('.artboard')!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:500,height:625,right:500,bottom:625,x:0,y:0,toJSON(){}})
 const canvas=screen.getByLabelText('画布交互层'),before=latest.undoStack.length
 fireEvent.pointerDown(canvas,{pointerId:41,clientX:100,clientY:250,buttons:1});fireEvent.pointerMove(canvas,{pointerId:41,clientX:400,clientY:250,buttons:1})
 expect(view.container.querySelector('.canvas-art .brush-stroke linearGradient stop:last-child')).toHaveAttribute('stop-color','#0000ff')
 fireEvent.pointerUp(canvas,{pointerId:41,clientX:400,clientY:250})
 expect(latest.brushStrokes.at(-1)).toMatchObject({color:'#ff0000',endColor:'#0000ff'})
 expect(latest.undoStack).toHaveLength(before+1)
 fireEvent.click(screen.getByText('撤销渐变笔迹'));expect(latest.brushStrokes).toHaveLength(0)
})
it('renders different start, middle and end colors in real SVG pixels',()=>{
 const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><BrushScene strokes={[stroke()]} width={100} height={40}/></svg>)
 const pixels=new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels
 const at=(x:number)=>[...pixels.slice((20*100+x)*4,(20*100+x)*4+4)]
 expect(at(15)[0]).toBeGreaterThan(220);expect(at(15)[2]).toBeLessThan(30)
 expect(at(85)[2]).toBeGreaterThan(220);expect(at(85)[0]).toBeLessThan(30)
 expect(at(50)[0]).toBeGreaterThan(100);expect(at(50)[2]).toBeGreaterThan(100)
})
it('rasterizes gradient colors while respecting selections and source immutability',()=>{
 const image={width:100,height:40,data:new Uint8ClampedArray(16000)},mask=new Uint8Array(4000);mask.fill(255);mask[20*100+50]=0
 const result=paintBrushStroke(image,stroke(),mask),at=(x:number)=>[...result.data.slice((20*100+x)*4,(20*100+x)*4+4)]
 expect(at(15)[0]).toBeGreaterThan(220);expect(at(85)[2]).toBeGreaterThan(220);expect(at(50)[3]).toBe(0)
 expect(image.data.every(n=>n===0)).toBe(true)
})
it('preserves gradient colors on project save/load',async()=>{
 render(<EditorProvider><Probe/></EditorProvider>)
 const state={...latest,brushStrokes:[stroke()],sceneOrder:['gradient']}
 const restored=decodeProject(await encodeProject(state,{id:'gradient-doc',name:'渐变测试'}))
 expect(restored.document.brushStrokes?.[0]).toMatchObject({color:'#ff0000',endColor:'#0000ff'})
})
it('keeps single dabs and legacy strokes solid and gives closed strokes a valid gradient axis',()=>{
 const renderStroke=(value:ReturnType<typeof stroke>)=>renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg"><BrushScene strokes={[value]} width={100} height={40}/></svg>)
 expect(renderStroke({...stroke(),points:[{x:10,y:50}]})).not.toContain('linearGradient')
 expect(renderStroke({...stroke(),endColor:undefined})).not.toContain('linearGradient')
 const closed=renderStroke({...stroke(),points:[{x:10,y:50},{x:90,y:50},{x:10,y:50}]})
 expect(closed).toContain('x1="10"');expect(closed).toContain('x2="90"')
 expect(renderStroke({...stroke(),mode:'erase'})).not.toContain('linearGradient')
})
it('keeps vertical gradient colors distinct in SVG output',()=>{
 const value={...stroke(),points:[{x:50,y:10},{x:50,y:90}]}
 const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="40" height="100"><BrushScene strokes={[value]} width={40} height={100}/></svg>)
 const p=new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels
 expect(p[(15*40+20)*4]).toBeGreaterThan(220);expect(p[(85*40+20)*4+2]).toBeGreaterThan(220)
})

it('maps gradient brush gestures into transformed layer coordinates',()=>{
 const view=render(<EditorProvider><AppShell/><Probe/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'打开工具组菜单：画笔'}));fireEvent.click(screen.getByRole('menuitem',{name:'渐变画笔'}))
 fireEvent.click(screen.getByText('准备渐变颜色'));fireEvent.click(screen.getByText('准备变换图层'))
 vi.spyOn(view.container.querySelector('.artboard')!,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:500,height:625,right:500,bottom:625,x:0,y:0,toJSON(){}})
 const canvas=screen.getByLabelText('画布交互层')
 fireEvent.pointerDown(canvas,{pointerId:42,clientX:150,clientY:250,buttons:1});fireEvent.pointerMove(canvas,{pointerId:42,clientX:250,clientY:250,buttons:1});fireEvent.pointerUp(canvas,{pointerId:42,clientX:250,clientY:250})
 expect(latest.brushStrokes.at(-1)?.points[0]).toMatchObject({x:40,y:40})
 expect(latest.brushStrokes.at(-1)?.points.at(-1)?.x).toBeCloseTo(80)
})
