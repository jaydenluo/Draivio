import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { readComposerImage, type ComposerImage } from './composerImage'
import { readComposerPreferences, saveComposerPreferences } from './composerPreferences'
import type { ImageEditTarget } from './imageEditTarget'

type ManualMode = 'generate' | 'edit' | 'smart' | 'auto'
function savedMode(): ManualMode {
  const mode = readComposerPreferences().creationMode
  return mode === 'edit' || mode === 'generate' || mode === 'smart' ? mode : 'auto'
}
const ComposerDraftContext = createContext<{
  reference: ComposerImage | null
  imageError: string
  readingImage: boolean
  manualMode: ManualMode
  editTarget: ImageEditTarget
  setEditTarget: (target:ImageEditTarget)=>void
  setManualMode: (mode: ManualMode) => void
  preferMode: (mode: ManualMode) => void
  addImage: (file?: File) => Promise<void>
  removeImage: () => void
  useResultImage: (image:ComposerImage)=>void
} | null>(null)

// Keep transient input outside the two composer mount points, and out of project
// files, autosave and undo history. Docking must not discard an attachment.
export function ComposerDraftProvider({ documentId, children }: { documentId: string; children: ReactNode }) {
  const [reference, setReference] = useState<ComposerImage | null>(null)
  const [imageError, setImageError] = useState('')
  const [readingImage, setReadingImage] = useState(false)
  const [manualMode, setManualMode] = useState<ManualMode>(savedMode)
  const [editTarget,setEditTarget]=useState<ImageEditTarget>('auto')
  const epoch = useRef(0)
  const removeImage = useCallback(() => {
    epoch.current++
    setReference(null)
    setImageError('')
    setReadingImage(false)
    setEditTarget(target=>target==='upload'?'auto':target)
  }, [])
  useEffect(() => {
    removeImage()
    setManualMode(savedMode())
    setEditTarget('auto')
    return () => { epoch.current++ }
  }, [documentId, removeImage])
  const addImage = async (file?: File) => {
    if (!file) return
    const ticket = ++epoch.current
    setImageError('')
    setReadingImage(true)
    try {
      const image = await readComposerImage(file)
      if (epoch.current === ticket) setReference(image)
    } catch (error) {
      if (epoch.current === ticket) setImageError(error instanceof Error ? error.message : '图片读取失败')
    } finally {
      if (epoch.current === ticket) setReadingImage(false)
    }
  }
  const preferMode = (mode: ManualMode) => {
    setManualMode(mode)
    saveComposerPreferences({ creationMode: mode })
  }
  const useResultImage=(image:ComposerImage)=>{epoch.current++;setReference(image);setImageError('');setReadingImage(false);setManualMode('edit');setEditTarget('upload')}
  return <ComposerDraftContext.Provider value={{ reference, imageError, readingImage, manualMode, setManualMode, preferMode, editTarget,setEditTarget, addImage, removeImage,useResultImage }}>{children}</ComposerDraftContext.Provider>
}

export function useComposerDraft() {
  const draft = useContext(ComposerDraftContext)
  if (!draft) throw new Error('ComposerDraftProvider is required')
  return draft
}
