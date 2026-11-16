export type RunStatus = 'planning' | 'validating' | 'running' | 'preview' | 'committed' | 'failed' | 'cancelled' | 'blocked'
export type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'blocked'
export type StepRunState = { id: string; status: StepStatus; attempts: number; result?: unknown; error?: string; dependsOn: string[] }
export type RunState = { runId: string; status: RunStatus; steps: Record<string, StepRunState>; progress: number; error?: string; startedAt?: number; finishedAt?: number; cancellationReason?: string }
export function createRunState(runId: string, stepIds: Array<{id:string;dependsOn?:string[]}>): RunState {
  const steps: Record<string,StepRunState> = {}
  for (const step of stepIds) steps[step.id] = { id: step.id, status: 'pending', attempts: 0, dependsOn: [...(step.dependsOn ?? [])] }
  return { runId, status: 'planning', steps, progress: 0 }
}
export function runProgress(state: RunState) {
  const values = Object.values(state.steps); return values.length ? Math.round(values.filter(s => ['succeeded','failed','cancelled','blocked'].includes(s.status)).length / values.length * 100) : 100
}
