import { useEffect, useMemo, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { createUpdateController, type UpdateController, type UpdateLike, type UpdateProgress } from './updateClient'
import './update.css'

const browserStorage = {
  get: (key: string) => {
    try { return window.localStorage.getItem(key) } catch { return null }
  },
  set: (key: string, value: string) => {
    try { window.localStorage.setItem(key, value) } catch { /* storage is optional */ }
  },
}

function defaultController(): UpdateController {
  return createUpdateController({ check: () => check() as Promise<UpdateLike | null>, isDesktop: () => isTauri(), relaunch, now: () => Date.now() }, browserStorage)
}

type Props = { controller?: UpdateController; delayMs?: number }

export function UpdateManager({ controller, delayMs = 1800 }: Props) {
  const updateController = useMemo(() => controller ?? defaultController(), [controller])
  const [update, setUpdate] = useState<UpdateLike | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [status, setStatus] = useState<'available' | 'downloading' | 'ready' | 'error'>('available')
  const [progress, setProgress] = useState<UpdateProgress | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    const timer = window.setTimeout(() => {
      void updateController.checkForUpdate().then(result => {
        if (!cancelled && result) setUpdate(result)
      }).catch(() => { /* update checks must never block the editor */ })
    }, delayMs)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [delayMs, updateController])

  if (!update || dismissed) return null

  const install = async () => {
    setStatus('downloading'); setError('')
    try {
      await updateController.install(update, setProgress)
      setStatus('ready')
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : '更新下载失败，请稍后重试')
    }
  }
  const dismiss = () => {
    void update.close?.()
    setDismissed(true)
  }
  const percent = progress?.totalBytes ? Math.min(100, Math.round(progress.downloadedBytes / progress.totalBytes * 100)) : undefined
  return <div className="update-backdrop" role="presentation">
    <section className="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title" aria-label="发现新版本">
      <div className="update-dialog__eyebrow">DRAIVIO UPDATE</div>
      <h2 id="update-title">发现新版本 v{update.version}</h2>
      {update.body ? <p className="update-dialog__body">{update.body}</p> : <p className="update-dialog__body">新版本已经准备好，更新后即可使用最新功能。</p>}
      {status === 'downloading' ? <div className="update-progress" role="status"><div className="update-progress__label">正在下载更新…{percent === undefined ? '' : ` ${percent}%`}</div><div className="update-progress__track"><span style={{ width: `${percent ?? 35}%` }} /></div></div> : null}
      {status === 'ready' ? <p className="update-dialog__body">更新已安装，应用将重启以完成更新。</p> : null}
      {status === 'error' ? <p className="update-dialog__error" role="alert">{error}</p> : null}
      <div className="update-dialog__actions">
        {status === 'error' ? <button type="button" className="update-button update-button--primary" onClick={() => void install()}>重试</button> : null}
        {status === 'available' ? <button type="button" className="update-button update-button--primary" onClick={() => void install()}>现在更新</button> : null}
        {status === 'downloading' ? <button type="button" className="update-button" disabled>正在更新</button> : null}
        {status === 'ready' ? <button type="button" className="update-button" disabled>即将重启</button> : null}
        {status === 'available' || status === 'error' ? <button type="button" className="update-button" onClick={dismiss}>稍后提醒</button> : null}
      </div>
    </section>
  </div>
}
