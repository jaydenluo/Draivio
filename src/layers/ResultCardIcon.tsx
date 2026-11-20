type IconKind='edit'|'save'|'favorite'|'remove'|'adopted'
export function ResultCardIcon({kind}:{kind:IconKind}){
 return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
  {kind==='edit'?<><path d="m14.5 5.5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z"/><path d="M13 20h7"/></>:null}
  {kind==='save'?<><path d="M12 3v12m-4-4 4 4 4-4"/><path d="M5 16v4h14v-4"/></>:null}
  {kind==='favorite'?<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3-4.6-4.5 6.4-.9L12 3Z"/>:null}
  {kind==='remove'?<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5m4-5v5"/></>:null}
  {kind==='adopted'?<path d="m5 12 4 4L19 6"/>:null}
 </svg>
}
