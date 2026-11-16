import {expect,it,vi,afterEach} from 'vitest'
import {createRasterComposite,solidImage} from './composite'
afterEach(()=>vi.restoreAllMocks())
it('stops real compositing within the current range when its time budget expires and resumes without lost pixels',()=>{
 const source=solidImage(128,128,[27,63,92,255]),session=createRasterComposite(128,128,[{image:source}])
 let clock=0
 vi.spyOn(performance,'now').mockImplementation(()=>clock+=5)
 const stopped=session.compositeRange(0,0,128*128,8)
 expect(stopped).toBeGreaterThan(0)
 expect(stopped).toBeLessThanOrEqual(4096)
 expect(session.image.data.slice(0,stopped*4)).toEqual(source.data.slice(0,stopped*4))
 expect(session.image.data.slice(stopped*4).every(value=>value===0)).toBe(true)
 session.compositeRange(0,stopped,128*128)
 expect(session.image.data).toEqual(source.data)
})
