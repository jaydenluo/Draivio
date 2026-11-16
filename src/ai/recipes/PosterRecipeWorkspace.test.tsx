import {fireEvent,render,screen,waitFor,act} from '@testing-library/react'
import {it,expect} from 'vitest'
import {EditorProvider,useEditor,snapshot,type EditorState,type EditorAction} from '../../state/editor'
import {PosterRecipeWorkspace} from './PosterRecipeWorkspace'
import {encodeProject,decodeProject} from '../../document/projectFormat'
let current:EditorState,edit:(action:EditorAction)=>void
function Harness(){const {state,dispatch}=useEditor();current=state;edit=dispatch;return <PosterRecipeWorkspace/>}
function mount(){render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('海报排版'))}
function previewApply(){fireEvent.click(screen.getByText('预览海报'));expect(screen.queryByRole('alert')).toBeNull();fireEvent.click(screen.getByText('确认应用'))}
const oldText={id:'existing-text',layerId:'existing-text-layer',x:10,y:20,text:'原有可编辑文字',fontFamily:'sans-serif',fontSize:24,fontWeight:'400',color:'#123456',align:'left' as const}

it('creates backing text layers, preserves original source/object identity and applies as one undo',async()=>{
 mount();act(()=>edit({type:'create-text-layer',object:oldText}))
 const existingText=current!.canvasTexts.find(text=>text.id===oldText.id)!
 const before=snapshot(current!),original=current!.layers.find(layer=>layer.id==='art')!,undo=current!.undoStack.length
 fireEvent.change(screen.getByLabelText('海报标题'),{target:{value:'独特长中文标题'}})
 fireEvent.change(screen.getByLabelText('海报原图'),{target:{value:'art'}})
 fireEvent.change(screen.getByLabelText('海报商标'),{target:{value:'original'}})
 previewApply()
 expect(current!.canvasTexts).toContainEqual(existingText)
 const added=current!.canvasTexts.filter(text=>text.id!==oldText.id)
 expect(added).toHaveLength(2)
 for(const text of added)expect(current!.layers.find(layer=>layer.id===text.layerId)).toMatchObject({kind:'text',textObjectId:text.id,visible:true})
 expect(new Set(current!.layers.map(layer=>layer.id)).size).toBe(current!.layers.length)
 expect(current!.layers.filter(layer=>layer.id==='art')).toHaveLength(1)
 expect(current!.layers.find(layer=>layer.id==='art')).toMatchObject({...original,locked:true,posterProtection:{reason:'source-protected',sourceLayerId:'art'}})
 expect(current!.layers.filter(layer=>layer.posterProtection)).toHaveLength(2)
 expect(current!.undoStack).toHaveLength(undo+1)
 const restored=decodeProject(await encodeProject(current!,{id:'poster-protected',name:'海报'}))
 expect(restored.document.canvasTexts).toContainEqual(existingText)
 expect(restored.document.layers.find(layer=>layer.id==='art')?.source).toBe(original.source)
 act(()=>edit({type:'undo'}));expect(snapshot(current!)).toEqual(before)
 act(()=>edit({type:'redo'}));expect(current!.canvasTexts).toContainEqual(existingText)
})

it('repeated application keeps previous text, source layers and IDs unique in a valid saved project',async()=>{
 mount();fireEvent.change(screen.getByLabelText('海报原图'),{target:{value:'art'}});previewApply()
 const previous=current!.canvasTexts.map(text=>({...text}))
 fireEvent.click(screen.getByText('海报排版'));fireEvent.change(screen.getByLabelText('海报标题'),{target:{value:'第二次标题'}});previewApply()
 for(const text of previous)expect(current!.canvasTexts).toContainEqual(text)
 expect(current!.canvasTexts).toHaveLength(4)
 expect(new Set(current!.canvasTexts.map(text=>text.id)).size).toBe(4)
 expect(new Set(current!.layers.map(layer=>layer.id)).size).toBe(current!.layers.length)
 expect(new Set(current!.artboards.map(board=>board.id)).size).toBe(current!.artboards.length)
 await expect(encodeProject(current!,{id:'poster-repeat',name:'重复应用'})).resolves.toContain('第二次标题')
})

it('rejects stale apply but captures a fresh basis on re-preview, and cancel never changes the document',()=>{
 mount();const original=snapshot(current!)
 fireEvent.click(screen.getByText('预览海报'));fireEvent.click(screen.getByText('取消'))
 expect(snapshot(current!)).toEqual(original)
 fireEvent.click(screen.getByText('海报排版'));fireEvent.click(screen.getByText('预览海报'))
 act(()=>edit({type:'set-layer-opacity',id:'art',opacity:42}))
 const edited=snapshot(current!)
 fireEvent.click(screen.getByText('确认应用'));expect(screen.getByRole('alert')).toHaveTextContent('文档已更改')
 expect(snapshot(current!)).toEqual(edited)
 fireEvent.click(screen.getByText('预览海报'));expect(screen.queryByRole('alert')).toBeNull()
 fireEvent.click(screen.getByText('确认应用'));expect(current!.canvasTexts).toHaveLength(2)
 act(()=>edit({type:'undo'}));expect(snapshot(current!)).toEqual(edited)
})

it('imports local logo images through a file picker and protects their original bytes',async()=>{
 mount();const source='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
 const file=new File([Uint8Array.from(atob(source),char=>char.charCodeAt(0))],'商标.png',{type:'image/png'})
 fireEvent.change(screen.getByLabelText('导入海报商标'),{target:{files:[file]}})
 await waitFor(()=>expect(screen.getByLabelText('海报商标')).not.toHaveValue(''))
 previewApply()
 const logo=current!.layers.find(layer=>layer.posterProtection?.reason==='logo-protected')!
 expect(logo.source).toBe(`data:image/png;base64,${source}`);expect(logo.locked).toBe(true)
 const restored=decodeProject(await encodeProject(current!,{id:'poster-import',name:'本地商标'}))
 expect(restored.document.layers.find(layer=>layer.id===logo.id)?.source).toBe(logo.source)
})

it('requires font fallback acknowledgement and rejects overflowing text without mutation',()=>{
 mount();const before=snapshot(current!)
 fireEvent.change(screen.getByLabelText('海报字体'),{target:{value:'Missing Font'}})
 fireEvent.click(screen.getByText('预览海报'));expect(screen.getByRole('alert')).toHaveTextContent('字体未验证')
 fireEvent.change(screen.getByLabelText('海报宽度'),{target:{value:'120'}});fireEvent.change(screen.getByLabelText('海报高度'),{target:{value:'120'}});fireEvent.change(screen.getByLabelText('海报安全边距'),{target:{value:'20'}})
 fireEvent.click(screen.getByLabelText('确认字体可能回退'));fireEvent.click(screen.getByText('预览海报'));expect(screen.getByRole('alert')).toHaveTextContent('溢出')
 expect(snapshot(current!)).toEqual(before)
})

it('refuses unverified export glyphs and retains the entered title and document',()=>{
 mount();const before=snapshot(current!)
 fireEvent.change(screen.getByLabelText('海报标题'),{target:{value:'家庭👩‍👩‍👧‍👦海报'}})
 fireEvent.click(screen.getByText('预览海报'))
 expect(screen.getByRole('alert')).toHaveTextContent('尚未验证导出字形')
 expect(screen.getByLabelText('海报标题')).toHaveValue('家庭👩‍👩‍👧‍👦海报')
 expect(screen.getByText('确认应用')).toBeDisabled()
 expect(snapshot(current!)).toEqual(before)
})
