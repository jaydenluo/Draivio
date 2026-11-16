import { useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { messageStore } from '../ui/message'
import '../styles/message.css'

export function MessageHost() {
  const items = useSyncExternalStore(messageStore.subscribe, messageStore.getSnapshot)
  const [target, setTarget] = useState<HTMLElement>(document.body)
  useEffect(() => {
    const update = () => {
      const dialogs = document.querySelectorAll<HTMLElement>('.service-settings[aria-modal="true"]:not([aria-hidden="true"])')
      setTarget(dialogs.item(dialogs.length - 1) ?? document.body)
    }
    const observer = new MutationObserver(update)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'aria-hidden'] })
    update()
    return () => observer.disconnect()
  }, [])
  return createPortal(<div className="message-host" aria-label="消息通知">{items.map(item => <div className={`app-message app-message--${item.type}`} key={item.id} role={item.type === 'error' ? 'alert' : 'status'}>
    <span className={`app-message-icon${item.type === 'loading' ? ' is-loading' : ''}`} aria-hidden="true">{item.type === 'loading' ? '◌' : item.type === 'success' ? '✓' : item.type === 'error' ? '×' : item.type === 'warning' ? '!' : 'i'}</span>
    <span>{item.content}</span><button type="button" aria-label="关闭消息" onClick={() => messageStore.close(item.id)}>×</button>
  </div>)}</div>, target)
}
