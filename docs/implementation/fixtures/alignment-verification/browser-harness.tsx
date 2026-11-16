// Development-only verification entry, not imported by production routing.
import React, {useState} from 'react'
import {createRoot} from 'react-dom/client'
import {AppShell} from '../../../../src/app/AppShell'
import {EditorProvider,useEditor} from '../../../../src/state/editor'
import {decodeProject,projectFingerprint} from '../../../../src/document/projectFormat'
import '../../../../src/styles/theme.css'
import three from './three-layers.draivio?raw'
import negative from './negative-gaps.draivio?raw'
import hierarchy from './hierarchy-locks.draivio?raw'
function Controls(){
 const {state,dispatch}=useEditor();const [baseline,setBaseline]=useState('')
 const load=(source:string)=>{const data=decodeProject(source);setBaseline(projectFingerprint(data.document));dispatch({type:'restore-project',document:data.document})}
 return <aside style={{position:'fixed',left:80,bottom:12,zIndex:10000,background:'#fff',color:'#222',border:'1px solid #aaa',padding:6,display:'flex',gap:6}}>
  <button onClick={()=>load(three)}>载入三对象测试</button><button onClick={()=>load(negative)}>载入负间距测试</button><button onClick={()=>load(hierarchy)}>载入层级锁定测试</button>
  <output aria-label="测试文档指纹">{baseline&&baseline===projectFingerprint(state)?'文档未变化':'文档已变化'}</output>
 </aside>
}
createRoot(document.getElementById('root')!).render(<EditorProvider><AppShell/><Controls/></EditorProvider>)
