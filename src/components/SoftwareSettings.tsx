import { isTauri } from '@tauri-apps/api/core'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { invokeCommand } from '../lib/native'
import { AnchoredWindow } from '../ui/AnchoredWindow'
import { exportFormats, readFilePreferences, saveFilePreferences, type FilePreferences } from '../document/filePreferences'
import './softwareSettings.css'

type ImageDirectory = { directory: string; defaultDirectory: string; isDefault: boolean }
const categories = [
  { id: 'storage', label: '存储', description: '生成图片与保存位置' },
  { id: 'files', label: '导入与导出', description: '尺寸、色彩、格式与质量' },
  { id: 'shortcuts', label: '快捷键', description: '查看和自定义键位' },
  { id: 'services', label: 'AI 服务', description: '服务来源与模型' },
] as const

export function SoftwareSettings({ anchor, onClose, onOpenShortcuts, onOpenServices }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void
  onOpenShortcuts?: () => void; onOpenServices?: () => void
}) {
  const [category, setCategory] = useState<typeof categories[number]['id']>('storage')
  const [preferences, setPreferences] = useState(readFilePreferences)
  const [saveFeedback, setSaveFeedback] = useState<'saved' | 'error' | null>(null)
  const editPreferences = (patch: Partial<FilePreferences>) => {
    setPreferences(current => ({ ...current, ...patch }))
    setSaveFeedback(null)
  }
  const persistPreferences = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      saveFilePreferences(preferences)
      setSaveFeedback('saved')
    } catch {
      setSaveFeedback('error')
    }
  }
  const desktop = isTauri()
  const [settings, setSettings] = useState<ImageDirectory | null>(null)
  const [busy, setBusy] = useState(desktop)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    if (desktop) void invokeCommand<ImageDirectory>('result_library_settings').then(value => {
      if (alive.current) setSettings(value)
    }).catch(reason => { if (alive.current) setError(reason instanceof Error ? reason.message : '读取图片目录失败') }).finally(() => { if (alive.current) setBusy(false) })
    return () => { alive.current = false }
  }, [desktop])
  const change = async (command: 'result_library_choose_directory' | 'result_library_reset_directory') => {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const value = await invokeCommand<ImageDirectory | null>(command)
      // The native chooser commits independently of this window's lifecycle.
      if (value) window.dispatchEvent(new Event('draivio:result-library-changed'))
      if (value && alive.current) { setSettings(value); setNotice('已保存，新生成图片将使用此目录。') }
    } catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : '保存图片目录失败') }
    finally { if (alive.current) setBusy(false) }
  }
  return <AnchoredWindow anchor={anchor} title="软件设置" onClose={onClose} width={680} className="software-settings">
    <div className="software-settings-layout">
      <nav className="software-settings-nav" aria-label="设置分类">
        {categories.filter(item => (item.id !== 'shortcuts' || onOpenShortcuts) && (item.id !== 'services' || onOpenServices)).map(item => <button
          key={item.id} type="button" aria-label={item.label} aria-current={category === item.id ? 'true' : undefined}
          onClick={() => setCategory(item.id)}>
          <span>{item.label}</span><small>{item.description}</small>
        </button>)}
      </nav>
      <div className="software-settings-content">
    {category === 'storage' && <section aria-label="图片保存设置">
      <h3>生成图片</h3>
      {desktop ? <label htmlFor="generated-images-directory">自动保存目录</label> : <p className="software-settings-label">自动保存目录</p>}
      {desktop ? <input id="generated-images-directory" readOnly value={settings?.directory ?? ''} placeholder={busy ? '正在读取目录…' : '目录读取失败，请重新打开设置'} title={settings?.directory} /> : <p className="software-settings-path">浏览器本地存储（当前网站）</p>}
      <div className="software-settings-actions">
        <button type="button" disabled={!desktop || busy} onClick={() => void change('result_library_choose_directory')}>选择文件夹</button>
        {desktop ? <button type="button" disabled={busy || !settings || settings.isDefault} onClick={() => void change('result_library_reset_directory')}>恢复默认</button> : null}
      </div>
      {desktop ? <>
        <p>生成成功后自动保存原图。更改目录后，已有图片保留在原位置，仍可在本地作品库中查看。</p>
        {settings ? <p className="software-settings-default">默认目录：<span>{settings.defaultDirectory}</span></p> : null}
      </> : <p>网页版使用浏览器本地存储自动保存图片，暂不支持指定磁盘目录。「保存图片」会通过浏览器下载。</p>}
      {busy ? <p role="status">{settings ? '正在设置保存目录…' : '正在读取设置…'}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
    </section>}
    {category === 'files' && <form aria-label="导入与导出默认值" onSubmit={persistPreferences}>
      <section aria-label="导入默认值">
        <h3>导入默认值</h3>
        <label className="software-settings-row">默认导入尺寸
          <select value={preferences.importSizing} onChange={event => editPreferences({ importSizing: event.currentTarget.value === 'canvas' ? 'canvas' : 'auto' })}>
            <option value="auto">跟随原图尺寸</option><option value="canvas">保持当前画布</option>
          </select>
        </label>
        <label className="software-settings-row">默认导入色彩策略
          <select value={preferences.importProfile} onChange={event => editPreferences({ importProfile: event.currentTarget.value === 'assign' ? 'assign' : 'preserve' })}>
            <option value="preserve">保留嵌入 ICC · 缺失按 sRGB</option><option value="assign">指定文档 ICC · 保留通道数值</option>
          </select>
        </label>
      </section>
      <section aria-label="导出默认值">
        <h3>导出默认值</h3>
        <label className="software-settings-row">默认导出格式
          <select value={preferences.exportFormat ?? ''} onChange={event => {
            const value = event.currentTarget.value
            editPreferences({ exportFormat: exportFormats.find(format => format === value) })
          }}>
            <option value="">沿用上次设置</option>
            {exportFormats.map(format => <option key={format} value={format}>{format.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="software-settings-row">默认压缩质量
          <input type="number" min={1} max={100} step={1} placeholder="沿用上次设置" value={preferences.exportQuality ?? ''} onChange={event => {
            const quality = event.currentTarget.valueAsNumber
            editPreferences({ exportQuality: Number.isNaN(quality) ? undefined : quality })
          }} />
        </label>
        <p>压缩质量仅用于 JPEG 和 WebP，范围为 1–100。留空沿用上次设置。</p>
      </section>
      <div className="software-settings-actions"><button className="software-settings-save" type="submit">保存导入与导出默认值</button></div>
      {saveFeedback === 'saved' && <p role="status">已保存，下次打开导入或导出窗口时生效。</p>}
      {saveFeedback === 'error' && <p role="alert">无法保存默认值，请检查本地存储后重试。</p>}
    </form>}
    {category === 'shortcuts' && <section aria-label="快捷键设置">
      <h3>键盘快捷键</h3>
      <p>查找命令、修改键位，或恢复默认快捷键。</p>
      <div className="software-settings-actions"><button type="button" onClick={onOpenShortcuts}>管理键盘快捷键</button></div>
    </section>}
    {category === 'services' && <section aria-label="AI 服务设置">
      <h3>AI 服务来源</h3>
      <p>管理服务来源、API 密钥和可用模型。</p>
      <div className="software-settings-actions"><button type="button" onClick={onOpenServices}>管理服务来源</button></div>
    </section>}
      </div>
    </div>
  </AnchoredWindow>
}
