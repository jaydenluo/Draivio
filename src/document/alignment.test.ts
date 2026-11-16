import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState, type Layer } from '../state/editor'
import { alignmentTargets, layerWorldBounds, planAlignment, type AlignmentRequest } from './alignment'
import { encodeProject, decodeProject } from './projectFormat'
const layer = (id: string, x: number, y: number, width: number, height: number, rotation = 0): Layer => ({ id, name: id, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', transform: { kind: 'transform', rect: { x, y, width, height }, rotation, flipX: false, flipY: false } })
const fixture = () => ({ ...structuredClone(initialEditorState), documentWidth: 1000, documentHeight: 600, layers: [layer('a', 10, 10, 10, 20, 30), layer('b', 40, 25, 20, 10, -20), layer('c', 75, 65, 15, 25, 90)], selectedLayerId: 'a', selectedLayerIds: ['a', 'b', 'c'] })
function apply(s: ReturnType<typeof fixture>, request: AlignmentRequest) { const p = planAlignment(s, request); expect(p.error).toBeUndefined(); return { ...s, layers: s.layers.map(l => p.transforms[l.id] ? { ...l, transform: p.transforms[l.id] } : l) } }
describe('alignment world geometry', () => {
  for (const reference of ['canvas', 'selection', 'key'] as const) for (const operation of ['left', 'center-x', 'right', 'top', 'center-y', 'bottom'] as const) it(`${reference} ${operation} aligns rotated unequal frames`, () => {
    const s = fixture(), before = s.layers.map(l => layerWorldBounds(s, l.id)), next = apply(s, { reference, operation, keyLayerId: 'b' })
    const axis = ['left', 'center-x', 'right'].includes(operation) ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height', factor = operation.startsWith('center') ? .5 : ['right', 'bottom'].includes(operation) ? 1 : 0
    const start = Math.min(...before.map(b => b[axis])), end = Math.max(...before.map(b => b[axis] + b[size]))
    const target = reference === 'canvas' ? (axis === 'x' ? 1000 : 600) * factor : reference === 'key' ? before[1][axis] + before[1][size] * factor : start + (end - start) * factor
    next.layers.forEach(l => { const b = layerWorldBounds(next, l.id); expect(b[axis] + b[size] * factor).toBeCloseTo(target); expect(l.transform?.rotation).toBe(s.layers.find(a => a.id === l.id)?.transform?.rotation) })
    if (reference === 'key') expect(next.layers[1]).toBe(s.layers[1])
  })
  for (const operation of ['distribute-x', 'distribute-y'] as const) it(`${operation} spaces outer bounds equally and anchors key`, () => {
    const s = fixture(), next = apply(s, { reference: 'key', keyLayerId: 'b', operation }), axis = operation === 'distribute-x' ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height'
    const bounds = next.layers.map(l => layerWorldBounds(next, l.id)).sort((a,b) => a[axis]-b[axis])
    expect(bounds[1][axis]-bounds[0][axis]-bounds[0][size]).toBeCloseTo(bounds[2][axis]-bounds[1][axis]-bounds[1][size]); expect(next.layers[1]).toBe(s.layers[1])
  })
  it('rejects negative gaps and fewer than three targets without writing', () => {
    const s = fixture(); s.layers.forEach(l => l.transform!.rect.width = 70)
    expect(planAlignment(s, { reference: 'canvas', operation: 'distribute-x' }).error).toMatch(/负间距/)
    expect(planAlignment({ ...s, selectedLayerIds: ['a', 'b'] }, { reference: 'selection', operation: 'distribute-x' }).error).toMatch(/至少需要三个/)
  })
  it('deduplicates parent/child and excludes ancestor locks and locked subtrees', () => {
    const s = fixture(); s.layers[0].children = ['b']; s.layers[1].groupId = 'a'
    expect(alignmentTargets(s).map(l => l.id)).toEqual(['a','c'])
    s.layers[1].locked = true; expect(alignmentTargets(s).map(l => l.id)).toEqual(['c'])
    s.layers[0].locked = true; s.selectedLayerIds = ['b','c']; expect(alignmentTargets(s).map(l => l.id)).toEqual(['c'])
  })
  it('inverts rotated scaled parents including parent content dimensions', () => {
    const s = fixture(); const g = layer('g', 5, 10, 60, 80, 38); g.contentWidth = 500; g.contentHeight = 300; g.children = ['a']; s.layers[0].groupId = 'g'; s.layers.push(g)
    const original = layerWorldBounds(s,'a'), next = apply(s, { reference: 'canvas', operation: 'left' }), b = layerWorldBounds(next,'a')
    expect(b.x).toBeCloseTo(0); expect(b.y).toBeCloseTo(original.y); expect(b.width).toBeCloseTo(original.width); expect(b.height).toBeCloseTo(original.height)
  })
  it('commits once, undo/redo restores all layers and project save reopens transforms', async () => {
    const s = fixture(), next = editorReducer(s, { type: 'align-layers', request: { reference: 'canvas', operation: 'left' } })
    expect(next.undoStack).toHaveLength(1); expect(editorReducer(next,{type:'undo'}).layers).toEqual(s.layers)
    expect(editorReducer(editorReducer(next,{type:'undo'}),{type:'redo'}).layers).toEqual(next.layers)
    expect(decodeProject(await encodeProject(next, { id: 'align', name: '对齐' })).document.layers).toEqual(next.layers)
    const noOp = editorReducer(next, { type: 'align-layers', request: { reference: 'canvas', operation: 'left' } }); expect(noOp.undoStack).toBe(next.undoStack)
  })
})

it('matches independently computed non-square rotated frame corners', () => {
  const s = fixture(), b = layerWorldBounds(s,'a')
  // Center (150,120), unrotated size (100,120), rotation 30 degrees.
  expect(b.x).toBeCloseTo(150-(100*Math.cos(Math.PI/6)+120*.5)/2)
  expect(b.y).toBeCloseTo(120-(100*.5+120*Math.cos(Math.PI/6))/2)
  expect(b.width).toBeCloseTo(100*Math.cos(Math.PI/6)+120*.5)
  expect(b.height).toBeCloseTo(100*.5+120*Math.cos(Math.PI/6))
})
it('uses visible crop region for canvas alignment and equal outer gaps', () => {
  const s = { ...fixture(), cropRect: { x:10,y:20,width:70,height:60 } }
  const aligned = apply(s,{reference:'canvas',operation:'right'})
  aligned.layers.forEach(l=>{const b=layerWorldBounds(aligned,l.id);expect(b.x+b.width).toBeCloseTo(800)})
  const next = apply(s,{reference:'canvas',operation:'distribute-x'}), b = next.layers.map(l=>layerWorldBounds(next,l.id)).sort((a,b)=>a.x-b.x)
  expect(b[0].x).toBeCloseTo(100); expect(b[2].x+b[2].width).toBeCloseTo(800)
  expect(b[1].x-b[0].x-b[0].width).toBeCloseTo(b[2].x-b[1].x-b[1].width)
})
it('selection distribution preserves outer endpoints', () => {
  const s=fixture(), before=s.layers.map(l=>layerWorldBounds(s,l.id)), next=apply(s,{reference:'selection',operation:'distribute-x'}), b=next.layers.map(l=>layerWorldBounds(next,l.id))
  expect(b[0]).toEqual(before[0]); expect(b[2]).toEqual(before[2]); expect(b[1].x-b[0].x-b[0].width).toBeCloseTo(b[2].x-b[1].x-b[1].width)
})
it('a locked subtree is skipped and failure leaves geometry/history/revision untouched', () => {
  const s=fixture(); s.layers[0].children=['b'];s.layers[1].groupId='a';s.layers[1].locked=true
  const next=editorReducer(s,{type:'align-layers',request:{reference:'canvas',operation:'left'}})
  expect(next.notice).toMatch(/至少需要两个/); expect(next.layers).toBe(s.layers);expect(next.undoStack).toBe(s.undoStack); expect(next.documentRevision).toBe(s.documentRevision)
  const n=fixture();n.layers.forEach(l=>l.transform!.rect.width=70)
  const rejected=editorReducer(n,{type:'align-layers',request:{reference:'canvas',operation:'distribute-x'}})
  expect(rejected.notice).toMatch(/负间距/);expect(rejected.layers).toBe(n.layers);expect(rejected.undoStack).toBe(n.undoStack)
})
it('moves a deduplicated group exactly once without editing child transforms', () => {
  const s=fixture();s.layers[0].children=['b'];s.layers[1].groupId='a'
  const before=layerWorldBounds(s,'a'), child=layerWorldBounds(s,'b'), next=apply(s,{reference:'canvas',operation:'left'})
  expect(layerWorldBounds(next,'a').x).toBeCloseTo(0);expect(layerWorldBounds(next,'b').x).toBeCloseTo(child.x-before.x)
  expect(next.layers[1]).toBe(s.layers[1]);expect(next.layers[0].transform!.rect.width).toBe(s.layers[0].transform!.rect.width)
})
it('rejects hidden, singular and cyclic hierarchy targets and invalid key without fallback', () => {
  const s=fixture();s.layers[0].visible=false; expect(alignmentTargets(s).map(l=>l.id)).toEqual(['b','c'])
  expect(planAlignment(s,{reference:'key',keyLayerId:'a',operation:'left'}).error).toMatch(/关键对象/)
  s.layers[0].visible=true;s.layers[0].transform!.rect.width=0;expect(alignmentTargets(s).map(l=>l.id)).toEqual(['b','c'])
  s.layers[0].groupId='b';s.layers[1].groupId='a';expect(alignmentTargets(s).map(l=>l.id)).toEqual(['c'])
})

it.each(['shape','text','stroke'] as const)('includes a group own %s frame without adding empty container frames', kind => {
  const s=fixture(); const group=layer('g',0,0,100,100); group.children=['a'];s.layers[0].groupId='g';s.layers.push(group)
  const child=layerWorldBounds(s,'a');expect(layerWorldBounds(s,'g')).toEqual(child)
  if(kind==='shape') s.canvasShapes=[{id:'group-shape',layerId:'g',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#123456',strokeWidth:0}]
  if(kind==='text') s.canvasTexts=[{id:'group-text',layerId:'g',x:0,y:0,text:'组内文字',fontFamily:'sans-serif',fontSize:24,fontWeight:'400',color:'#123456',align:'left'}]
  if(kind==='stroke') s.brushStrokes=[{id:'group-stroke',layerId:'g',mode:'paint',smoothing:0,points:[{x:0,y:0,pressure:1}],size:10,hardness:100,opacity:100,flow:100,color:'#123456'}]
  expect(layerWorldBounds(s,'g')).toEqual({x:0,y:0,width:1000,height:600})
})
