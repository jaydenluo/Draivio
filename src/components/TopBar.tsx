import { exportRangeDimensions, serializeExportScene } from '../canvas/exportScene'
import { ProjectFileControl } from '../document/ProjectFileControl'
import { DocumentSizeControl } from '../document/DocumentSizeControl'
import { cloudAccount } from '../account/cloudAccount'
import { useCloudAccount } from '../account/useCloudAccount'
import { CloudAccountDialog } from '../account/CloudAccountDialog'
import { BillingDialog } from './BillingDialog'
import { useEditor } from '../state/editor'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ServiceSourceSettings } from '../creation/ServiceSourceSettings'
import { message } from '../ui/message'
import { ExportDialog } from '../render/ExportDialog'

export function TopBar() {
  const { state, dispatch } = useEditor()
  const account = useCloudAccount()
  const [loginOpen, setLoginOpen] = useState(false)
  const closeLogin = useCallback(() => setLoginOpen(false), [])
  useEffect(() => {
    if (state.notice && !state.notice.startsWith('已收到第')) message.info(state.notice, { key: 'editor-notice' })
  }, [state.notice])
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRoot = useRef<HTMLDivElement>(null)
  const [billingOpen, setBillingOpen] = useState(false)
  const closeBilling = useCallback(() => setBillingOpen(false), [])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  useEffect(() => {
    const open = () => { setAccountOpen(false); setSettingsOpen(true) }
    const login = () => { setAccountOpen(false); setLoginOpen(true) }
    window.addEventListener('draivio:service-settings', open)
    window.addEventListener('draivio:cloud-login', login)
    return () => { window.removeEventListener('draivio:service-settings', open); window.removeEventListener('draivio:cloud-login', login) }
  }, [])
  useEffect(() => {
    if (!accountOpen) return
    accountRoot.current?.querySelector<HTMLButtonElement>('.account-popover button:not(:disabled)')?.focus()
    const pointerdown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountRoot.current?.contains(event.target)) setAccountOpen(false)
    }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); setAccountOpen(false)
        accountRoot.current?.querySelector<HTMLButtonElement>('.avatar')?.focus()
      }
    }
    document.addEventListener('pointerdown', pointerdown)
    document.addEventListener('keydown', keydown, true)
    return () => { document.removeEventListener('pointerdown', pointerdown); document.removeEventListener('keydown', keydown, true) }
  }, [accountOpen])
  const toggleAccount = () => setAccountOpen(open => !open)
  const exportSource = (range: 'canvas' | 'selection' | 'layer') => {
    const svg = document.querySelector('.canvas-art')
    if (!svg) throw new Error('没有可导出的画布')
    return serializeExportScene(svg as SVGSVGElement, {range, layerId:state.selectedLayerId, selection:state.selectionVisible?state.selection:undefined,cropRect:state.cropRect})
  }
  const canvasExportDimensions=exportRangeDimensions(state.documentWidth,state.documentHeight,'canvas',undefined,state.cropRect)
  const selectionExportDimensions=exportRangeDimensions(state.documentWidth,state.documentHeight,'selection',state.selection,state.cropRect)
  return <><header className="topbar"><div className="brand"><span className="brand-mark" aria-hidden="true" /><strong>Draivio</strong></div><ProjectFileControl /><DocumentSizeControl /><div className="top-actions"><button className="balance top-button" onClick={() => account.authenticated ? setBillingOpen(true) : setLoginOpen(true)} title={account.authenticated ? "查看实际账户余额" : "登录共用云端账号"}>{account.authenticated && account.balance !== null ? `${account.balance.toLocaleString("zh-CN", {maximumFractionDigits: 6})} 积分` : "登录云端"}</button><button className="top-button" onClick={() => { if (!document.querySelector('.canvas-art')) dispatch({ type: 'set-notice', message: '没有可导出的画布' }); else setExportOpen(true) }}>导出</button><div className="account-wrap" ref={accountRoot}><button className="avatar" title="账户与设置" aria-label="账户设置" aria-expanded={accountOpen} onClick={toggleAccount}>SZ</button>{accountOpen ? <div className="account-popover" role="dialog" aria-label="账户设置">
    <strong className="account-menu-heading">账户与设置</strong>{account.authenticated ? <p className="account-email">{account.user?.email}</p> : <button className="account-menu-item" aria-label="登录 / 注册" onClick={() => { setAccountOpen(false); setLoginOpen(true) }}>登录 / 注册</button>}
    <button className="account-menu-item" aria-label="服务来源" onClick={() => { setAccountOpen(false); setSettingsOpen(true) }}>
      <AccountMenuIcon kind="sources" /><span className="account-menu-copy"><span className="account-menu-title">服务来源</span><span className="account-menu-description">管理平台、密钥与模型生成设置</span></span>
    </button>
    <button className="account-menu-item" aria-label="云服务充值" onClick={() => { setAccountOpen(false); setBillingOpen(true) }}>
      <AccountMenuIcon kind="billing" /><span className="account-menu-copy"><span className="account-menu-title">云服务充值</span><span className="account-menu-description">查看积分与充值方案</span></span>
    </button>
    <div className="account-menu-divider" />
    <button className="account-menu-item account-menu-item--logout" aria-label="退出登录" disabled={!account.authenticated} onClick={() => { setAccountOpen(false); void cloudAccount.logout().catch(() => message.error("本机已退出，云端会话撤销失败，请稍后重试")) }}>
      <AccountMenuIcon kind="logout" /><span className="account-menu-copy"><span className="account-menu-title">退出登录</span><span className="account-menu-description">{account.authenticated ? "退出本次云端会话" : "当前未登录"}</span></span>
    </button>
  </div> : null}</div></div><span className="sr-only">当前缩放 {state.zoom}%</span>{settingsOpen ? <ServiceSourceSettings onClose={closeSettings} /> : null}{billingOpen ? <BillingDialog onClose={closeBilling} onLogin={() => { setBillingOpen(false); setLoginOpen(true) }} /> : null}{loginOpen ? <CloudAccountDialog onClose={closeLogin} /> : null}</header><ExportDialog documentKey={`${state.documentId}:${state.documentSessionId}:${state.documentRevision}`} selectionDimensions={selectionExportDimensions} open={exportOpen} svgSource={exportSource} documentWidth={canvasExportDimensions.width} documentHeight={canvasExportDimensions.height} hasSelection={state.selectionVisible && selectionExportDimensions.width>0 && selectionExportDimensions.height>0} selectedLayerName={state.layers.find((layer) => layer.id === state.selectedLayerId)?.name} onClose={() => setExportOpen(false)} onExport={(range) => dispatch({ type: 'set-notice', message: `已导出${range === 'selection' ? '选区' : range === 'layer' ? '当前图层' : '画布'}` })} /></>
}

function AccountMenuIcon({ kind }: { kind: 'sources' | 'billing' | 'logout' }) {
  return <svg className="account-menu-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'sources' ? <><rect x="3" y="4" width="18" height="6" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7h.01M7 17h.01M15 7h3M15 17h3" /></> : kind === 'billing' ? <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></> : <><path d="M10 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5M14 8l4 4-4 4M8 12h13" /></>}
  </svg>
}
