import type { ProjectDocument } from './projectFormat'
export type ProjectLifecycle = { documentId: string; sessionId: string; name: string; savedFingerprint?: string; dirty: boolean }
export type RecoveryRequest = { document: ProjectDocument; name: string; sourceDocumentId: string; expectedSessionId: string; expectedRevision: string; isCurrent?: () => boolean; onRestored?: () => void }
export const PROJECT_LIFECYCLE = 'draivio:project-lifecycle'
export const QUERY_PROJECT_LIFECYCLE = 'draivio:query-project-lifecycle'
export const REQUEST_RECOVERY = 'draivio:request-recovery'
