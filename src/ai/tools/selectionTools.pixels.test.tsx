import { expect,it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { MaskDefinitions } from '../../canvas/MaskOverlay'
import { maskSelection } from './selectionTools'
it('exports real fractional hair/glass alpha instead of a binary silhouette',()=>{const selection=maskSelection(new Uint8Array([0,64,128,255]),4,1);const defs=renderToStaticMarkup(<defs>{MaskDefinitions({selection,strokes:[],inverted:false,applied:true},'s',4,1)}</defs>);const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="40" height="10" viewBox="0 0 4 1">${defs}<rect width="4" height="1" fill="white" mask="url(#s)"/></svg>`;const pixels=new Resvg(svg).render().pixels;expect([pixels[(5*40+5)*4+3],pixels[(5*40+15)*4+3],pixels[(5*40+25)*4+3],pixels[(5*40+35)*4+3]]).toEqual([0,64,128,255])})
