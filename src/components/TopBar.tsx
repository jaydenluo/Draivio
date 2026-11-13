import { useEditor } from '../state/editor'
import { useState } from 'react'
import { serializeEditorSvg } from '../canvas/documentIO'

export function TopBar() {
  const { state, dispatch } = useEditor()
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountView, setAccountView] = useState<'menu' | 'keys' | 'billing'>('menu')
  const [apiKey, setApiKey] = useState(() => window.localStorage.getItem('draivio-api-key') ?? '')
  const toggleAccount = () => { setAccountOpen((open) => !open); setAccountView('menu') }
  const exportCanvas = () => {
    const svg = document.querySelector('.canvas-art')
    if (!svg) return dispatch({ type: 'set-notice', message: '没有可导出的画布' })
    const blob = new Blob([serializeEditorSvg(svg as SVGSVGElement, state.cropRect)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'draivio-canvas.svg'
    link.click()
    URL.revokeObjectURL(url)
    dispatch({ type: 'set-notice', message: '画布已导出为 SVG' })
  }
  return <header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true" /><strong>Draivio</strong></div><div className="project-title"><span>春日海报</span><span className="unsaved-dot" aria-label="有未保存修改" /><span className="muted">未保存</span>{state.notice ? <span className="top-notice" role="status">{state.notice}</span> : null}</div><div className="top-actions"><div className="balance">云端 <b>1,280 积分</b></div><button className="top-button" onClick={exportCanvas}>导出</button><div className="account-wrap"><button className="avatar" aria-label="账户设置" aria-expanded={accountOpen} onClick={toggleAccount}>SZ</button>{accountOpen ? <div className="account-popover" role="dialog" aria-label={accountView === 'menu' ? '账户设置' : accountView === 'keys' ? 'API Key 设置' : '云服务充值'}>{accountView === 'menu' ? <><strong>账户设置</strong><button onClick={() => setAccountView('keys')}>API Key</button><button onClick={() => setAccountView('billing')}>云服务充值</button></> : accountView === 'keys' ? <><strong>API Key 设置</strong><label htmlFor="account-api-key">API Key</label><input id="account-api-key" aria-label="API Key 输入框" value={apiKey} onChange={(event) => setApiKey(event.target.value)} /><button onClick={() => { window.localStorage.setItem('draivio-api-key', apiKey); dispatch({ type: 'set-notice', message: 'API Key 已保存' }); setAccountOpen(false) }}>保存 API Key</button><button onClick={() => setAccountView('menu')}>返回</button></> : <><strong>云服务充值</strong><button onClick={() => dispatch({ type: 'set-notice', message: '已选择 100 积分充值' })}>100 积分 · ¥10</button><button onClick={() => dispatch({ type: 'set-notice', message: '已选择 1,000 积分充值' })}>1,000 积分 · ¥90</button><button onClick={() => { dispatch({ type: 'set-notice', message: '充值订单已创建' }); setAccountOpen(false) }}>确认充值</button><button onClick={() => setAccountView('menu')}>返回</button></>}</div> : null}</div></div><span className="sr-only">当前缩放 {state.zoom}%</span></header>
}
