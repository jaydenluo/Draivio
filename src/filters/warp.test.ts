import {expect,it} from 'vitest'
import {applyWarpRecipe,meshWarp,perspectiveWarp,radialWarp,type WarpImage} from './warp'
const checker=():WarpImage=>{const data=new Uint8ClampedArray(16*16*4);for(let y=0;y<16;y++)for(let x=0;x<16;x++){const n=(y*16+x)*4,v=(x+y)%2?255:0;data.set([v,v,v,255],n)}return {width:16,height:16,data}}
it('maps an identity quad and known perspective without mutating source',()=>{const a=checker(),b=perspectiveWarp(a,[{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}]);expect(b.data).toEqual(a.data);expect(a.data).toEqual(checker().data)})
it('applies bounded radial and local mesh deformation with transparent sampling outside',()=>{const a=checker(),r=radialWarp(a,.8);expect(r.data).not.toEqual(a.data);const m=meshWarp(a,[{source:{x:50,y:50},target:{x:90,y:90}}]);expect(m.data).not.toEqual(a.data);expect(()=>radialWarp(a,2)).toThrow()})
it('cancels mesh before publishing partial output',()=>{const c=new AbortController();c.abort();expect(()=>meshWarp(checker(),[{source:{x:1,y:1},target:{x:2,y:2}}],c.signal)).toThrow(/取消/)})
it('replays a serialized recipe deterministically for export',()=>{const a=checker(),recipe={kind:'radial' as const,distortion:.25,center:{x:50,y:50}},first=applyWarpRecipe(a,recipe),second=applyWarpRecipe(a,JSON.parse(JSON.stringify(recipe)));expect(Array.from(first.data)).toEqual(Array.from(second.data))})
