import {expect,it} from 'vitest'
import {createCanvas,loadImage} from 'batch-test-canvas'
import {createHash} from 'node:crypto'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
import {renderToStaticMarkup} from 'react-dom/server'
import {Resvg} from '@resvg/resvg-js'
import {CanvasScene} from '../../canvas/CanvasScene'
import {processPortrait,portraitMaskPixels,defaultPortraitSettings,type PortraitMasks} from './portrait'
import {capturePortraitRegions,createPortraitCandidate,adoptPortraitCandidate} from './portraitWorkflow'
import {initialEditorState,editorReducer,type EditorState} from '../../state/editor'
import {createSelection,combineSelection,type Selection} from '../../canvas/selectionGeometry'
import type {PixelImage} from '../../canvas/rasterTools'
import {encodeProject,decodeProject} from '../../document/projectFormat'
const ellipse=(x:number,y:number,w:number,h:number)=>createSelection('ellipse',{x,y,width:w,height:h})
const polygon=(points:number[][]):Selection=>({kind:'path',mode:'new',rect:{x:0,y:0,width:100,height:100},path:{type:'path',d:`M${points.map(p=>p.join(' ')).join('L')}Z`,points:points.map(([x,y])=>({x,y}))},feather:0,fixedRatio:null})
const examples=[
 {id:'portrait-a',file:'portrait-a.jpg',photo:'photo-1506794778202-cad84cf45f1d',note:'Beard, dark background, directional warm light; human skin-tone label not inferred.',person:[[20,12],[74,12],[80,45],[65,66],[34,66],[22,46]],skin:[[29,19],[63,17],[71,28],[68,42],[60,49],[36,49],[27,34]],eyes:[[36,29],[54,29]],protect:[28,38,43,15]},
 {id:'portrait-b',file:'portrait-b.jpg',photo:'photo-1531123897727-8f129e1688ce',note:'Dark complexion appearance, outdoor colored background; human review still pending.',person:[[15,9],[74,9],[89,42],[76,64],[40,70],[18,52]],skin:[[34,16],[68,13],[80,28],[85,43],[72,58],[43,60],[28,40]],eyes:[[46,33],[73,33]],protect:[50,45,29,12]},
 {id:'portrait-c',file:'portrait-c.jpg',photo:'photo-1500648767791-00dcc994a43e',note:'Cool gray background, subtle facial hair and fine skin texture; human skin-tone label not inferred.',person:[[19,10],[72,10],[82,42],[67,65],[38,65],[21,44]],skin:[[30,17],[63,16],[73,31],[70,43],[56,54],[34,45],[26,32]],eyes:[[36,32],[57,32]],protect:[34,43,35,12]},
]
function masks(e:typeof examples[number]):PortraitMasks{return {confirmed:true,person:polygon(e.person),skin:polygon(e.skin),eyes:combineSelection(ellipse(e.eyes[0][0],e.eyes[0][1],12,4),ellipse(e.eyes[1][0],e.eyes[1][1],12,4),'add'),protect:ellipse(...e.protect as [number,number,number,number])}}
const encode=(image:PixelImage)=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d'),frame=ctx.createImageData(image.width,image.height);frame.data.set(image.data);ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png')}
const decode=async(source:string)=>{const image=await loadImage(source),canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data}}
function state(source:string,width:number,height:number):EditorState{return {...structuredClone(initialEditorState),documentWidth:width,documentHeight:height,documentBackground:'transparent',layers:[{id:'portrait',name:'real photo',kind:'image',className:'layer-art',source,visible:true,opacity:100,blendMode:'正常'}],canvasTexts:[],canvasShapes:[],brushStrokes:[],sceneOrder:[],layerMasks:{},selectedLayerId:'portrait',selectedLayerIds:['portrait'],artboards:[{id:'p',name:'portrait',x:0,y:0,width,height,background:'transparent',layerIds:['portrait']}],activeArtboardId:'p'}}
const raster=(state:EditorState)=>new Resvg(renderToStaticMarkup(<CanvasScene state={state} thumbnail/>).replace('<svg ',`<svg width="${state.documentWidth}" height="${state.documentHeight}" `)).render()
function texture(image:PixelImage,skin:Uint8Array){let energy=0,count=0;for(let y=1;y<image.height-1;y++)for(let x=1;x<image.width-1;x++){const i=y*image.width+x;if(skin[i]!==255||skin[i-1]!==255||skin[i+1]!==255||skin[i-image.width]!==255||skin[i+image.width]!==255)continue;for(let c=0;c<3;c++){energy+=Math.abs(4*image.data[i*4+c]-image.data[(i-1)*4+c]-image.data[(i+1)*4+c]-image.data[(i-image.width)*4+c]-image.data[(i+image.width)*4+c]);count++}}return {energy,count,mean:count?energy/count:0}}
it('writes actual licensed-photo evidence and quantifies fixed geometry, protected regions, texture and scene/project/undo parity',async()=>{
 const directory=process.env.PORTRAIT_EVIDENCE_DIR,rows=[]
 for(const example of examples){
  const raw=readFileSync(`docs/evidence/portrait/originals/${example.file}`),originalImage=await loadImage(raw),canvas=createCanvas(384,576),ctx=canvas.getContext('2d')
  // Explicitly prepare a 384x576 working copy once; the recipe's before/after
  // input is this identical decoded copy, never a hidden recipe resample.
  ctx.drawImage(originalImage,0,0,384,576)
  const image={width:384,height:576,data:ctx.getImageData(0,0,384,576).data},source=encode(image),regions=masks(example),coverage=portraitMaskPixels(regions,image.width,image.height)
  const settings={...defaultPortraitSettings(),skinTone:5},result=await processPortrait(image,regions,settings)
  let changed=0,outsideChanges=0,protectedChanges=0,alphaChanges=0
  for(let i=0;i<image.width*image.height;i++){
   const difference=[0,1,2].some(c=>image.data[i*4+c]!==result.image.data[i*4+c]);if(difference)changed++
   if(difference&&!coverage.skin[i]&&!coverage.eyes[i])outsideChanges++
   if(difference&&coverage.protect[i])protectedChanges++
   if(image.data[i*4+3]!==result.image.data[i*4+3])alphaChanges++
  }
  const beforeTexture=texture(image,coverage.skin),afterTexture=texture(result.image,coverage.skin),ratio=afterTexture.mean/beforeTexture.mean
  expect(changed).toBeGreaterThan(0);expect(outsideChanges).toBe(0);expect(protectedChanges).toBe(0);expect(alphaChanges).toBe(0);expect(ratio).toBeGreaterThan(.75)
  const original=state(source,image.width,image.height),captured=capturePortraitRegions(original,'photo-doc',regions),candidate=await createPortraitCandidate(original,'photo-doc',captured,settings,{io:{decode,encode}}),adopted=adoptPortraitCandidate(candidate,original,'photo-doc')
  const after=raster(adopted),reopened=editorReducer(original,{type:'restore-project',document:decodeProject(await encodeProject(adopted,{id:example.id,name:example.id})).document})
  expect(Buffer.from(raster(reopened).pixels).equals(Buffer.from(after.pixels))).toBe(true);expect(Buffer.from(raster(editorReducer(adopted,{type:'undo'})).pixels).equals(Buffer.from(raster(original).pixels))).toBe(true)
  if(directory){mkdirSync(directory,{recursive:true});writeFileSync(`${directory}/${example.id}-before.png`,Buffer.from(encode(image).split(',')[1],'base64'));writeFileSync(`${directory}/${example.id}-after.png`,after.asPng());writeFileSync(`${directory}/${example.id}-masks.json`,JSON.stringify(regions,null,2))}
  rows.push({id:example.id,note:example.note,sourceUrl:`https://images.unsplash.com/${example.photo}?w=768&q=90&fit=max`,license:'Unsplash License (not CC0)',licenseUrl:'https://unsplash.com/license',licenseFetch:'license/terms endpoint returned HTTP401 in this session; photographs endpoint returned200. Public license link recorded; not a claim of a newly downloaded license snapshot.',sha256:createHash('sha256').update(raw).digest('hex'),originalDimensions:{width:originalImage.width,height:originalImage.height},workingCopyPreparation:'Native canvas resized once to384x576 before both reference and recipe; recipe itself never resizes.',width:image.width,height:image.height,changed,outsideChanges,protectedChanges,alphaChanges,geometry:'no coordinates/resampling/warp; dimensions and alpha identical',texture:{before:beforeTexture,after:afterTexture,ratio},humanReview:{status:'not_performed',reviewer:null,comments:[]}})
 }
 if(directory)writeFileSync(`${directory}/photo-metrics.json`,JSON.stringify({examples:rows,criterionHumanReview:'blocked: real human review of at least three skin-tone/light cases still required; no claim that AI chose valid skin-tone coverage.',remainingCases:['real glasses photo not obtained','separate human skin-tone/light classification and critique required'],licenseCaveat:'Unsplash permits broad photo use via its public license; these assets are not CC0. Verify source/license and attribution before external distribution; no endorsement/model training claim.'},null,2)+'\n')
},60000)
it('leaves a second real person byte-identical in an explicitly labelled two-photo composite',async()=>{
 const canvas=createCanvas(768,576),ctx=canvas.getContext('2d')
 const a=await loadImage(readFileSync('docs/evidence/portrait/originals/portrait-a.jpg')),b=await loadImage(readFileSync('docs/evidence/portrait/originals/portrait-b.jpg'))
 ctx.drawImage(a,0,0,384,576);ctx.drawImage(b,384,0,384,576)
 const image={width:768,height:576,data:ctx.getImageData(0,0,768,576).data},original=masks(examples[0])
 const left=(s:Selection):Selection=>({...s,path:{type:'affine',source:s.path,matrix:[.5,0,0,1,0,0]}})
 const regions={confirmed:true,person:left(original.person),skin:left(original.skin),eyes:left(original.eyes),protect:left(original.protect!)}
 const result=await processPortrait(image,regions,{...defaultPortraitSettings(),skinTone:5})
 let otherPersonChanges=0
 for(let y=0;y<576;y++)for(let x=384;x<768;x++)for(let c=0;c<4;c++)if(result.image.data[(y*768+x)*4+c]!==image.data[(y*768+x)*4+c])otherPersonChanges++
 expect(otherPersonChanges).toBe(0)
 if(process.env.PORTRAIT_EVIDENCE_DIR){const dir=process.env.PORTRAIT_EVIDENCE_DIR;writeFileSync(`${dir}/two-person-composite-before.png`,Buffer.from(encode(image).split(',')[1],'base64'));writeFileSync(`${dir}/two-person-composite-after.png`,Buffer.from(encode(result.image).split(',')[1],'base64'));writeFileSync(`${dir}/two-person-composite.json`,JSON.stringify({provenance:'Explicit side-by-side composite of two independently licensed photographs, not a claim of an original shared-scene group photo.',target:'left photo only, user-specified manual regions',otherPersonChanges},null,2)+'\n')}
},30000)
