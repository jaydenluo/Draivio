import {useSyncExternalStore} from 'react'
import {cloudAccount} from './cloudAccount'
export function useCloudAccount(){return useSyncExternalStore(cloudAccount.subscribe,cloudAccount.getSnapshot,cloudAccount.getSnapshot)}
