import { expect, it } from 'vitest'
import { createSelection } from '../canvas/selectionGeometry'
import { selectionMaskForLayer } from './PropertiesPanel'

it('maps ellipse coverage through a rotated parent instead of using a source AABB', () => {
 const parent:any={id:'group',name:'g',className:'g',kind:'group',visible:true,opacity:100,blendMode:'正常',children:['layer'],transform:{kind:'transform',rect:{x:20,y:10,width:60,height:70},rotation:25,flipX:false,flipY:false}}
 const layer:any={id:'layer',name:'l',className:'l',visible:true,opacity:100,blendMode:'正常',groupId:'group',contentWidth:100,contentHeight:100}
 const selection=createSelection('ellipse',{x:25,y:25,width:50,height:50})
 const mask=selectionMaskForLayer(selection,layer,[parent,layer],100,100,10,10)
 expect(mask.some(v=>v===0)).toBe(true); expect(mask.some(v=>v===255)).toBe(true)
})
