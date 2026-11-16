import type {EditablePath} from './pathGeometry'
export type BooleanMode='union'|'difference'|'intersect'|'exclude'
export type BooleanShape={left:EditablePath;right:EditablePath;mode:BooleanMode;sourceIds?:[string,string]}
export function booleanShape(left:EditablePath,right:EditablePath,mode:BooleanMode):BooleanShape{return {left,right,mode}}
export function booleanToSvg(shape:BooleanShape){const op=shape.mode==='difference'?'difference':shape.mode;return { ...shape, operation:op, editableSources:[shape.left,shape.right] as const }}
import {pathSelection,selectionContains} from '../canvas/selectionGeometry'
export function booleanContains(shape:BooleanShape,point:{x:number;y:number}){const contains=(p:EditablePath)=>selectionContains(pathSelection({kind:'bezier',anchors:p.anchors,closed:p.closed}).path,point);const a=contains(shape.left),b=contains(shape.right);return shape.mode==='union'?a||b:shape.mode==='difference'?a&&!b:shape.mode==='intersect'?a&&b:a!==b}
