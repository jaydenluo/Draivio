import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ModelManagerDialog } from '../models/ModelManagerDialog'
import { OutputFormatPicker } from '../creation/OutputFormatPicker'
import { ModelSourcePicker } from '../creation/ModelSourcePicker'
import { ColorPicker } from '../components/ColorPicker'
import { BillingDialog } from '../components/BillingDialog'
import { EditorProvider } from '../state/editor'
import { VectorEditor } from '../vector/VectorEditor'
import { RecoveryNotice } from '../document/RecoveryNotice'
import { CmykDialog } from '../color/CmykDialog'
import { PrecisionDialog } from '../render/PrecisionDialog'
import { SoftProofDialog } from '../color/SoftProofDialog'
import { RawControls } from '../raw/RawControls'

test.each(['模型管理', '比例与分辨率', '选择模型', '前景颜色选择器', '云服务充值', '矢量路径编辑', '恢复编辑', '文档模式与 CMYK', '高精度资源', '校样设置', 'RAW 显影'])('%s has a draggable title and a working top-right close button', async name => {
  const close = vi.fn()
  if (name === '模型管理') render(<ModelManagerDialog open onClose={close} />)
  if (name === '比例与分辨率') render(<OutputFormatPicker ratio="1:1" size="1024" onChoose={vi.fn()} onClose={close} />)
  if (name === '选择模型') {
    render(<ModelSourcePicker sourceId="draivio" modelCode="" onClose={close} onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型：/ }))
  }
  if (name === '前景颜色选择器') { render(<ColorPicker label="前景" value="#ffffff" onChange={vi.fn()} />); fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器：前景' })) }
  if (name === '云服务充值') render(<BillingDialog onClose={close} />)
  if (name === '矢量路径编辑') { render(<EditorProvider><VectorEditor /></EditorProvider>); fireEvent.click(screen.getByRole('button', { name: '编辑矢量路径' })) }
  if (name === '恢复编辑') render(<RecoveryNotice documents={[{id:'a',name:'作品',width:500,height:625}]} onRestore={vi.fn()} onDiscard={vi.fn()} />)
  if (name === '文档模式与 CMYK') render(<EditorProvider><CmykDialog onClose={close} /></EditorProvider>)
  if (name === '高精度资源') render(<EditorProvider><PrecisionDialog onClose={close} /></EditorProvider>)
  if (name === '校样设置') render(<EditorProvider><SoftProofDialog onClose={close} /></EditorProvider>)
  if (name === 'RAW 显影') { render(<EditorProvider><RawControls /></EditorProvider>); fireEvent.click(screen.getByRole('button', {name:'RAW 显影'})) }
  const dialog = await screen.findByRole('dialog', { name })
  const draggableSurface = dialog.closest<HTMLElement>('.composer-anchored-popover') ?? dialog
  vi.spyOn(draggableSurface, 'getBoundingClientRect').mockReturnValue({ left: 200, top: 100, right: 500, bottom: 300, width: 300, height: 200, x: 200, y: 100, toJSON: () => ({}) })
  const titlebar = dialog.querySelector('header')!
  expect(titlebar).toBeInTheDocument()
  fireEvent.pointerDown(titlebar.querySelector('strong') ?? titlebar, { pointerId: 1, button: 0, clientX: 230, clientY: 120 })
  fireEvent.pointerMove(window, { pointerId: 1, clientX: 280, clientY: 150 })
  fireEvent.pointerUp(window, { pointerId: 1 })
  expect(draggableSurface.style.translate).toBe('50px 30px')
  const closeButton = within(titlebar).getByRole('button', { name: /^(关闭|收起恢复提示)/ })
  fireEvent.pointerDown(closeButton, { pointerId: 2, button: 0, clientX: 400, clientY: 120 })
  fireEvent.pointerMove(window, { pointerId: 2, clientX: 500, clientY: 200 })
  fireEvent.pointerUp(window, { pointerId: 2 })
  expect(draggableSurface.style.translate).toBe('50px 30px')
  fireEvent.click(closeButton.querySelector('svg') ?? closeButton)
  if (['前景颜色选择器', '矢量路径编辑', '恢复编辑', 'RAW 显影'].includes(name)) expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument()
  else expect(close).toHaveBeenCalledTimes(1)
})

test('billing requests login without inventing a balance or purchasable packages', () => {
  render(<BillingDialog onClose={vi.fn()} />)
  expect(screen.queryByRole('group', { name: '积分套餐' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认充值' })).not.toBeInTheDocument()
  expect(screen.getByText('登录后查看积分余额及充值套餐。')).toBeInTheDocument()
})
