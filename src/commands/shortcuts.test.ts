import { beforeEach, expect, it } from 'vitest'
import { commands, eventShortcut, matchesShortcut, readBindings, saveBindings, shortcutConflict, shortcutFor } from './shortcuts'
beforeEach(()=>localStorage.removeItem('draivio-keyboard-shortcuts-v1'))
it('has unique Photoshop defaults and recognizes Windows and macOS modifiers',()=>{
 const assigned=commands.map(c=>c.shortcut).filter(Boolean)
 expect(new Set(assigned).size).toBe(assigned.length)
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'d',ctrlKey:true}),'deselect')).toBe(true)
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'j',metaKey:true}),'duplicate')).toBe(true)
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,shiftKey:true}),'new')).toBe(false)
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'n',ctrlKey:true,shiftKey:true}),'addLayer')).toBe(true)
 expect(eventShortcut(new KeyboardEvent('keydown',{key:'˚',code:'KeyK',metaKey:true,altKey:true,shiftKey:true}))).toBe('Mod+Alt+Shift+k')
})
it('persists custom bindings, disables cleared commands, and finds conflicts',()=>{
 saveBindings({'tool:brush':'k',save:'Mod+Alt+s',undo:''})
 expect(readBindings()).toEqual({'tool:brush':'k',save:'Mod+Alt+s',undo:''})
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'b'}),'tool:brush')).toBe(false)
 expect(matchesShortcut(new KeyboardEvent('keydown',{key:'k'}),'tool:brush')).toBe(true)
 expect(shortcutFor('undo')).toBe('')
 expect(shortcutConflict('save','Mod+j',{})).toMatchObject({id:'duplicate'})
 expect(shortcutConflict('save','Mod+Alt+s',readBindings())).toBeUndefined()
 saveBindings({})
 expect(shortcutFor('save')).toBe('Mod+s')
})
it('ignores malformed storage instead of breaking editor startup',()=>{
 localStorage.setItem('draivio-keyboard-shortcuts-v1','broken')
 expect(readBindings()).toEqual({})
})
