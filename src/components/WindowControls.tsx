import { getVersion } from '@tauri-apps/api/app'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEffect, useState } from 'react'

export function shouldRenderWindowControls(isDesktopRuntime: boolean, userAgent: string) {
  return isDesktopRuntime && !/Macintosh|Mac OS X/.test(userAgent)
}

type AppWindow = ReturnType<typeof getCurrentWindow>
let appWindow: AppWindow | null = null

function currentWindow() {
  return appWindow ?? (appWindow = getCurrentWindow())
}

export function AppVersionLabel({ isDesktopRuntime }: { isDesktopRuntime: boolean }) {
  const [version, setVersion] = useState(isDesktopRuntime ? '版本未知' : '开发版')

  useEffect(() => {
    if (!isDesktopRuntime) return
    void getVersion().then((value) => setVersion(`v${value}`)).catch(() => setVersion('版本未知'))
  }, [isDesktopRuntime])

  return <span className="app-titlebar-product">{version}</span>
}

export function WindowControls() {
  const isDesktopRuntime = isTauri() && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  const showControls = shouldRenderWindowControls(isDesktopRuntime, userAgent)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    if (!isDesktopRuntime) return
    let active = true
    void currentWindow().isMaximized().then((value) => {
      if (active) setMaximized(value)
    })
    return () => { active = false }
  }, [isDesktopRuntime])

  if (!showControls) return null

  const minimize = () => void currentWindow().minimize()
  const toggleMaximize = async () => {
    await currentWindow().toggleMaximize()
    setMaximized(await currentWindow().isMaximized())
  }
  const close = () => void currentWindow().close()

  return <div className="window-controls" aria-label="窗口控制">
    <button type="button" aria-label="最小化" title="最小化" onClick={minimize}><span className="window-icon window-icon-minimize" aria-hidden="true" /></button>
    <button type="button" aria-label={maximized ? '还原' : '最大化'} title={maximized ? '还原' : '最大化'} onClick={() => void toggleMaximize()}><span className={`window-icon ${maximized ? 'window-icon-restore' : 'window-icon-maximize'}`} aria-hidden="true" /></button>
    <button type="button" className="window-close" aria-label="关闭" title="关闭" onClick={close}><span className="window-icon window-icon-close" aria-hidden="true" /></button>
  </div>
}
