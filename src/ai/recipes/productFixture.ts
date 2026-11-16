import { initialEditorState,type EditorState } from '../../state/editor'
import { maskSelection } from '../tools/selectionTools'
/** Fixed RGBA/alpha contract fixture: bottle label, hole, and a translucent window.
 * Used only by tests and artifact generation, never as a production cutout. */
export function productFixture(source:string):EditorState{
 const width=48,height=48,b=structuredClone(initialEditorState)
 b.documentWidth=width;b.documentHeight=height;b.documentBackground='transparent';b.layers=[{id:'art',name:'瓶身与玻璃固定样例',className:'layer-art',visible:true,opacity:100,blendMode:'正常',source,contentWidth:width,contentHeight:height}];b.canvasTexts=[];b.canvasShapes=[];b.brushStrokes=[];b.sceneOrder=[];b.aiResults=[];b.smartObjectSources={};b.undoStack=[];b.redoStack=[];b.selectedLayerId='art';b.selectedLayerIds=['art'];b.selectionVisible=false
 const alpha=new Uint8Array(width*height)
 for(let y=5;y<38;y++)for(let x=12;x<36;x++)alpha[y*width+x]=x>=28&&y>=22&&y<32?128:x>=18&&x<23&&y>=28&&y<33?0:255
 b.layerMasks={art:{selection:maskSelection(alpha,width,height),strokes:[],inverted:false,applied:true}};b.artboards=[{id:'board',name:'产品',x:0,y:0,width,height,background:'transparent',layerIds:['art']}];b.activeArtboardId='board'
 return b
}
