import {expect,it} from 'vitest'
import {initialEditorState} from '../state/editor'
import {layerEffectBounds} from './layerEffectBounds'
it('aligns a gradient with shape content and follows its layer transform even when locked',()=>{
 const state={...initialEditorState,documentWidth:100,documentHeight:100,layers:[{...initialEditorState.layers[0],source:undefined,locked:true,transform:{kind:'transform' as const,rect:{x:10,y:20,width:50,height:50},rotation:0,flipX:false,flipY:false}}],canvasTexts:[],brushStrokes:[],canvasShapes:[{id:'s',layerId:'art',kind:'rectangle' as const,rect:{x:20,y:20,width:40,height:40},color:'#fff000',opacity:100,strokeWidth:0}]}
 expect(layerEffectBounds(state,'art')).toEqual({x:20,y:30,width:20,height:20})
})
