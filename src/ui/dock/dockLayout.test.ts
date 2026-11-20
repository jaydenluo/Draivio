import { expect, it } from 'vitest'
import { movePanel, resizePair, restoreLayout } from './dockLayout'
const initial = [{id:'a',tabs:['layers','edit','results'],active:'layers',weight:1,collapsed:false}]
it('splits, orders and merges panels into any group with no duplicates',()=>{
 let groups=movePanel(initial,'edit','a','after')
 expect(groups.map(g=>g.tabs)).toEqual([['layers','results'],['edit']])
 groups=movePanel(groups,'layers',groups[1].id,'after')
 expect(groups.map(g=>g.tabs)).toEqual([['results'],['edit'],['layers']])
 groups=movePanel(groups,'layers',groups[1].id,'merge')
 expect(groups.map(g=>g.tabs)).toEqual([['results'],['edit','layers']])
 groups=movePanel(groups,'results',groups[1].id,'merge')
 expect(groups).toHaveLength(1)
 expect(groups[0].tabs).toEqual(['edit','layers','results'])
 expect(groups[0].active).toBe('results')
})
it('keeps every registered panel exactly once when restoring stale layouts',()=>{
 const groups=restoreLayout([{id:'x',tabs:['layers','missing','layers'],active:'missing',weight:-2},{id:'x',tabs:['layers','edit'],active:'edit',weight:Infinity}],['layers','edit','results'])
 expect(groups.flatMap(g=>g.tabs).sort()).toEqual(['edit','layers','results'])
 expect(new Set(groups.map(g=>g.id)).size).toBe(groups.length)
 expect(groups.every(g=>g.weight>0&&Number.isFinite(g.weight))).toBe(true)
 expect(restoreLayout(null,['layers'])).toMatchObject([{tabs:['layers']}])
})
it('resizes only adjacent groups and clamps both minimum heights',()=>{
 expect(resizePair(300,200,50,80)).toEqual([350,150])
 expect(resizePair(300,200,900,80)).toEqual([420,80])
 expect(resizePair(300,200,-900,80)).toEqual([80,420])
})
it('does not reorder a tab when dropped on itself',()=>{
 expect(movePanel(initial,'layers','a','merge','layers')).toBe(initial)
})
