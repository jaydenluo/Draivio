import {expect,it} from 'vitest'
import {createCanvas} from 'batch-test-canvas'
import {renderToStaticMarkup} from 'react-dom/server'
import {Resvg} from '@resvg/resvg-js'
import {CanvasScene} from '../../canvas/CanvasScene'
import {initialEditorState,editorReducer,type EditorState} from '../../state/editor'
import {solidImage} from '../../engine/raster/composite'
import type {PixelImage} from '../../canvas/rasterTools'
import {createSelection} from '../../canvas/selectionGeometry'
import {capturePortraitRegions,createPortraitCandidate,adoptPortraitCandidate} from './portraitWorkflow'
import {defaultPortraitSettings} from './portrait'
import {encodeProject,decodeProject} from '../../document/projectFormat'
const encode=(image:PixelImage)=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d'),frame=ctx.createImageData(image.width,image.height);frame.data.set(image.data);ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png')}
const raster=(state:EditorState)=>new Resvg(renderToStaticMarkup(<CanvasScene state={state} thumbnail/>).replace('<svg ',`<svg width="${state.documentWidth}" height="${state.documentHeight}" `)).render().pixels
it('keeps existing foreground over portrait snapshots in global and multi-board order, project reopen and undo',async()=>{
 const portrait=solidImage(32,32,[120,90,70,255]),foreground=solidImage(32,32,[0,40,240,0])
 for(let y=0;y<32;y++)for(let x=0;x<16;x++)foreground.data[(y*32+x)*4+3]=255
 const layer=(id:string,image:PixelImage)=>({id,name:id,kind:'image' as const,className:'layer-art',visible:true,opacity:100,blendMode:'正常',source:encode(image)})
 const original:EditorState={...structuredClone(initialEditorState),documentWidth:32,documentHeight:32,documentBackground:'transparent',layers:[layer('foreground',foreground),layer('portrait',portrait),layer('background',solidImage(32,32,[0,255,0,255])),layer('other-board',solidImage(32,32,[255,0,0,255]))],selectedLayerId:'portrait',selectedLayerIds:['portrait'],canvasTexts:[],canvasShapes:[],brushStrokes:[],sceneOrder:[],layerMasks:{},activeArtboardId:'main',artboards:[{id:'main',name:'main',x:0,y:0,width:32,height:32,background:'transparent',layerIds:['foreground','portrait','background']},{id:'other',name:'other',x:0,y:0,width:32,height:32,background:'transparent',layerIds:['other-board']}]}
 const ellipse=(x:number,y:number,w:number,h:number)=>createSelection('ellipse',{x,y,width:w,height:h})
 const masks={confirmed:true,person:ellipse(0,0,100,100),skin:ellipse(20,20,60,60),eyes:ellipse(25,30,50,10)}
 const candidate=await createPortraitCandidate(original,'doc',capturePortraitRegions(original,'doc',masks),{...defaultPortraitSettings(),skinTone:5},{io:{decode:async()=>structuredClone(portrait),encode}})
 const adopted=adoptPortraitCandidate(candidate,original,'doc'),before=raster(original),after=raster(adopted)
 for(let y=0;y<32;y++)for(let x=0;x<16;x++){const offset=(y*32+x)*4;expect(Array.from(after.slice(offset,offset+4))).toEqual(Array.from(before.slice(offset,offset+4)))}
 expect(adopted.layers[0].id).toBe('foreground')
 const final=adopted.selectedLayerId,global=adopted.layers.map(l=>l.id),board=adopted.artboards[0].layerIds
 expect(global.indexOf(final)).toBe(1);expect(board.indexOf(final)).toBe(1)
 expect(global.indexOf('portrait')).toBeGreaterThan(global.indexOf(final));expect(board.indexOf('portrait')).toBeGreaterThan(board.indexOf(final))
 expect(adopted.artboards[1]).toEqual(original.artboards[1])
 const reopened=editorReducer(original,{type:'restore-project',document:decodeProject(await encodeProject(adopted,{id:'occlusion',name:'occlusion'})).document})
 expect(Buffer.from(raster(reopened)).equals(Buffer.from(after))).toBe(true)
 expect(Buffer.from(raster(editorReducer(adopted,{type:'undo'}))).equals(Buffer.from(before))).toBe(true)
})
