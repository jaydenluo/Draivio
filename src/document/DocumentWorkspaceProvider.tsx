import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { EditorProvider, initialEditorState, useEditor, type EditorState } from '../state/editor'
import type { ProjectLocation } from './projectStorage'
import { useRef } from 'react'
import { createRecoveryStore } from './recoveryStore'
import { createRecoveryScheduler } from './recoveryScheduler'
import { encodeProject, projectFingerprint } from './projectFormat'

export type WorkspaceTab = { id: string; name: string; state: EditorState; dirty: boolean; location?: ProjectLocation; savedFingerprint?: string; savedRevision?: string }
type WorkspaceContextValue = { tabs: WorkspaceTab[]; activeId: string; activate: (id: string) => void; create: (options?: { width?: number; height?: number; background?: string }) => void; open: (state: EditorState, name?: string) => void; updateMeta: (id: string, patch: Partial<Pick<WorkspaceTab, 'name' | 'location' | 'savedFingerprint' | 'dirty'>>) => void; markSaved: (id: string) => void; close: (id?: string, discard?: boolean) => boolean }
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function freshState(options: { width?: number; height?: number; background?: string } = {}) {
  const id = crypto.randomUUID()
  return { ...initialEditorState, documentId: id, documentSessionId: crypto.randomUUID(), documentRevision: 'initial', documentWidth: options.width ?? initialEditorState.documentWidth, documentHeight: options.height ?? initialEditorState.documentHeight, documentBackground: options.background ?? initialEditorState.documentBackground, history: [...initialEditorState.history], undoStack: [], redoStack: [] }
}

function WorkspaceRecoveryHub({ tabs }: { tabs: WorkspaceTab[] }) {
  const store = useRef(createRecoveryStore()).current
  const schedulers = useRef(new Map<string, ReturnType<typeof createRecoveryScheduler>>()).current
  useEffect(() => {
    for (const tab of tabs) {
      let scheduler = schedulers.get(tab.id)
      if (!scheduler) {
        scheduler = createRecoveryScheduler(store, () => {})
        schedulers.set(tab.id, scheduler)
      }
      if (tab.dirty) {
        const fingerprint = projectFingerprint(tab.state)
        scheduler.update({
          documentId: tab.id,
          sessionId: tab.state.documentSessionId,
          fingerprint: `${tab.name}:${fingerprint}`,
          encode: () => encodeProject(tab.state, { id: tab.id, name: tab.name }).then(payload => ({ documentId: tab.id, sessionId: tab.state.documentSessionId, projectVersion: Date.now(), savedAt: Date.now(), name: tab.name, payload }))
        })
      } else scheduler.invalidate(tab.id)
    }
    for (const [id, scheduler] of schedulers) if (!tabs.some(tab => tab.id === id)) { scheduler.dispose(); schedulers.delete(id); store.invalidate(id) }
  }, [tabs, schedulers, store])
  useEffect(() => () => { for (const scheduler of schedulers.values()) scheduler.dispose() }, [schedulers])
  return null
}

function WorkspaceBridge({ tab, onChange, children }: { tab: WorkspaceTab; onChange: (state: EditorState) => void; children: ReactNode }) {
  const { state } = useEditor()
  useEffect(() => { if (state !== tab.state) onChange(state) }, [state, tab.state, onChange])
  return <>{children}</>
}

export function DocumentWorkspaceProvider({ children }: { children: ReactNode }) {
  const first = useMemo(() => { const state = freshState(); return { id: state.documentId, name: '未命名作品', state, dirty: false, savedRevision: state.documentRevision } }, [])
  const [tabs, setTabs] = useState<WorkspaceTab[]>([first])
  const [activeId, setActiveId] = useState<string>(first.id)
  const active = tabs.find(tab => tab.id === activeId) ?? tabs[0]
  const update = useCallback((state: EditorState) => setTabs(items => items.map(tab => tab.id === activeId ? { ...tab, state, dirty: tab.dirty || (state.documentRevision !== 'initial' && state.documentRevision !== tab.savedRevision) } : tab)), [activeId])
  const activate = useCallback((id: string) => { if (tabs.some(tab => tab.id === id)) setActiveId(id) }, [tabs])
  const create = useCallback((options: { width?: number; height?: number; background?: string } = {}) => { if (tabs.length >= 16) return; const state = freshState(options); setTabs(items => [...items, { id: state.documentId, name: '未命名作品', state, dirty: false, savedRevision: state.documentRevision }]); setActiveId(state.documentId) }, [tabs.length])
  const open = useCallback((state: EditorState, name = '未命名作品') => { if (tabs.length >= 16) return; setTabs(items => [...items, { id: state.documentId, name, state, dirty: false, savedRevision: state.documentRevision }]); setActiveId(state.documentId) }, [tabs.length])
  const updateMeta = useCallback((id: string, patch: Partial<Pick<WorkspaceTab, 'name' | 'location' | 'savedFingerprint' | 'dirty'>>) => setTabs(items => items.map(tab => tab.id === id ? { ...tab, ...patch } : tab)), [])
  const markSaved = useCallback((id: string) => setTabs(items => items.map(tab => tab.id === id ? { ...tab, dirty: false, savedRevision: tab.state.documentRevision } : tab)), [])
  const close = useCallback((id = activeId, discard = false) => { const target = tabs.find(tab => tab.id === id); if (target?.dirty && !discard) return false; setTabs(items => { if (items.length === 1) { const state = freshState(); setActiveId(state.documentId); return [{ id: state.documentId, name: '未命名作品', state, dirty: false, savedRevision: state.documentRevision }] } const index = items.findIndex(tab => tab.id === id); const next = items.filter(tab => tab.id !== id); if (id === activeId) setActiveId(next[Math.max(0, index - 1)].id); return next }); return true }, [activeId, tabs])
  const value = useMemo(() => ({ tabs, activeId, activate, create, open, updateMeta, markSaved, close }), [tabs, activeId, activate, create, open, updateMeta, markSaved, close])
  return <WorkspaceContext.Provider value={value}><WorkspaceRecoveryHub tabs={tabs} /><EditorProvider key={active.id} initialState={active.state} onStateChange={update}><WorkspaceBridge tab={active} onChange={update}>{children}</WorkspaceBridge></EditorProvider></WorkspaceContext.Provider>
}

export function useDocumentWorkspace() { return useContext(WorkspaceContext) }
