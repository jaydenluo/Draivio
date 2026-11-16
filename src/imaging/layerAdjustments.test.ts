import { expect, test } from 'vitest'
import { neutralAdjustments, editorReducer, initialEditorState } from '../state/editor'
import { applyLayerAdjustments } from './layerAdjustments'
const apply = (pixels: number[], changes = {}, width = pixels.length / 4) => [...applyLayerAdjustments(new Uint8ClampedArray(pixels), width, pixels.length / 4 / width, { ...neutralAdjustments, ...changes })]
const gray = [32,32,32,255,128,128,128,255,224,224,224,255]
test('neutral is byte-exact including hidden RGB and source remains immutable', () => {
 const pixels = [17,58,91,0,42,84,126,123]; expect(apply(pixels)).toEqual(pixels); expect(pixels).toEqual([17,58,91,0,42,84,126,123])
})
test('brightness raises colors; contrast expands the gray ramp', () => {
 expect(apply(gray,{brightness:40})[0]).toBeGreaterThan(32)
 const contrast=apply(gray,{contrast:40}); expect(contrast[0]).toBeLessThan(32); expect(contrast[8]).toBeGreaterThan(224)
})
test('desaturation makes a color card gray and positive saturation expands chroma', () => {
 const card=[120,80,40,255,20,100,180,255]; const desat=apply(card,{saturation:-100}); expect(desat[0]).toBe(desat[1]); expect(desat[1]).toBe(desat[2]); expect(apply(card,{saturation:50})[0]-apply(card,{saturation:50})[2]).toBeGreaterThan(80)
})
test('warmth changes red and blue in opposite directions without rotating gray hue', () => {
 const warm=apply(gray,{temperature:50}),cool=apply(gray,{temperature:-50}); expect(warm[4]).toBeGreaterThan(128); expect(warm[6]).toBeLessThan(128); expect(warm[5]).toBe(128); expect(cool[4]).toBeLessThan(128); expect(cool[6]).toBeGreaterThan(128)
})
test('shadows target dark values and highlights target light values independently', () => {
 const shadow=apply(gray,{shadows:70}), high=apply(gray,{highlights:-70}); expect(shadow[0]).toBeGreaterThan(32); expect(shadow[8]).toBe(224); expect(high[0]).toBe(32); expect(high[8]).toBeLessThan(224)
})
test('blur smooths texture while clarity strengthens edges and leaves flat fields unchanged', () => {
 const texture=[80,80,80,255,120,120,120,255,160,160,160,255]; const blur=apply(texture,{blur:60}); expect(blur[0]).toBeGreaterThan(80); expect(blur[8]).toBeLessThan(160)
 const sharp=apply(texture,{sharpness:70}); expect(sharp[0]).toBeLessThan(80); expect(sharp[8]).toBeGreaterThan(160)
 const flat=[100,100,100,255,100,100,100,255]; expect(apply(flat,{sharpness:100})).toEqual(flat)
})
test('spatial and color adjustments preserve alpha and transparent neighbors do not darken color', () => {
 const pixels=[0,0,0,0,200,100,50,128,0,0,0,0]; const output=apply(pixels,{blur:100,sharpness:40}); expect(output.filter((_,i)=>i%4===3)).toEqual([0,128,0]); expect(output.slice(4,7)).toEqual([200,100,50])
})
test('reset and undo restore adjustment parameters without modifying source', () => {
 const original={...initialEditorState,layers:[{...initialEditorState.layers[0],source:'original-data'}]}; const changed=editorReducer(original,{type:'set-layer-adjustment',id:'art',key:'shadows',value:60}); const reset=editorReducer(changed,{type:'reset-layer-adjustments',id:'art'}); expect(reset.layers[0].adjustments).toEqual(neutralAdjustments); const undone=editorReducer(reset,{type:'undo'}); expect(undone.layers[0].adjustments?.shadows).toBe(60); expect(undone.layers[0].source).toBe('original-data')
})
test('negative clarity softens texture and signed tonal controls work in both directions', () => {
 const texture=[80,80,80,255,120,120,120,255,160,160,160,255]
 expect(apply(texture,{sharpness:-70})[0]).toBeGreaterThan(80)
 expect(apply(gray,{brightness:-40})[4]).toBeLessThan(128)
 expect(apply(gray,{contrast:-40})[0]).toBeGreaterThan(32)
 expect(apply(gray,{shadows:-70})[0]).toBeLessThan(32)
 expect(apply(gray,{highlights:70})[8]).toBeGreaterThan(224)
})
test('all controls combined preserve each partial alpha and never modify the input', () => {
 const source=new Uint8ClampedArray([24,80,190,23,200,90,40,127,60,180,100,231,170,160,140,255]); const before=source.slice()
 const result=applyLayerAdjustments(source,2,2,{brightness:20,contrast:10,saturation:35,temperature:25,sharpness:40,blur:50,shadows:30,highlights:-40})
 expect([...result].filter((_,i)=>i%4===3)).toEqual([23,127,231,255]); expect(source).toEqual(before); expect(result).not.toEqual(source)
})
test('clarity changes broad local contrast inside a plateau away from sharp edges', () => {
 const pixels=Array.from({length:21},(_,x)=>[x>=6&&x<=14?160:100,x>=6&&x<=14?160:100,x>=6&&x<=14?160:100,255]).flat()
 // Plateau center is five pixels from either edge; sigma-1/radius-2 sharpening leaves it unchanged.
 expect(apply(pixels,{sharpness:70})[10*4]).toBe(174)
 expect(apply(pixels,{sharpness:-70})[10*4]).toBe(146)
})
test('non-finite adjustments are rejected with feedback and do not enter history', () => {
 for(const value of [NaN,Infinity,-Infinity]) { const next=editorReducer(initialEditorState,{type:'set-layer-adjustment',id:'art',key:'brightness',value}); expect(next.layers).toBe(initialEditorState.layers); expect(next.undoStack).toEqual(initialEditorState.undoStack); expect(next.notice).toMatch(/有限数字/) }
})
test('adjustment preview toggles independently of saved values and supports undo', () => {
 const edited=editorReducer(initialEditorState,{type:'set-layer-adjustment',id:'art',key:'brightness',value:50}); const off=editorReducer(edited,{type:'toggle-layer-adjustments-preview',id:'art'}); expect(off.layers[0].adjustmentsEnabled).toBe(false); expect(off.layers[0].adjustments?.brightness).toBe(50); expect(editorReducer(off,{type:'undo'}).layers[0].adjustmentsEnabled).not.toBe(false)
})
test('preview obeys ancestor locking and individual reset is undoable without resetting siblings',()=>{
 const locked={...initialEditorState,layers:[{...initialEditorState.layers[0],id:'group',locked:true,children:['art']},{...initialEditorState.layers[0],groupId:'group'}]};expect(editorReducer(locked,{type:'toggle-layer-adjustments-preview',id:'art'}).layers).toBe(locked.layers)
 let edited=editorReducer(initialEditorState,{type:'set-layer-adjustment',id:'art',key:'brightness',value:40});edited=editorReducer(edited,{type:'set-layer-adjustment',id:'art',key:'contrast',value:20});const reset=editorReducer(edited,{type:'set-layer-adjustment',id:'art',key:'brightness',value:0});expect(reset.layers[0].adjustments).toMatchObject({brightness:0,contrast:20});expect(editorReducer(reset,{type:'undo'}).layers[0].adjustments).toMatchObject({brightness:40,contrast:20})
})
test('spatial reference agrees with independently dense alpha-weighted Gaussian on a partial-alpha card',()=>{
 const width=5,height=4;const source=new Uint8ClampedArray(Array.from({length:width*height*4},(_,i)=>i%4===3?(i*31)%256:(i*43+17)%256))
 const sigma=1.05,radius=Math.ceil(2*sigma);const expected=source.slice()
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sum=[0,0,0];let alpha=0;for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const sx=x+dx,sy=y+dy;if(sx<0||sx>=width||sy<0||sy>=height)continue;const index=(sy*width+sx)*4,weight=Math.exp(-(dx*dx+dy*dy)/(2*sigma*sigma))*source[index+3];alpha+=weight;for(let c=0;c<3;c++)sum[c]+=source[index+c]*weight}const target=(y*width+x)*4;if(alpha)for(let c=0;c<3;c++)expected[target+c]=sum[c]/alpha}
 const actual=applyLayerAdjustments(source,width,height,{...neutralAdjustments,blur:35});expect([...actual].map((v,i)=>Math.abs(v-expected[i])).reduce((a,b)=>Math.max(a,b),0)).toBeLessThanOrEqual(1)
})
