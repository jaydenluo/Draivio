import { expect,it } from 'vitest'
import { expansionFromAnchor, expansionFromEdges, tilePlan, expandedPixels, outpaintMask } from './geometry'
it('anchors four-sided and asymmetric expansion at integer physical pixels',()=>{
 expect(expansionFromAnchor(3,2,8,7,'center')).toEqual({width:8,height:7,originalWidth:3,originalHeight:2,x:2,y:2})
 expect(expansionFromAnchor(3,2,8,7,'bottom-right').x).toBe(5)
 expect(expansionFromEdges(3,2,{left:1,right:4,top:2,bottom:3})).toEqual({width:8,height:7,originalWidth:3,originalHeight:2,x:1,y:2})
 expect(()=>expansionFromAnchor(3,2,2,7,'center')).toThrow()
})
it('tiles arbitrary aspect within endpoint maximum, covering every exterior pixel',()=>{
 const e=expansionFromEdges(70,50,{left:100,right:80,top:70,bottom:120}),tiles=tilePlan(e,128,16)
 expect(tiles.length).toBeGreaterThan(1)
 const covered=new Uint8Array(e.width*e.height)
 for(const tile of tiles){expect(tile.width).toBeLessThanOrEqual(128);expect(tile.height).toBeLessThanOrEqual(128);for(let y=tile.y;y<tile.y+tile.height;y++)for(let x=tile.x;x<tile.x+tile.width;x++)covered[y*e.width+x]=255}
 outpaintMask(e).forEach((v,i)=>{if(v)expect(covered[i]).toBe(255)})
})
it('pastes original RGBA without stretching or filling original transparent pixels',()=>{
 const original={width:2,height:1,data:new Uint8ClampedArray([1,2,3,255,4,5,6,0])},e=expansionFromEdges(2,1,{left:1,right:2,top:1,bottom:1}),image=expandedPixels(original,e),mask=outpaintMask(e)
 expect([...image.data.slice((e.width+1)*4,(e.width+3)*4)]).toEqual([...original.data])
 expect(mask[e.width+1]).toBe(0);expect(mask[e.width+2]).toBe(0);expect(mask[0]).toBe(255)
})

it('covers all nine anchors and single-edge expansions without moving protected pixels',()=>{
 for(const anchor of ['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'] as const){const e=expansionFromAnchor(3,2,8,7,anchor);expect(e.x).toBeGreaterThanOrEqual(0);expect(e.y).toBeGreaterThanOrEqual(0);expect(e.x+3).toBeLessThanOrEqual(8);expect(e.y+2).toBeLessThanOrEqual(7);expect(outpaintMask(e).filter(v=>!v)).toHaveLength(6)}
 for(const edge of ['left','right','top','bottom'] as const){const edges={left:0,right:0,top:0,bottom:0,[edge]:3};const e=expansionFromEdges(3,2,edges);expect(outpaintMask(e).filter(Boolean).length).toBe(e.width*e.height-6)}
})
