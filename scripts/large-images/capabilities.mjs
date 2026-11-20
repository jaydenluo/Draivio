#!/usr/bin/env node
// A reproducible candidate audit, with explicit per-file reviewed assignments.
// New matching files fail closed until assigned; static coverage is not runtime compatibility.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
const root=process.cwd(), assignments=JSON.parse(await readFile(resolve(root,'scripts/large-images/capability-assignments.json'),'utf8'));
const mapped=new Map();for(const [group,files] of Object.entries(assignments))for(const file of files){if(mapped.has(file))throw Error('Duplicate assignment: '+file);mapped.set(file,group);}
async function walk(dir){const files=[];for(const e of await readdir(dir,{withFileTypes:true})){if(e.isDirectory()&&e.name!=='test')files.push(...await walk(resolve(dir,e.name)));else if(e.isFile()&&/\.(ts|tsx|rs)$/.test(e.name)&&!e.name.includes('.test.')&&!e.name.includes('.d.ts'))files.push(resolve(dir,e.name));}return files;}
const pattern=/\b(?:source|src|href|ImageData|drawImage|toDataURL|createImageBitmap|rasterizeSvgPixels|imageToPng|readImageFile|PixelBuffer|RasterSurface|getImageData|putImageData|createImageData|Uint8ClampedArray|ImageReader|read_to_end|read_to_string|base64|PixelImage|Uint8Array|ArrayBuffer|arrayBuffer|btoa|atob|invoke)\b|image::|fs::read/;
const candidates=[],missing=[];
for(const file of [...await walk(resolve(root,'src')),...await walk(resolve(root,'src-tauri/src'))].sort()){
 const content=await readFile(file,'utf8'),matches=content.split('\n').flatMap((text,i)=>pattern.test(text)?[{line:i+1,text:text.trim().slice(0,400)}]:[]);
 const path=relative(root,file),key=path.replace(/^src-tauri\/src\//,'native/').replace(/^src\//,'').replace(/\.(tsx|ts|rs)$/,'');
 if(!matches.length&&!mapped.has(key))continue;
 const group=mapped.get(key);if(!group){missing.push(path);continue;}
 const [task,role,reason]=group.split('|');candidates.push({path,sha256:createHash('sha256').update(content).digest('hex'),task,role,reason,matches});
}
if(missing.length)throw Error('Unclassified candidates: '+missing.join(', '));
const registry=await readFile(resolve(root,'src/tools/toolRegistry.ts'),'utf8');
const tools=[...registry.matchAll(/tool\('([^']+)', '([^']+)', '([^']+)'/g)].map(([,id,group,label])=>{
 const task=['pan','zoom','rotate'].includes(id)?'LI09':['brush','pencil','gradient-brush','brush-line','soft-brush','smudge','eraser','clone-stamp','dodge','burn','picker','background-eraser'].includes(id)?'LI12':['healing','remove-object','patch','subject-select','mask-subject','cutout','upscale'].includes(id)?'LI16':['text','shape','shape-ellipse','shape-line','shape-arrow','pen','transform'].includes(id)?'LI10':['select','move'].includes(id)?'LI09':'LI13';
 return {id,group,label,task,pixelAuthority:['LI09','LI10'].includes(task)?'geometry/display plus original reference':'lossless working pixels; preview forbidden as edit source',runtimeLargeImageVerified:false};
});
// Per-tool reference path and applicable limits; shared limits are inheritance, not tool guarantees.
const geometryBudget='Geometry only: no independent pixel allocation budget; inherits document max side16384 and32*1024*1024 pixels. Display/hit-test rasterization inherits rasterTools16,777,216 pixels; large-image runtime unverified.';
for(const tool of tools){
 let paths=['src/canvas/CanvasViewport.tsx'],budget=geometryBudget;
 if(tool.task==='LI09'){paths.push('src/canvas/CanvasScene.tsx','src/canvas/moveTargets.ts','src/canvas/useRasterHitTest.ts');}
 else if(tool.task==='LI10'){paths.push('src/document/groupTransforms.tsx','src/canvas/CanvasScene.tsx');}
 else if(tool.task==='LI12'){
  paths.push('src/canvas/rasterTools.ts','src/canvas/rasterBrush.ts');budget='Full-frame rasterTools limit16,777,216 pixels; enclosing document max side16384/32Mi pixels. Brush operations have no separate tile budget; scheduler paths default16,777,216 pixels/256MiB; not a large-image guarantee.';
  if(['clone-stamp','smudge'].includes(tool.id))paths.push('src/retouch/cloneHeal.ts');
  if(['dodge','burn'].includes(tool.id))paths.push('src/retouch/tonalBrush.ts');
 }else if(tool.task==='LI16'){
  paths.push('src/ai/tools/toolCoverage.ts','src/ai/tools/retouchTools.ts','src/ai/imaging/processingScheduler.ts');budget='Model/operation-specific input limits; shared scheduler default16,777,216 pixels/256MiB; full-frame raster capture16,777,216 pixels. No independent universal tool pixel budget; downstream capability gates required.';
  if(['healing','patch'].includes(tool.id))paths.push('src/retouch/cloneHeal.ts');
  if(['remove-object'].includes(tool.id)){paths.push('src/retouch/contentFill.ts');budget+=' Local contentFill/brushMask max4,194,304 pixels; target default16,384 pixels and<=75% image;10s timeout/40,000,000 operation budget; full-frame data.slice and masks.';}
  if(tool.id==='cutout'){paths=['src/canvas/CanvasViewport.tsx','src/canvas/rasterTools.ts','src/imaging/enhancement.ts'];budget='Viewport cutout: rasterizeSvgPixels(layerScene) → removeBackground(image,28) → imageToPng; rasterTools full-frame limit16,777,216 pixels; inherits document16384 side/32Mi pixels. Model install prerequisite is not proof that subject-select service runs.';}
  if(tool.id==='upscale')paths.push('src/ai/tools/restorationTools.ts','src/ai/imaging/tiledInference.ts');
  if(['subject-select','mask-subject'].includes(tool.id))paths.push('src/ai/tools/selectionTools.ts','src/ai/vision/SemanticSelectionWorkspace.tsx');
 }else{
  paths.push('src/canvas/selectionRaster.ts','src/canvas/selectionGeometry.ts');budget='Geometry selection/crop has no independent pixel budget, inherits document16384 side/32Mi pixels; pixel selection/mask/fill paths inherit full-frame rasterTools16,777,216 pixels. Cross-tile handling not verified.';
  if(['fill','gradient-fill','magic-wand'].includes(tool.id))paths.push('src/canvas/bucketFill.ts');
  if(tool.group==='mask')paths.push('src/masks/refineMask.ts','src/masks/refineAsync.ts');
 }
 tool.referencePixelPaths=[...new Set(paths)];tool.currentBudget=budget;
 for(const path of tool.referencePixelPaths)if(!candidates.some(c=>c.path===path))throw Error('Untraced tool reference path: '+path);
}
const toolTypes=await readFile(resolve(root,'src/tools/toolTypes.ts'),'utf8');
const union=toolTypes.match(/export type ToolId\s*=([\s\S]*?)(?=export|$)/)?.[1]??'';
const declared=[...union.matchAll(/'([^']+)'/g)].map(m=>m[1]);
if(declared.length!==tools.length||declared.some(id=>!tools.some(t=>t.id===id)))throw Error('ToolId union differs from registry extraction');
if(tools.length!==new Set(tools.map(t=>t.id)).size||!tools.length)throw Error('Invalid tool registry extraction');
const report={schemaVersion:1,scanScope:'All production src/**/*.ts(x) and src-tauri/src/**/*.rs, excluding .test.*, declarations and test directories; broad lexical candidates with explicit per-file classification (includes excluded false positives), supplemented with explicitly traced persistence/budget/batch consumers. Runtime compatibility requires downstream task tests.',scanPattern:pattern.source,toolRegistrySha256:createHash('sha256').update(registry).digest('hex'),tools,candidates,budgets:[{path:'src/retouch/contentFill.ts',limit:'4,194,304 full-frame pixels; target16,384 default and<=75%;10s timeout;40,000,000 ops; full-frame typed-array masks/data.slice',task:'LI16'},{path:'src/render/precisionCodec.ts',limit:'32MiB Base64 transport resource budget; full ArrayBuffer/strings/IPC; native codec16384 max side',task:'LI15'},{path:'src/ai/imaging/processingWorker.ts',limit:'Full request input and result image buffer transport; inherits scheduler16,777,216 pixels/256MiB default accounting',task:'LI11'},{path:'src/document/documentGeometry.ts',limit:'max side 16384; 32*1024*1024 pixels',task:'LI09'},{path:'src/canvas/rasterTools.ts',limit:'16,777,216 pixel default raster budget',task:'LI11'},{path:'src/ai/imaging/processingScheduler.ts',limit:'16,777,216 pixel default;256MiB scheduler accounting',task:'LI11'},{path:'src/render/exportImage.ts',limit:'32,000,000 export pixels',task:'LI17'},{path:'src/document/projectFormat.ts',limit:'v3 JSON/Base64;512MiB conservative serialization budget',task:'LI06'},{path:'src-tauri/src/project_files.rs',limit:'256MiB UTF-8 project transport',task:'LI06'},{path:'src/document/recoveryStore.ts',limit:'localStorage recovery24MiB string precheck',task:'LI07'}]};
await writeFile(resolve(root,'docs/verification/large-images/capabilities.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({tools:tools.length,candidates:candidates.length,excluded:candidates.filter(c=>c.task==='excluded').length,unclassified:missing.length}));
