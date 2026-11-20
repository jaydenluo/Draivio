import { paintBucketOutline, paintBucketDrop } from '../tools/paintBucketGlyph'
import type { ToolId } from '../tools/toolTypes'
export const isRoundBrush=(tool:ToolId)=>['brush','pencil','gradient-brush','soft-brush','eraser','healing','remove-object','clone-stamp','patch','dodge','burn','mask','mask-quick','smudge'].includes(tool)
const iconCursor=(path:string,hotspot='3 25')=>`url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><g fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${path}</g><g fill="none" stroke="#222" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${path}</g></svg>`)}") ${hotspot}, crosshair`
// The separated crosshair is the click point; the bucket is only a tool badge.
const bucket=iconCursor(`<path d="M2 6h2M8 6h2M6 2v2M6 8v2"/><circle data-cursor-hotspot="true" cx="6" cy="6" r=".65"/><g transform="translate(12 12) scale(.72)"><path d="${paintBucketOutline}"/><path d="${paintBucketDrop}"/></g>`,'6 6')
const picker=iconCursor('<path d="m23 3 6 6-5 5-2-2L9 25l-6 2 2-6L18 8l-2-2 5-5M7 19l6 6"/>','3 27')
export function toolCursor(tool:ToolId,unavailable=false,busy=false):string{
 if(busy)return 'wait'
 if(unavailable)return 'not-allowed'
 if(tool==='fill')return bucket
 if(tool==='picker')return picker
 if(tool==='text')return 'text'
 if(tool==='pan'||tool==='move'||tool==='select'||tool==='rotate')return 'grab'
 if(tool==='zoom')return 'zoom-in'
 return 'crosshair'
}
