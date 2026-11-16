import type { ConversationRun } from '../conversation/session'
import type { RunState } from '../execution/runState'

export function EditRunSummary({ state, runs = [], onCancel, onUndo }: { state: RunState | null; runs?: ConversationRun[]; onCancel?: () => void; onUndo?: () => void }) {
  if (!state && !runs.length) return <div className="edit-run-summary edit-run-summary--empty" aria-live="polite">输入一句话开始编辑</div>
  const current = state ?? {status:'committed',progress:100} as RunState
  const label = current.status === 'running' ? `执行中 ${current.progress}%` : current.status === 'committed' ? '已完成' : current.status === 'preview' ? '待确认' : current.status === 'cancelled' ? '已取消' : current.status === 'blocked' ? '已阻塞' : current.status === 'failed' ? '执行失败' : '正在检查'
  return <div className="edit-run-summary" aria-live="polite"><strong>{label}</strong>{current.error ? <span role="alert">{current.error}</span> : null}{current.cancellationReason ? <span>{current.cancellationReason}</span> : null}{runs.length ? <ol aria-label="当前文档 AI 操作记录">{runs.slice(-5).map(run => <li key={run.runId}>{run.status === 'undone' ? '已撤销' : '已采用'} · {run.results.map(result => `${result.tool} → ${result.targetIds.join('、')}${result.changed ? '（已更改）' : '（无变化）'}`).join('；')}{run.steps?.length ? <details><summary>步骤参数 · 工具版本 {run.toolVersion ?? '未记录'}</summary><ul>{run.steps.map(step => <li key={step.id}>{step.tool}：{JSON.stringify(step.args)}</li>)}</ul></details> : null}</li>)}</ol> : null}<div className="edit-run-summary-actions">{current.status === 'running' ? <button type="button" onClick={onCancel}>取消</button> : null}{current.status === 'committed' ? <button type="button" onClick={onUndo}>撤销本次编辑</button> : null}</div></div>
}
