import {describe,it,expect} from 'vitest'
import {planPoster,posterPresets,type PosterContent} from './poster'
const content:PosterContent={title:'这是一个非常长的中文标题用于测试海报安全边距与溢出',body:'正文内容\n第二行',fontFamily:'sans-serif',fontAvailable:true,logo:{sourceLayerId:'logo',source:'data:image/png;base64,logo',protected:true},image:{sourceLayerId:'photo',source:'data:image/png;base64,photo',protected:true}}
describe('poster planner',()=>{
 it('creates editable text records for portrait square landscape without truncation',()=>{const plans=posterPresets().map(p=>planPoster(content,p));expect(plans.map(p=>[p.width,p.height])).toEqual([[1080,1350],[1080,1080],[1350,1080]]);for(const plan of plans){expect(plan.texts.every(t=>t.text.length>0)).toBe(true);expect(plan.overflow).toEqual([]);expect(plan.texts.every(t=>t.width!>0&&t.height!>0)).toBe(true)}})
 it('rejects missing fonts and reports unsafe long text instead of truncating',()=>{expect(()=>planPoster({...content,fontAvailable:false},posterPresets()[0])).toThrow('字体');expect(()=>planPoster({...content,title:'x'.repeat(1000)}, {width:120,height:120,name:'tiny',safeMargin:20})).toThrow('溢出')})
 it('keeps logo/source protection and does not rasterize exact text',()=>{const p=planPoster(content,posterPresets()[0]);expect(p.protectedSources).toEqual([{layerId:'logo',source:content.logo?.source,reason:'logo-protected'},{layerId:'photo',source:content.image?.source,reason:'source-protected'}]);expect(p.texts.map(t=>t.text)).toContain(content.title);expect(p.generatedTextPixels).toBe(false)})
 it('rejects unsafe margin and unsupported dimensions',()=>{expect(()=>planPoster(content,{width:100,height:100,name:'bad',safeMargin:60})).toThrow('安全边距');expect(()=>planPoster(content,{width:0,height:100,name:'bad',safeMargin:10})).toThrow('尺寸');expect(()=>planPoster(content,{width:20000,height:100,name:'bad',safeMargin:10})).toThrow('尺寸')})
})
it('rejects unverified emoji glyphs instead of claiming replacement boxes are correct exports',()=>{
 expect(()=>planPoster({title:'👩‍👩‍👧‍👦',body:'',fontFamily:'sans-serif'},{name:'narrow',width:120,height:1200,safeMargin:35})).toThrow(/尚未验证导出字形/)
})
it('rejects a single Latin glyph wider than an extremely narrow safe text area',()=>{
 expect(()=>planPoster({title:'W',body:'',fontFamily:'sans-serif'},{name:'narrow',width:80,height:1200,safeMargin:30})).toThrow(/字形宽度溢出/)
})
