type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect'

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function SelectionModeIcon({ mode }: { mode: SelectionMode }) {
  const props = { className: 'selection-mode-icon', viewBox: '0 0 24 24', width: 20, height: 20, 'aria-hidden': true, focusable: false }
  if (mode === 'new') return <svg {...props}><rect {...common} x="4" y="4" width="16" height="16" strokeDasharray="3 2" /></svg>
  if (mode === 'add') return <svg {...props}><rect {...common} x="3.5" y="5" width="13" height="13" strokeDasharray="2.5 1.8" /><path {...common} d="M17.5 14.5v6M14.5 17.5h6" /></svg>
  if (mode === 'subtract') return <svg {...props}><rect {...common} x="3.5" y="5" width="13" height="13" strokeDasharray="2.5 1.8" /><path {...common} d="M14.5 17.5h6" /></svg>
  return <svg {...props}><rect {...common} x="3.5" y="5" width="13" height="13" strokeDasharray="2.5 1.8" /><rect {...common} x="7.5" y="9" width="13" height="11" strokeDasharray="2.5 1.8" /><path d="M8 10h8v8H8Z" fill="currentColor" opacity=".18" /></svg>
}
