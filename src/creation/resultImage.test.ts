import {afterEach,expect,it,vi} from 'vitest'
import {copyResultImage,resultImageData} from './resultImage'
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
afterEach(()=>vi.unstubAllGlobals())
it('copies actual PNG bytes to the clipboard without rendering a preview',async()=>{
 const write=vi.fn().mockResolvedValue(undefined)
 vi.stubGlobal('navigator',{clipboard:{write}})
 vi.stubGlobal('ClipboardItem',class {constructor(public data:Record<string,Blob>){}})
 await copyResultImage(png)
 const blob=write.mock.calls[0][0][0].data['image/png'] as Blob
 expect(blob.type).toBe('image/png');expect(blob.size).toBe(resultImageData(png).bytes.length)
})
it('reports clipboard failure instead of pretending copying succeeded',async()=>{
 vi.stubGlobal('navigator',{clipboard:{write:vi.fn().mockRejectedValue(new Error('权限拒绝'))}})
 vi.stubGlobal('ClipboardItem',class {})
 await expect(copyResultImage(png)).rejects.toThrow('权限拒绝')
 vi.stubGlobal('navigator',{})
 await expect(copyResultImage(png)).rejects.toThrow('不支持复制图片')
})
