import {it,expect} from 'vitest'
import {defaultGuideSettings,updateGuideSettings,validateGuideSettings} from './guides'
it('edits guides immutably, locks prevent accidental movement/deletion, JSON roundtrip preserves settings',()=>{
 const base=defaultGuideSettings(),added=updateGuideSettings(base,{type:'add',guide:{id:'v',axis:'x',position:125,locked:false}})
 expect(base.guides).toHaveLength(0)
 const moved=updateGuideSettings(added,{type:'move',id:'v',position:-20}),locked=updateGuideSettings(moved,{type:'lock',id:'v',locked:true})
 expect(()=>updateGuideSettings(locked,{type:'move',id:'v',position:30})).toThrow(/锁定/)
 expect(()=>updateGuideSettings(locked,{type:'delete',id:'v'})).toThrow(/锁定/)
 const configured=updateGuideSettings(locked,{type:'settings',patch:{grid:{...locked.grid,spacingX:32,spacingY:16},snapEnabled:false}})
 expect(validateGuideSettings(JSON.parse(JSON.stringify(configured)))).toEqual(configured)
 const unlocked=updateGuideSettings(configured,{type:'lock',id:'v',locked:false});expect(updateGuideSettings(unlocked,{type:'delete',id:'v'}).guides).toHaveLength(0)
})
it('rejects duplicate IDs, invalid positions, invalid grid spacing and unknown schema fields',()=>{
 const s=updateGuideSettings(defaultGuideSettings(),{type:'add',guide:{id:'v',axis:'y',position:1,locked:false}})
 expect(()=>updateGuideSettings(s,{type:'add',guide:s.guides[0]})).toThrow()
 expect(()=>updateGuideSettings(s,{type:'move',id:'v',position:NaN})).toThrow()
 expect(()=>validateGuideSettings({...s,grid:{...s.grid,spacingX:0}})).toThrow()
 expect(()=>validateGuideSettings({...s,unexpected:true})).toThrow()
 expect(()=>updateGuideSettings(s,{type:'delete',id:'unknown'})).toThrow()
})
