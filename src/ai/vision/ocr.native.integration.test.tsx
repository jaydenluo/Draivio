import {it,expect} from 'vitest'
import {readFileSync,writeFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {createCanvas,loadImage} from 'batch-test-canvas'
import {Resvg} from '@resvg/resvg-js'
import {renderToStaticMarkup} from 'react-dom/server'
import {CanvasScene} from '../../canvas/CanvasScene'
import {encodeProject,decodeProject} from '../../document/projectFormat'
import {defaultProfile} from '../../color/iccPipeline'
import {initialEditorState,editorReducer} from '../../state/editor'
import {contentRevision} from '../context/editorContext'
import {parseNativeOcr} from './nativeOcr'
import {ocrRepairOptions} from './ocrRepair'
import {contentFill} from '../../retouch/contentFill'
import {repairDeltaPixels,repairCoveragePath} from '../../retouch/cloneHeal'
import {createTextReplacementPlan,textReplacementDocument} from '../workflows/replaceText'
const dir=process.env.OCR_EVIDENCE_DIR
it.skipIf(!dir)('performs real native OCR, pixel repair and editable replacement on original fixture',async()=>{
 const source=readFileSync(`${dir}/before.png`),recognition=JSON.parse(execFileSync(`${dir}/ocr-helper`,[],{input:source,timeout:30000}).toString()),candidates=parseNativeOcr(recognition,'base'),candidate=candidates.find(c=>c.text==='¥99')!
 expect(candidate).toBeTruthy();const img=await loadImage(source),canvas=createCanvas(img.width,img.height),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);const rgba=ctx.getImageData(0,0,img.width,img.height),image={width:img.width,height:img.height,data:new Uint8ClampedArray(rgba.data)}
 const options=ocrRepairOptions(image,candidates,candidate.id),filled=await contentFill(image,{...options,timeoutMs:30000}),delta=repairDeltaPixels(image,filled.image),repair=createCanvas(img.width,img.height),rc=repair.getContext('2d'),rd=rc.createImageData(img.width,img.height);rd.data.set(delta.data);rc.putImageData(rd,0,0)
 expect(filled.metadata.changedPixels).toBeGreaterThan(0)
 for(let i=0;i<options.target.length;i++)if(!options.target[i]||options.protect[i])expect(Array.from(filled.image.data.slice(i*4,i*4+4))).toEqual(Array.from(image.data.slice(i*4,i*4+4)))
 const state={...structuredClone(initialEditorState),documentWidth:img.width,documentHeight:img.height,artboards:[{id:'board-1',name:'poster',layerIds:['base'],x:0,y:0,width:img.width,height:img.height,background:'transparent'}],layers:[{id:'base',name:'Original authored poster',className:'layer-art',source:`data:image/png;base64,${source.toString('base64')}`,visible:true,opacity:100,blendMode:'正常'}],selectedLayerId:'base',selectedLayerIds:['base'],canvasTexts:[],canvasShapes:[],brushStrokes:[],sceneOrder:[],undoStack:[],redoStack:[]}
 const plan=createTextReplacementPlan(state,{query:candidate.text,replacement:'¥129',candidateId:candidate.id,confirmLowConfidence:true,fontFamily:'sans-serif',repairSource:repair.toDataURL('image/png'),repairCoverage:repairCoveragePath(image,filled.image),baseContentRevision:contentRevision(state)},candidates),next=textReplacementDocument(state,plan)
 expect(next.canvasTexts[0].text).toBe('¥129');expect(next.layers).toHaveLength(3)
 const final=editorReducer(state,{type:'apply-edit-plan',document:next});expect(final.documentWidth).toBe(img.width);expect(editorReducer(final,{type:'undo'}).layers).toEqual(state.layers)
 const reopened=decodeProject(await encodeProject({...final,colorManagement:{...final.colorManagement,profile:defaultProfile('srgb')}},{id:'native-ocr',name:'Native OCR'}));expect(reopened.document.canvasTexts).toEqual(final.canvasTexts);expect(reopened.document.layers.map(l=>l.source)).toEqual(final.layers.map(l=>l.source));
 const output=new Resvg(renderToStaticMarkup(<CanvasScene state={final} thumbnail/>).replace('<svg ',`<svg width="${img.width}" height="${img.height}" `),{font:{loadSystemFonts:true}}).render().asPng();writeFileSync(`${dir}/after.png`,output);writeFileSync(`${dir}/repair.png`,repair.toBuffer('image/png'));writeFileSync(`${dir}/repair-metadata.json`,JSON.stringify({native:recognition,repair:filled.metadata,candidateId:candidate.id,sourcePreserved:true,oneUndo:true,cost:0},null,2))
 const tilted=candidates.find(c=>c.text==='倾斜中文')!,tiltedFill=await contentFill(image,{...ocrRepairOptions(image,candidates,tilted.id),timeoutMs:30000})
 const td=repairDeltaPixels(image,tiltedFill.image),tc=createCanvas(img.width,img.height),tctx=tc.getContext('2d'),ti=tctx.createImageData(img.width,img.height);ti.data.set(td.data);tctx.putImageData(ti,0,0)
 const tp=createTextReplacementPlan(state,{query:tilted.text,replacement:'替换中文',candidateId:tilted.id,fontFamily:'PingFang SC',confirmFontFallback:true,repairSource:tc.toDataURL('image/png'),repairCoverage:repairCoveragePath(image,tiltedFill.image)},candidates),tn=textReplacementDocument(state,tp)
 expect(tn.canvasTexts[0].rotation).toBeLessThan(-5);expect(tn.canvasTexts[0].rotation).toBeGreaterThan(-10)
 writeFileSync(`${dir}/after-tilted.png`,new Resvg(renderToStaticMarkup(<CanvasScene state={tn} thumbnail/>).replace('<svg ',`<svg width="${img.width}" height="${img.height}" `),{font:{loadSystemFonts:true}}).render().asPng())
 writeFileSync(`${dir}/tilted-metadata.json`,JSON.stringify({quad:tilted.quad,confidence:tilted.confidence,rotation:tn.canvasTexts[0].rotation,repair:tiltedFill.metadata,cost:0},null,2))

},60000)
