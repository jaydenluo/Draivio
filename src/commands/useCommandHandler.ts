import { useEffect, useRef } from 'react'
import { COMMAND_EVENT } from './shortcuts'
export function useCommandHandler(id:string,handler:()=>void){
 const latest=useRef(handler);latest.current=handler
 useEffect(()=>{const run=(event:Event)=>{if((event as CustomEvent<string>).detail===id)latest.current()};window.addEventListener(COMMAND_EVENT,run);return()=>window.removeEventListener(COMMAND_EVENT,run)},[id])
}
