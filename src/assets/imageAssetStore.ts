import {invoke,isTauri} from '@tauri-apps/api/core';
import type {ImageAssetInvoke,ImageResourceRoot,RasterReference} from './imageAssetTypes';
import type {EditorState} from '../state/editor';
const key=(ref:RasterReference)=>`${ref.assetId}:${ref.revision}`;
export function validateRasterReference(value:unknown): asserts value is RasterReference {
 if(!value||typeof value!=='object'||!('assetId' in value)||!('revision' in value)||typeof value.assetId!=='string'||!(/^[0-9a-f]{48}$/).test(value.assetId)||!Number.isSafeInteger(value.revision)||Number(value.revision)<1||Object.keys(value).some(k=>!['assetId','revision'].includes(k)))throw new Error('Invalid durable raster reference');
}
/** Walk nested smart objects and snapshots without materializing image data. */
export function collectRasterReferences(value:unknown):RasterReference[]{
 const refs=new Map<string,RasterReference>(),seen=new WeakSet<object>();
 const walk=(v:unknown):void=>{if(!v||typeof v!=='object'||ArrayBuffer.isView(v)||seen.has(v))return;seen.add(v);if(Array.isArray(v)){for(const item of v)walk(item);return;}for(const [name,child]of Object.entries(v)){if(name==='rasterRef'&&child!==undefined){validateRasterReference(child);refs.set(key(child),child);}else walk(child);}};
 walk(value);return [...refs.values()];
}
export function editorResourceRoots(id:string,state:EditorState):{owner:ImageResourceRoot;references:RasterReference[]}[]{
 const {undoStack,redoStack,...document}=state;
 return [{owner:{kind:'document',id},references:collectRasterReferences(document)},{owner:{kind:'undo',id},references:collectRasterReferences(undoStack)},{owner:{kind:'redo',id},references:collectRasterReferences(redoStack)}];
}
/** Runtime-only resolver. Preview upgrades notify renderers and never dispatch edits. */
export class ImageAssetStore {
 private readonly previews=new Map<string,string>();private readonly listeners=new Set<()=>void>();private version=0;
 private readonly owners=new Map<string,Map<string,string>>();
 subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
 getVersion=()=>this.version;
 publishPreview(reference:RasterReference,url:string,owner='default'){validateRasterReference(reference);if(!url)throw new Error('Missing preview URL');const id=key(reference),owners=this.owners.get(id)??new Map<string,string>();owners.delete(owner);owners.set(owner,url);this.owners.set(id,owners);if(this.previews.get(id)===url)return;this.previews.set(id,url);this.version++;for(const listener of this.listeners)listener();}
 releaseOwner(owner:string){let changed=false;for(const [id,owners]of this.owners){if(!owners.delete(owner))continue;const url=[...owners.values()].at(-1);if(url)this.previews.set(id,url);else{this.previews.delete(id);this.owners.delete(id)}changed=true}if(changed){this.version++;for(const listener of this.listeners)listener()}}
 resolve(reference:RasterReference){return this.previews.get(key(reference));}
 source(layer:{rasterRef?:RasterReference;source?:string}){return layer.rasterRef?this.resolve(layer.rasterRef):layer.source;}
}
export const imageAssetStore=new ImageAssetStore();
/** Serialized root writes prevent a late older effect from replacing new ownership. */
export class ImageResourceOwnership {
 private tail:Promise<unknown>=Promise.resolve();
 constructor(private readonly call:ImageAssetInvoke=invoke,private readonly available= isTauri){}
 replace(owner:ImageResourceRoot,references:RasterReference[]):Promise<void>{
  if(!this.available())return references.length?Promise.reject(new Error('Native resource store unavailable')):Promise.resolve();
  for(const ref of references)validateRasterReference(ref);
  const pending=this.tail.catch(()=>{}).then(()=>this.call('image_resource_replace_root',{owner,references})).then(()=>{});this.tail=pending;return pending;
 }
 replaceMany(roots:{owner:ImageResourceRoot;references:RasterReference[]}[]):Promise<void>{
  if(!this.available())return roots.some(r=>r.references.length)?Promise.reject(new Error('Native resource store unavailable')):Promise.resolve();
  for(const root of roots)for(const ref of root.references)validateRasterReference(ref);
  const pending=this.tail.catch(()=>{}).then(()=>this.call('image_resource_replace_roots',{roots})).then(()=>{});this.tail=pending;return pending;
 }
 claimImport(owner:ImageResourceRoot,reference:RasterReference):Promise<void>{
  validateRasterReference(reference);if(!this.available())return Promise.reject(new Error('Native resource store unavailable'));
  const pending=this.tail.catch(()=>{}).then(()=>this.call('image_resource_claim_import',{owner,reference})).then(()=>{});this.tail=pending;return pending;
 }

}
export const imageResourceOwnership=new ImageResourceOwnership();
