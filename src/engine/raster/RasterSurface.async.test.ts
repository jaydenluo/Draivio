import {expect,it} from 'vitest'
import {RasterSurface} from './RasterSurface'
import {solidImage} from './composite'
it('async composite uses real scheduler pixels and releases intermediate output',async()=>{
 const layer={image:solidImage(12,8,[10,20,30,255])},surface=RasterSurface.blank(12,8)
 await surface.compositeAsync([layer]);expect(surface.toImage()).toEqual(layer.image)
})
it('clear during async computation prevents stale raster overwrite',async()=>{
 const surface=RasterSurface.blank(64,64)
 const pending=surface.compositeAsync([{image:solidImage(64,64,[10,20,30,255])}],{chunkRows:1})
 surface.clear()
 await expect(pending).rejects.toThrow('更改');expect(surface.toImage().data.every(v=>v===0)).toBe(true)
})
