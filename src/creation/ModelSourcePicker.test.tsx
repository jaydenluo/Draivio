import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelSourcePicker } from './ModelSourcePicker'

describe('ModelSourcePicker', () => {
  it('shows the selected source summary and billing hint', () => {
    render(<ModelSourcePicker sourceId="openai-custom" modelCode="gpt-image-2.5" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: /OpenAI · 自定义密钥/ })).toBeInTheDocument()
    expect(screen.getByText('费用由 OpenAI 账户承担')).toBeInTheDocument()
  })

  it('selects a source and only shows its models', () => {
    const onSourceChange = vi.fn()
    render(<ModelSourcePicker sourceId="draivio-cloud" modelCode="image-pro" onSourceChange={onSourceChange} onModelChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Draivio 云端/ }))
    fireEvent.click(screen.getByRole('button', { name: /火山引擎/ }))
    expect(onSourceChange).toHaveBeenCalledWith('volcengine-custom', 'gpt-image-2.5')
    expect(screen.queryByRole('button', { name: 'Image Pro' })).not.toBeInTheDocument()
  })
})
