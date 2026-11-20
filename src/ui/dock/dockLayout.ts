export type DockGroup = { id: string; tabs: string[]; active: string; weight: number; collapsed: boolean }
export type DropPlacement = 'before' | 'merge' | 'after'
export type DockTarget = { groupId: string; placement: DropPlacement; beforeTab?: string }
const groupId = () => `dock-${globalThis.crypto.randomUUID()}`

export function restoreLayout(value: unknown, panels: string[]): DockGroup[] {
  const seen = new Set<string>(), ids = new Set<string>()
  const groups: DockGroup[] = []
  for (const item of Array.isArray(value) ? value : []) {
    if (!item || !Array.isArray(item.tabs)) continue
    const tabs = item.tabs.filter((id: unknown): id is string => typeof id === 'string' && panels.includes(id) && !seen.has(id) && !!seen.add(id))
    if (!tabs.length) continue
    const id = typeof item.id === 'string' && !ids.has(item.id) ? item.id : groupId()
    ids.add(id)
    groups.push({ id, tabs, active: tabs.includes(item.active) ? item.active : tabs[0], weight: Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1, collapsed: item.collapsed === true })
  }
  const missing = panels.filter(id => !seen.has(id))
  if (missing.length) {
    if (groups.length) groups[0].tabs.push(...missing)
    else groups.push({ id: groupId(), tabs: missing, active: missing[0], weight: 1, collapsed: false })
  }
  return groups
}

export function movePanel(groups: DockGroup[], panel: string, targetId: string, placement: DropPlacement, beforeTab?: string): DockGroup[] {
  const source = groups.find(group => group.tabs.includes(panel)), target = groups.find(group => group.id === targetId)
  if (!source || !target || source === target && (source.tabs.length === 1 || placement === 'merge' && beforeTab === panel)) return groups
  let next = groups.map(group => ({ ...group, tabs: group.tabs.filter(id => id !== panel), active: group.active === panel ? group.tabs.find(id => id !== panel) ?? panel : group.active }))
  if (placement === 'merge') {
    next = next.map(group => {
      if (group.id !== targetId) return group
      const tabs = [...group.tabs], index = beforeTab ? tabs.indexOf(beforeTab) : -1
      tabs.splice(index < 0 ? tabs.length : index, 0, panel)
      return { ...group, tabs, active: panel, collapsed: false }
    })
  } else {
    const index = next.findIndex(group => group.id === targetId)
    const weight = target.weight / 2
    next[index] = { ...next[index], weight }
    next.splice(index + (placement === 'after' ? 1 : 0), 0, { id: groupId(), tabs: [panel], active: panel, weight, collapsed: false })
  }
  return next.filter(group => group.tabs.length)
}

export function resizePair(first: number, second: number, delta: number, minimum: number): [number, number] {
  const total = first + second, min = Math.min(minimum, total / 2)
  const size = Math.max(min, Math.min(total - min, first + delta))
  return [size, total - size]
}
