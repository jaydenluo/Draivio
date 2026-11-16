import { expect, it, vi } from 'vitest'
import { graphemeSegments, wrapParagraphLines, shiftTextRunRanges } from './paragraphLayout'
it('keeps emoji ZWJ and combining marks intact while wrapping',()=>{const text='👩‍👩‍👧‍👦e\u0301中';expect(graphemeSegments(text)).toEqual(['👩‍👩‍👧‍👦','e\u0301','中']);expect(wrapParagraphLines(text,6,10,0)).toEqual(['👩‍👩‍👧‍👦','e\u0301','中'])})
it('shifts local style ranges when text is inserted or removed',()=>{expect(shiftTextRunRanges([{start:2,end:5,color:'red'}],0,0,2)).toEqual([{start:4,end:7,color:'red'}]);expect(shiftTextRunRanges([{start:2,end:5,color:'red'}],3,1,0)).toEqual([{start:2,end:4,color:'red'}])})

it('uses the SVG font family and weight with whole-line ink metrics when canvas is available',()=>{
 const calls:string[]=[],context={font:'',measureText:(value:string)=>{calls.push(value);return {width:value==='WW'?18:value.length*9,actualBoundingBoxLeft:0,actualBoundingBoxRight:value==='WW'?24:value.length*9}}}
 vi.stubGlobal('CanvasRenderingContext2D',function(){})
 const spy=vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
 try{
  expect(wrapParagraphLines('WW',22,10,0,{fontFamily:'serif',fontWeight:'700'})).toEqual(['W','W'])
  expect(context.font).toBe('700 10px serif, sans-serif');expect(calls).toContain('WW')
  expect(wrapParagraphLines('ii',20,10,2,{fontFamily:'monospace',fontWeight:'400'})).toEqual(['i','i'])
  expect(context.font).toBe('400 10px monospace, sans-serif')
 }finally{spy.mockRestore();vi.unstubAllGlobals()}
})
it('uses conservative widths for wide Latin and unshaped emoji without splitting a grapheme',()=>{
 expect(wrapParagraphLines('WWWW',30,10,0)).toEqual(['WW','WW'])
 expect(wrapParagraphLines('👩‍👩‍👧‍👦W',55,10,0)).toEqual(['👩‍👩‍👧‍👦','W'])
})
