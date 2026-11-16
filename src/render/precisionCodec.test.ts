import { beforeEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { decodePrecisionFile, encodePrecisionFile } from './precisionCodec'
import { packPrecisionAsset, unpackPrecisionAsset } from './precisionAsset'
import { createPixelBuffer } from './pixelBuffer'
vi.mock('@tauri-apps/api/core',()=>({isTauri:()=>true,invoke:vi.fn()}))
beforeEach(()=>vi.mocked(invoke).mockReset())
it('preserves already encoded native16 originals and transfers linear16 exports before encoding',async()=>{
 vi.mocked(invoke).mockResolvedValue('AA==')
 const srgb=packPrecisionAsset(createPixelBuffer(1,1,'rgba16',[32768,32768,32768,65535]),'srgb')
 await encodePrecisionFile(srgb,'png16')
 expect(vi.mocked(invoke).mock.calls[0][1]).toEqual({raster:srgb,codec:'png16'})
 await encodePrecisionFile({...srgb,encoding:'linear'},'tiff16')
 const raster=(vi.mocked(invoke).mock.calls[1][1] as {raster:typeof srgb}).raster
 expect(raster.encoding).toBe('srgb');expect(unpackPrecisionAsset(raster).data[0]).toBeCloseTo(48192,0)
})
it('rejects oversized file before reading transport bytes and keeps native encoding metadata',async()=>{
 const arrayBuffer=vi.fn()
 await expect(decodePrecisionFile({size:33*1024*1024,arrayBuffer} as never,'png16')).rejects.toThrow(/预算/)
 expect(arrayBuffer).not.toHaveBeenCalled();expect(invoke).not.toHaveBeenCalled()
 const asset=packPrecisionAsset(createPixelBuffer(1,1,'rgba16',[32768,0,0,65535]),'srgb')
 vi.mocked(invoke).mockResolvedValue(asset)
 const result=await decodePrecisionFile({size:1,arrayBuffer:async()=>new Uint8Array([0]).buffer} as never,'png16')
 expect(result.encoding).toBe('srgb');expect(result.data).toBe(asset.data)
})
