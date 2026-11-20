import { expect, test } from 'vitest'
import { toolCursor } from './toolCursor'

test('bucket cursor hotspot coincides with its visible aiming point',()=>{
 const cursor=toolCursor('fill')
 const match=cursor.match(/^url\("data:image\/svg\+xml,([^\"]+)"\) (\d+) (\d+), crosshair$/)!
 expect(match).not.toBeNull()
 const svg=new DOMParser().parseFromString(decodeURIComponent(match[1]),'image/svg+xml')
 const aim=svg.querySelector('[data-cursor-hotspot]')
 expect(aim).not.toBeNull()
 expect(Number(aim!.getAttribute('cx'))).toBe(Number(match[2]))
 expect(Number(aim!.getAttribute('cy'))).toBe(Number(match[3]))
})
test('unavailable and busy bucket states keep their feedback cursors',()=>{
 expect(toolCursor('fill',true)).toBe('not-allowed')
 expect(toolCursor('fill',false,true)).toBe('wait')
})
