import { Checkbox } from '../ui/Checkbox'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import '../styles/service-settings.css'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { SettingsDialog } from '../components/SettingsDialog'
import type { ServiceConnection } from './serviceConnections'
import { updateConnections, useServiceSources } from './modelSources'
import { ServiceSourceEditor } from './ServiceSourceEditor'
import { message, type MessageHandle } from '../ui/message'

export function openServiceSettings() { window.dispatchEvent(new Event('draivio:service-settings')) }
const newConnection = (): ServiceConnection => ({ id: `custom-${crypto.randomUUID()}`, provider: 'OpenAI', name: '', baseUrl: 'https://api.openai.com/v1', apiKey: '', protocol: 'openai_compatible', models: [], enabled: true })

export function ServiceSourceSettings({ onClose }: { onClose: () => void }) {
  const { connections, error, ready } = useServiceSources()
  const [draft, setDraft] = useState<ServiceConnection | null>(null)
  const closeEditor = useCallback(() => setDraft(null), [])
  const [busy, setBusy] = useState(false)
  const messageKey = useId()
  const feedback = useRef<MessageHandle | null>(null)
  const [legacyKey] = useState(() => { try { return localStorage.getItem('draivio-api-key') ?? '' } catch { return '' } })
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; feedback.current?.close() } }, [])
  useEffect(() => { if (error) message.error(error, { key: 'service-storage' }) }, [error])
  const toggle = async (id: string) => {
    if (!ready || error) return
    setBusy(true)
    feedback.current = message.loading('正在更新服务来源…', { key: messageKey })
    try { await updateConnections(connections.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item)); if (mounted.current) feedback.current?.success('服务来源已更新') }
    catch { if (mounted.current) feedback.current?.error('保存失败，请检查本地存储后重试') }
    finally { feedback.current = null; if (mounted.current) setBusy(false) }
  }
  return <>
    <SettingsDialog label="服务来源管理" variant="drawer" inactive={!!draft} onClose={onClose}>
      <DialogTitlebar title="服务来源" closeLabel="关闭服务来源" onClose={onClose} />
      <div className="service-source-actions">{legacyKey ? <button disabled={busy || !!error || !ready} onClick={() => setDraft({ ...newConnection(), name: '旧配置', apiKey: legacyKey })}>导入旧密钥</button> : null}<button aria-label="添加来源" disabled={busy || !!error || !ready} onClick={() => setDraft(newConnection())}>＋ 添加来源</button></div>
      <p className="service-drawer-description">管理供应商账号与启用的模型</p>
      <div className="service-settings-list" role="region" aria-label="服务来源列表">
        <div className="service-settings-row"><div className="service-source-copy"><strong>Draivio 云端</strong><small>登录积分 · 内置</small></div><button type="button" onClick={() => { onClose(); window.dispatchEvent(new Event('draivio:cloud-recharge')) }}>充值</button></div>
        {connections.map(item => <div className="service-settings-row" key={item.id}>
          <Checkbox aria-label={`启用 ${item.provider} · ${item.name}`} checked={item.enabled} disabled={busy || !!error || !ready} onChange={() => void toggle(item.id)} />
          <div className="service-source-copy"><strong>{item.provider} · {item.name}</strong><small>{item.models.length ? `${item.models.length} 个模型` : '未选择模型'}{!item.enabled ? ' · 已停用' : ''}</small></div>
          <button disabled={busy || !!error || !ready} aria-label={`编辑 ${item.provider} · ${item.name}`} onClick={() => setDraft({ ...item })}>编辑</button>
        </div>)}
      </div>
      <div className="service-drawer-footer"><p className="service-storage-note">来源配置和 API Key 保存在本机，不随项目导出。</p></div>
    </SettingsDialog>
    {draft ? <ServiceSourceEditor key={draft.id} initialConnection={draft} isExisting={connections.some(item => item.id === draft.id)} onClose={closeEditor} /> : null}
  </>
}
