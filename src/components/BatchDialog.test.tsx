import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { BatchDialog } from './BatchDialog'
const api=vi.hoisted(()=>({chooseBatchInputs:vi.fn(),chooseBatchDirectory:vi.fn(),readBatchInput:vi.fn(),writeBatchOutput:vi.fn(),renderBatchImage:vi.fn()}))
vi.mock('../batch/batchIO',()=>api)
vi.mock('../batch/renderBatchImage',()=>({renderBatchImage:api.renderBatchImage}))
beforeEach(()=>{vi.clearAllMocks();localStorage.removeItem('draivio-batch-recipes-v1');api.chooseBatchInputs.mockResolvedValue([{id:'one',name:'one.png'},{id:'bad',name:'bad.png'}]);api.chooseBatchDirectory.mockResolvedValue({name:'/out',token:'dir'});api.readBatchInput.mockImplementation(async(i)=>{if(i.id==='bad')throw new Error('文件损坏');return new Blob(['image'])});api.renderBatchImage.mockResolvedValue({blob:new Blob(['output'],{type:'image/png'}),width:100,height:50});api.writeBatchOutput.mockResolvedValue('/out/one-batch-001.png');URL.createObjectURL=vi.fn(()=> 'blob:preview');URL.revokeObjectURL=vi.fn()})
it('requires preview and directory, runs actual pipeline, lists partial failure and retries only failure',async()=>{
 render(<BatchDialog onClose={()=>{}}/>);expect(screen.getByRole('button',{name:'开始批量处理'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'添加图片'}));await screen.findByText('2 个输入文件')
 fireEvent.click(screen.getByRole('button',{name:'预览样例'}));await screen.findByAltText('批处理输出预览')
 expect(screen.getByRole('button',{name:'开始批量处理'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'选择输出目录'}));await screen.findByText('/out')
 fireEvent.click(screen.getByRole('button',{name:'开始批量处理'}));await screen.findByText('成功 1 · 失败 1 · 已取消 0')
 expect(screen.getByText('/out/one-batch-001.png')).toBeVisible();expect(screen.getByText('文件损坏')).toBeVisible()
 fireEvent.click(screen.getByRole('button',{name:'仅重试失败项'}));await waitFor(()=>expect(api.readBatchInput).toHaveBeenCalledTimes(4));expect(api.writeBatchOutput).toHaveBeenCalledTimes(1)
})
it('saves and reloads a recipe and invalidates preview after settings change',async()=>{
 render(<BatchDialog onClose={()=>{}}/>);fireEvent.change(screen.getByLabelText('长边像素'),{target:{value:'800'}});fireEvent.change(screen.getByLabelText('配方名称'),{target:{value:'电商'}});fireEvent.click(screen.getByRole('button',{name:'保存配方'}));expect(JSON.parse(localStorage.getItem('draivio-batch-recipes-v1')!)[0].recipe.longEdge).toBe(800)
 fireEvent.change(screen.getByLabelText('长边像素'),{target:{value:'400'}});fireEvent.change(screen.getByLabelText('已保存配方'),{target:{value:'电商'}});expect(screen.getByLabelText('长边像素')).toHaveValue(800)
})
it('invalidates preview after changes and suppresses stale asynchronous previews',async()=>{
 let finish!:(value:{blob:Blob;width:number;height:number})=>void
 api.renderBatchImage.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
 render(<BatchDialog onClose={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'添加图片'}));await screen.findByText('2 个输入文件');fireEvent.click(screen.getByRole('button',{name:'预览样例'}));await waitFor(()=>expect(api.renderBatchImage).toHaveBeenCalledTimes(1))
 fireEvent.change(screen.getByLabelText('长边像素'),{target:{value:'800'}});finish({blob:new Blob(['old']),width:100,height:50});await waitFor(()=>expect(screen.getByRole('button',{name:'预览样例'})).toBeEnabled());expect(screen.queryByAltText('批处理输出预览')).toBeNull();expect(screen.getByRole('button',{name:'开始批量处理'})).toBeDisabled()
})
it('copies a saved document adjustment preset into a reusable recipe without mutating it',async()=>{
 const {createPreset}=await import('../adjustments/presets'),{defaultHsl}=await import('../adjustments/hsl');const hsl=defaultHsl();hsl.global.hue=60;const preset=createPreset('客户品牌',hsl)
 render(<BatchDialog adjustmentPresets={[preset]} onClose={()=>{}}/>);fireEvent.change(screen.getByLabelText('文档调整预设'),{target:{value:'客户品牌'}});fireEvent.click(screen.getByRole('button',{name:'保存配方'}));const saved=JSON.parse(localStorage.getItem('draivio-batch-recipes-v1')!)[0];expect(saved.recipe.adjustmentPreset).toEqual(preset);expect(preset.hsl.global.hue).toBe(60)
})
