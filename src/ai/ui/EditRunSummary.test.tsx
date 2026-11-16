import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditRunSummary } from './EditRunSummary'
describe('EditRunSummary', () => {
  it('shows empty, progress, cancellation and undo feedback', () => {
    const cancel = vi.fn(), undo = vi.fn()
    const base = { runId:'x', steps:{}, progress:50 } as any
    render(<><EditRunSummary state={null}/><EditRunSummary state={{...base,status:'running'}} onCancel={cancel}/><EditRunSummary state={{...base,status:'committed'}} onUndo={undo}/></>)
    expect(screen.getByText('输入一句话开始编辑')).toBeTruthy(); screen.getByText('取消').click(); screen.getByText('撤销本次编辑').click(); expect(cancel).toHaveBeenCalled(); expect(undo).toHaveBeenCalled()
  })
})
