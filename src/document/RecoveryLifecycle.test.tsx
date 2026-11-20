import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { EditorProvider } from '../state/editor'
import { AppShell } from '../app/AppShell'
import { createDocumentSession } from './documentWorkspace'
import { createRecoveryStore } from './recoveryStore'
import { encodeProject } from './projectFormat'
import { encodeWorkspace, WORKSPACE_RECOVERY_KEY } from './workspaceRecovery'

beforeEach(()=>{localStorage.removeItem(WORKSPACE_RECOVERY_KEY);localStorage.removeItem('draivio-recovery-snapshots')})
test('real editor startup and view initialization do not recreate a discarded snapshot',async()=>{
 const old=createDocumentSession('仅测试恢复副本',{width:640,height:480})
 localStorage.setItem(WORKSPACE_RECOVERY_KEY,await encodeWorkspace({documents:[old],activeId:old.id}))
 const legacy=createRecoveryStore()
 await legacy.save({documentId:'draivio-default-document',savedAt:Date.now(),projectVersion:1,payload:await encodeProject(old.state,old.metadata)})
 const view=render(<EditorProvider><AppShell/></EditorProvider>)
 await screen.findByRole('dialog',{name:'恢复编辑'})
 vi.useFakeTimers()
 try{
  fireEvent.click(screen.getByRole('button',{name:'丢弃'}))
  fireEvent.click(screen.getByRole('button',{name:'确认丢弃'}))
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000)})
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
  expect(await legacy.list('draivio-default-document')).toEqual([])
  view.unmount()
  render(<EditorProvider><AppShell/></EditorProvider>)
  await act(async()=>{await vi.advanceTimersByTimeAsync(3000)})
  expect(screen.queryByRole('dialog',{name:'恢复编辑'})).not.toBeInTheDocument()
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
 }finally{vi.useRealTimers()}
})
