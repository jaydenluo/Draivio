import {it,expect} from 'vitest'
import {rulerTicks,visibleGridLines} from './rulers'
it.each([25,100,400])('ruler ticks follow pan/zoom and retain legible screen spacing at %s%%',zoomPercent=>{
 const ticks=rulerTicks({zoomPercent,originPx:-73,viewportPx:800})
 expect(ticks.length).toBeGreaterThan(10);expect(ticks.length).toBeLessThan(200)
 for(const tick of ticks){expect(tick.screen).toBeCloseTo(tick.value*zoomPercent/100-73);expect(tick.screen).toBeGreaterThanOrEqual(0);expect(tick.screen).toBeLessThanOrEqual(800)}
 const majors=ticks.filter((t:any)=>t.major);expect(majors[1].screen-majors[0].screen).toBeGreaterThanOrEqual(50)
})
it('enumerates visible grid lines only and coarsens dense grids within an explicit output budget',()=>{
 const lines=visibleGridLines({view:{x:-30,y:15,width:100,height:60},spacingX:20,spacingY:10,originX:2,originY:3})
 expect(lines.x).toEqual([-18,2,22,42,62]);expect(lines.y).toEqual([23,33,43,53,63,73]);expect(lines.stepX).toBe(20)
 const dense=visibleGridLines({view:{x:0,y:0,width:1e7,height:1e7},spacingX:.01,spacingY:.01,maxLines:100})
 expect(dense.x.length+dense.y.length).toBeLessThanOrEqual(100);expect(dense.stepX).toBeGreaterThan(.01)
 expect(()=>rulerTicks({zoomPercent:0,originPx:0,viewportPx:800})).toThrow()
 expect(()=>visibleGridLines({view:{x:0,y:0,width:100,height:100},spacingX:0,spacingY:1})).toThrow()
})
