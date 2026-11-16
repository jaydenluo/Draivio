import { describe, expect, it } from 'vitest'
import { snapRect } from './snapping'
describe('snapping',()=>{
 it('keeps screen threshold stable across zoom',()=>{ expect(snapRect({rect:{x:48,y:0,width:10,height:10},canvas:{width:100,height:100},config:{zoom:.25}}).x).toBeTruthy(); expect(snapRect({rect:{x:48,y:0,width:10,height:10},canvas:{width:100,height:100},config:{zoom:4}}).x).toBeUndefined() })
 it('supports guide priority and alt bypass',()=>{ const r=snapRect({rect:{x:19,y:20,width:10,height:10},canvas:{width:100,height:100},config:{guides:[{axis:'x',position:20}]}}); expect(r.x?.source).toBe('guide'); expect(snapRect({rect:{x:19,y:20,width:10,height:10},canvas:{width:100,height:100},config:{guides:[{axis:'x',position:20}]},altKey:true}).x).toBeUndefined() })
 it('supports explicit disable and grid',()=>{ expect(snapRect({rect:{x:19,y:20,width:10,height:10},canvas:{width:100,height:100},config:{enabled:false}}).x).toBeUndefined(); expect(snapRect({rect:{x:19,y:20,width:10,height:10},canvas:{width:100,height:100},config:{gridEnabled:true,gridSize:20}}).x?.source).toBe('grid') })
})
