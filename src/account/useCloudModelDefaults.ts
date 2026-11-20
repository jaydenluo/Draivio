import { useEffect, useRef } from 'react'
import { officialDefaultModel, OFFICIAL_CLOUD_ID } from './cloudModels'
import { cloudAccount } from './cloudAccount'
import { useCloudAccount } from './useCloudAccount'
import { saveAssistantSelection } from '../creation/useAssistantModel'
import { message } from '../ui/message'

/** Apply each available modality once per login, independently of composer/window mounts. */
export function useCloudModelDefaults(chooseImage: (displayName: string) => void) {
  const account = useCloudAccount()
  const session = useRef({ identity: '', image: false, text: false })
  useEffect(() => {
    if (!account.authenticated) {
      session.current = { identity: '', image: false, text: false }
      return
    }
    const identity = `${cloudAccount.getOrigin()}\n${account.user?.email ?? ''}`
    if (session.current.identity !== identity) session.current = { identity, image: false, text: false }
    const image = officialDefaultModel('image'), text = officialDefaultModel('text')
    if (image && !session.current.image) {
      session.current.image = true
      chooseImage(image.displayName)
    }
    if (text && !session.current.text) {
      session.current.text = true
      try { saveAssistantSelection({ sourceId: OFFICIAL_CLOUD_ID, model: text.code }) }
      catch { message.warning('未能保存云端推理模型选择，请在创作区重新选择', { key: 'cloud-default-model' }) }
    }
  }, [account, chooseImage])
}
