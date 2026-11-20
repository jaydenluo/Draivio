import { describe, expect, it } from 'vitest'
import { fitViewportZoom } from './viewportFit'

describe('fitViewportZoom', () => {
  it('reserves the floating composer when fitting a tall document', () => {
    expect(fitViewportZoom({ documentWidth: 500, documentHeight: 625, canvasWidth: 620, canvasHeight: 492, composerHeight: 159 })).toBeCloseTo(44.96, 1)
  })

  it('does not reduce a document that already fits at 100 percent', () => {
    expect(fitViewportZoom({ documentWidth: 500, documentHeight: 625, canvasWidth: 1000, canvasHeight: 900, composerHeight: 159 })).toBe(100)
  })

  it('keeps a usable minimum for an extremely small viewport', () => {
    expect(fitViewportZoom({ documentWidth: 4000, documentHeight: 4000, canvasWidth: 100, canvasHeight: 100, composerHeight: 200 })).toBe(10)
  })
})

it('keeps the same canvas zoom when a floating task history expands above the draft',()=>{
 const base={documentWidth:500,documentHeight:625,canvasWidth:900,canvasHeight:650,composerHeight:160}
 expect(fitViewportZoom({...base,composerHeight:420,composerHistoryHeight:260})).toBe(fitViewportZoom(base))
})
