import {describe,it,expect,vi} from 'vitest';
import {ImageAssetStore,ImageResourceOwnership,collectRasterReferences,editorResourceRoots} from './imageAssetStore';
import {initialEditorState,editorReducer} from '../state/editor';
import {contentRevision} from '../ai/context/editorContext';
import {encodeProject,projectFingerprint} from '../document/projectFormat';
const ref={assetId:'a'.repeat(48),revision:1};
describe('durable raster references',()=>{
 it('releases one preview owner while retaining another document capability',()=>{
  const resolver=new ImageAssetStore();resolver.publishPreview(ref,'one','doc1');resolver.publishPreview(ref,'two','doc2');
  resolver.releaseOwner('doc2');expect(resolver.resolve(ref)).toBe('one');resolver.releaseOwner('doc1');expect(resolver.resolve(ref)).toBeUndefined();
 });
 it('blocks edits of an opened display-only raster project at the reducer boundary',()=>{
  const state={...structuredClone(initialEditorState),rasterPreviewOnly:true};
  state.layers[0]={...state.layers[0],rasterRef:ref};
  const changed=editorReducer(state,{type:'set-layer-source',id:state.layers[0].id,source:'data:image/png;base64,preview'});
  expect(changed.layers).toBe(state.layers);expect(changed.notice).toContain('只读');
 });
 it('keeps preview upgrades out of document identity and undo',()=>{
  const state=editorReducer(structuredClone(initialEditorState),{type:'import-raster-reference',id:'native',name:'native',rasterRef:ref,width:500,height:625});
  const revision=contentRevision(state), fingerprint=projectFingerprint(state),undo=state.undoStack;
  const resolver=new ImageAssetStore();resolver.publishPreview(ref,'http://draivio-image.localhost/small');resolver.publishPreview(ref,'http://draivio-image.localhost/large');
  expect(resolver.resolve(ref)).toBe('http://draivio-image.localhost/large');expect(contentRevision(state)).toBe(revision);expect(projectFingerprint(state)).toBe(fingerprint);expect(state.undoStack).toBe(undo);expect(JSON.stringify(state)).not.toContain('draivio-image');
 });
 it('discovers nested smart objects, undo and redo roots',()=>{
  const state=structuredClone(initialEditorState);Object.assign(state,{layers:[{...state.layers[0],rasterRef:ref}],smartObjectSources:{nested:{document:{layers:[{rasterRef:{...ref,revision:2}}]}}},undoStack:[{layers:[{rasterRef:{...ref,revision:3}}]}],redoStack:[{layers:[{rasterRef:{...ref,revision:4}}]}]});
  expect(collectRasterReferences(state).map(r=>r.revision).sort()).toEqual([1,2,3,4]);
  const roots=editorResourceRoots('doc',state);expect(roots.find(r=>r.owner.kind==='undo')?.references).toContainEqual({...ref,revision:3});expect(roots.find(r=>r.owner.kind==='redo')?.references).toContainEqual({...ref,revision:4});
 });
 it('rejects durable refs in legacy JSON instead of saving a runtime URL',async()=>{
  const state=structuredClone(initialEditorState);state.layers[0]={...state.layers[0],rasterRef:ref};
  await expect(encodeProject(state,{id:'doc',name:'native'})).rejects.toThrow(/v4/);
 });
 it('supports legacy source and notifies render subscribers without state mutations',()=>{
  const resolver=new ImageAssetStore();let changed=0;resolver.subscribe(()=>changed++);resolver.publishPreview(ref,'runtime-url');expect(resolver.source({rasterRef:ref})).toBe('runtime-url');expect(resolver.source({source:'legacy-data'})).toBe('legacy-data');expect(changed).toBe(1);
 });
 it('moves importer ownership atomically and orders document/history updates',async()=>{
  const invoke=vi.fn(async()=>undefined);const ownership=new ImageResourceOwnership(invoke,()=>true);
  await ownership.claimImport({kind:'document',id:'doc'},ref);
  expect(invoke).toHaveBeenCalledWith('image_resource_claim_import',{owner:{kind:'document',id:'doc'},reference:ref});
  await ownership.replaceMany([{owner:{kind:'document',id:'doc'},references:[]},{owner:{kind:'undo',id:'doc'},references:[ref]}]);
  expect(invoke).toHaveBeenCalledTimes(2);
 });
 it('source replacement clears durable reference while undo retains it',()=>{
  const state=editorReducer(structuredClone(initialEditorState),{type:'import-raster-reference',id:'native',name:'native',rasterRef:ref,width:500,height:625});
  const next=editorReducer(state,{type:'set-layer-source',id:'native',source:'data:image/png;base64,changed'});
  expect(next.layers.find(l=>l.id==='native')?.rasterRef).toBeUndefined();
  expect(collectRasterReferences(next.undoStack)).toContainEqual(ref);
 });
 it('rejects an RGB resource import into authoritative CMYK state',()=>{
  const state={...structuredClone(initialEditorState),colorModel:'cmyk' as const};
  const next=editorReducer(state,{type:'import-raster-reference',id:'rgb',name:'RGB',rasterRef:ref,width:500,height:625});
  expect(next.layers).toBe(state.layers);expect(next.undoStack).toBe(state.undoStack);expect(next.notice).toMatch(/CMYK/);
 });

});
