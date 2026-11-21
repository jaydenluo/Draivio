import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import { cloudAccount } from './account/cloudAccount'
import { removeLegacyPasswords } from './account/rememberedLogin'

removeLegacyPasswords()
const maintainCloudSession = () => { void cloudAccount.maintainSession().catch(() => {}) }
maintainCloudSession()
window.addEventListener('online', maintainCloudSession)
window.addEventListener('focus', maintainCloudSession)
window.setInterval(maintainCloudSession, 30 * 60 * 1000)


ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
