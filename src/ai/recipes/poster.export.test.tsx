import {afterEach,it,expect,vi} from 'vitest'
import {cleanup,render,screen,fireEvent} from '@testing-library/react'
import {createCanvas} from 'batch-test-canvas'
import {Resvg} from '@resvg/resvg-js'
import {renderToStaticMarkup} from 'react-dom/server'
import {CanvasScene} from '../../canvas/CanvasScene'
import {EditorProvider,useEditor,type EditorState} from '../../state/editor'
import {AIComposer} from '../../creation/AIComposer'
import {posterPresets} from './poster'
import {encodeProject,decodeProject} from '../../document/projectFormat'
import {validateDocument} from '../../document/projectValidation'
import {writeFileSync,mkdirSync} from 'node:fs'
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals()})
let actual:EditorState
function Observe(){actual=useEditor().state;return null}
for(const metrics of ['fallback','native-fonts'])for(const sample of [{name:'中文',title:'独特输入的长中文海报标题用于验证完整换行与安全边距'}, {name:'宽拉丁',title:'W'.repeat(24)}, {name:'混合',title:'WWW海报MMM全角ＷＷＷ标题é混合'}, {name:'衬线',title:'WM'.repeat(12),font:'serif'}, {name:'等宽',title:'WM'.repeat(12),font:'monospace'}])for(const preset of posterPresets())it(`renders actual production UI-applied ${metrics} ${sample.name} ${preset.name} title/body pixels and roundtrips valid editable layers`,async()=>{
 if(metrics==='native-fonts'){vi.stubGlobal('CanvasRenderingContext2D',function(){});vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockImplementation(()=>createCanvas(1,1).getContext('2d') as unknown as CanvasRenderingContext2D)}
 render(<EditorProvider><AIComposer/><Observe/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'海报排版'}))
 fireEvent.click(screen.getByRole('button',{name:`${preset.name} ${preset.width}×${preset.height}`}))
 if('font' in sample){fireEvent.change(screen.getByLabelText('海报字体'),{target:{value:sample.font}})}
 const title=sample.title,body='真实正文输入与可编辑内容保留'
 fireEvent.change(screen.getByLabelText('海报标题'),{target:{value:title}})
 fireEvent.change(screen.getByLabelText('海报正文'),{target:{value:body}})
 if('font' in sample)fireEvent.click(screen.getByLabelText('确认字体可能回退'))
 fireEvent.click(screen.getByText('预览海报'))
 expect(screen.queryByRole('alert')?.textContent).toBeUndefined()
 expect(screen.getByText('确认应用')).toBeEnabled()
 fireEvent.click(screen.getByText('确认应用'))
 const applied=actual!
 const svg=renderToStaticMarkup(<CanvasScene state={applied} thumbnail/>).replace('<svg ',`<svg width="${preset.width}" height="${preset.height}" `)
 const renderedText=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement.textContent??''
 expect(renderedText).toContain(title);expect(renderedText).toContain(body)
 expect(svg).not.toContain('data-text-overflow="true"')
 for(const text of applied.canvasTexts)expect(applied.layers.find(layer=>layer.id===text.layerId)?.kind).toBe('text')
 const image=new Resvg(svg).render(), pixels=image.pixels
 const without={...applied,canvasTexts:applied.canvasTexts.filter(text=>![title,body].includes(text.text))}
 const baseline=new Resvg(renderToStaticMarkup(<CanvasScene state={without} thumbnail/>).replace('<svg ',`<svg width="${preset.width}" height="${preset.height}" `)).render().pixels
 let changed=0,outsideMargin=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]!==baseline[i]||pixels[i+1]!==baseline[i+1]||pixels[i+2]!==baseline[i+2]||pixels[i+3]!==baseline[i+3]){changed++;const x=(i/4)%preset.width,y=Math.floor(i/4/preset.width);if(x<preset.safeMargin-2||x>preset.width-preset.safeMargin+2||y<preset.safeMargin-2||y>preset.height-preset.safeMargin+2)outsideMargin++}
 expect(changed).toBeGreaterThan(100)
 expect(outsideMargin).toBe(0)
 const restored=decodeProject(await encodeProject(applied,{id:'poster',name:preset.name}))
 expect((restored.document.canvasTexts??[]).map(t=>t.text)).toContain(title)
 expect(()=>validateDocument({...applied,...restored.document})).not.toThrow()
 if(process.env.POSTER_EVIDENCE_DIR){mkdirSync(process.env.POSTER_EVIDENCE_DIR,{recursive:true});writeFileSync(`${process.env.POSTER_EVIDENCE_DIR}/${metrics}-${sample.name}-${preset.name}.png`,image.asPng());writeFileSync(`${process.env.POSTER_EVIDENCE_DIR}/${metrics}-${sample.name}-${preset.name}.json`,JSON.stringify({titleRendered:renderedText.includes(title),bodyRendered:renderedText.includes(body),changedTextPixels:changed,outsideMargin,fontFamily:applied.canvasTexts.at(-2)?.fontFamily,textLayerIds:applied.canvasTexts.map(t=>t.layerId)}))}
},30_000)
