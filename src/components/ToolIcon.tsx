import type { ToolId } from '../tools/toolTypes'

type ToolIconProps = { toolId: ToolId; className?: string }

const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

export function ToolIcon({ toolId, className = '' }: ToolIconProps) {
  const props = { className: `tool-icon ${className}`.trim(), viewBox: '0 0 24 24', width: 24, height: 24, 'aria-hidden': true, focusable: false }
  switch (toolId) {
    case 'select': return <svg {...props}><path {...common} d="M5 3.5 18.5 15l-6 .7 3.4 5.2-2.3 1.4-3.3-5.3-3.4 4.2Z" /></svg>
    case 'move': return <svg {...props}><path {...common} d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></svg>
    case 'selection': return <svg {...props}><path {...common} d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><circle {...common} cx="12" cy="12" r="3" /></svg>
    case 'rectangle-select': return <svg {...props}><rect {...common} x="4" y="5" width="16" height="14" strokeDasharray="2.5 2" /></svg>
    case 'ellipse-select': return <svg {...props}><ellipse {...common} cx="12" cy="12" rx="8" ry="6.5" strokeDasharray="2.5 2" /></svg>
    case 'lasso-select': return <svg {...props}><path {...common} d="M18.7 8.3c1.3 3.4-1.5 7.7-5.8 9.3-4.5 1.7-8.8.3-8.8-3.1 0-2.6 2.6-5.2 5.9-6.5 3.4-1.3 6.8-.8 8.7 1.1 1 1.1 1.2 2.4.7 3.5" /><circle {...common} cx="7.2" cy="17.5" r="1.4" /></svg>
    case 'polygon-select': return <svg {...props}><path {...common} d="m5 6 8-2 6 5-3 10-9 1-3-8Z" /><circle fill="currentColor" cx="5" cy="6" r="1.3" /><circle fill="currentColor" cx="13" cy="4" r="1.3" /><circle fill="currentColor" cx="19" cy="9" r="1.3" /><circle fill="currentColor" cx="16" cy="19" r="1.3" /><circle fill="currentColor" cx="7" cy="20" r="1.3" /><circle fill="currentColor" cx="4" cy="12" r="1.3" /></svg>
    case 'bezier-select': return <svg {...props}><path {...common} d="M5 18c3-8 6-10 14-12M5 18h2M19 6h-2" /><circle {...common} cx="5" cy="18" r="2" /><circle {...common} cx="19" cy="6" r="2" /></svg>
    case 'magic-wand': return <svg {...props}><path {...common} d="m6 18 9.8-9.8M4.5 19.5l2-2M15.8 5.2l1.1-1.1M18.8 8.2l1.1-1.1" /><path {...common} d="M18.5 12v4M16.5 14h4M6 4v4M4 6h4" /></svg>
    case 'brush': return <svg {...props}><path {...common} d="m14.5 4.2 5.3 5.3-8.5 8.5-5.3-5.3Z" /><path {...common} d="m6 12.7-2.5 2.5M4 19.8c2.2.3 3.7-.4 4.5-2.2.5-1.1-.1-2.1-1.2-2.6" /><path {...common} d="m17 6 2 2" /></svg>
    case 'pencil': return <svg {...props}><path {...common} d="m5 17.7-1 3.3 3.3-1L19.5 7.8a2.1 2.1 0 0 0-3.3-2.6Z" /><path {...common} d="m14.3 6.7 3 3" /></svg>
    case 'gradient-brush': return <svg {...props}><path {...common} d="m14.5 4.2 5.3 5.3-8.5 8.5-5.3-5.3Z" /><path {...common} d="M6 13 3.5 15.5M4 20c2.4.2 4-.7 4.7-2.4" /><path d="M5 5h1M9 5h1M13 5h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".35" /></svg>
    case 'brush-line': return <svg {...props}><path {...common} d="m5 19 14-14M5 19h4M19 5v4" /><circle {...common} cx="5" cy="19" r="2" /><circle {...common} cx="19" cy="5" r="2" /></svg>
    case 'soft-brush': return <svg {...props}><circle {...common} cx="12" cy="12" r="7" opacity=".35" /><circle {...common} cx="12" cy="12" r="4.5" /><path {...common} d="m15.3 8.7 4.2-4.2" /></svg>
    case 'smudge': return <svg {...props}><path {...common} d="M8.4 20c-1.3-2.4-2.2-4.7-2.2-7.5 0-1.2.6-2 1.4-2 .7 0 1.1.5 1.4 1.3V6.4c0-.9.5-1.5 1.2-1.5s1.2.6 1.2 1.5v4.1-5.8c0-.9.5-1.5 1.2-1.5s1.2.6 1.2 1.5v5.8-4.1c0-.9.5-1.5 1.2-1.5s1.2.6 1.2 1.5v5.7c.5-.8 1.1-1.2 1.7-1.2.9 0 1.3.8 1 1.7l-1.6 4.7c-.6 1.7-1.8 2.7-3.5 2.7Z" /></svg>
    case 'eraser': return <svg {...props}><path {...common} d="m5 15 8.8-9a2 2 0 0 1 2.9 0l2.3 2.3a2 2 0 0 1 0 2.9L10 20H6.5L4 17.5a2 2 0 0 1 0-2.5Z" /><path {...common} d="m10 20 5-5" /></svg>
    case 'background-eraser': return <svg {...props}><path {...common} d="m5 15 8.8-9a2 2 0 0 1 2.9 0l2.3 2.3a2 2 0 0 1 0 2.9L10 20H6.5L4 17.5a2 2 0 0 1 0-2.5Z" /><path {...common} d="M16.5 4v3M15 5.5h3" /></svg>
    case 'healing': return <svg {...props}><path {...common} d="m5.2 15.7 7.5-7.5a3.2 3.2 0 0 1 4.5 4.5l-7.5 7.5a3.2 3.2 0 0 1-4.5-4.5Z" /><path {...common} d="m9 12 3 3M11.5 9.5l3 3" /></svg>
    case 'clone-stamp': return <svg {...props}><path {...common} d="M8 10.5V8a4 4 0 1 1 8 0v2.5" /><path {...common} d="M6 10.5h12v3H6zM8 13.5v4h8v-4M5 20h14" /></svg>
    case 'mask': return <svg {...props}><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path {...common} d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16" fill="currentColor" opacity=".25" /></svg>
    case 'mask-quick': return <svg {...props}><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path {...common} d="m12 7-3 5h3l-1 5 4-6h-3Z" /></svg>
    case 'mask-gradient': return <svg {...props}><rect {...common} x="4" y="4" width="16" height="16" rx="2" /><path d="M7 17 17 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity=".65" /><path d="M7 17 17 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    case 'mask-subject': return <svg {...props}><circle {...common} cx="12" cy="8" r="3" /><path {...common} d="M6.5 19c.4-3.6 2.1-5.5 5.5-5.5s5.1 1.9 5.5 5.5M4 4v3M4 4h3M20 4v3M20 4h-3M4 20v-3M4 20h3M20 20v-3M20 20h-3" /></svg>
    case 'crop': return <svg {...props}><path {...common} d="M7 3v14a2 2 0 0 0 2 2h12M3 7h14a2 2 0 0 1 2 2v12M3 3h4M3 3v4M21 21h-4M21 21v-4" /></svg>
    case 'perspective-crop': return <svg {...props}><path {...common} d="m5 6 14-2-2 15-14 1Z" /><circle fill="currentColor" cx="5" cy="6" r="1.3" /><circle fill="currentColor" cx="19" cy="4" r="1.3" /><circle fill="currentColor" cx="17" cy="19" r="1.3" /><circle fill="currentColor" cx="3" cy="20" r="1.3" /></svg>
    case 'transform': return <svg {...props}><rect {...common} x="5" y="5" width="14" height="14" rx="1" /><path {...common} d="M9 3H5v4M15 21h4v-4M21 9V5h-4M3 15v4h4" /><path {...common} d="m8 12 4-4 4 4-4 4Z" opacity=".55" /></svg>
    case 'text': return <svg {...props}><path {...common} d="M5 5h14M12 5v14M8 19h8" /><path {...common} d="M8 5 6 9M16 5l2 4" /></svg>
    case 'shape': return <svg {...props}><rect {...common} x="5" y="5" width="14" height="14" rx="1.5" /></svg>
    case 'shape-ellipse': return <svg {...props}><ellipse {...common} cx="12" cy="12" rx="7.5" ry="6" /></svg>
    case 'shape-line': return <svg {...props}><path {...common} d="m5 19 14-14" /><path {...common} d="M5 15v4h4M15 5h4v4" /></svg>
    case 'shape-arrow': return <svg {...props}><path {...common} d="M5 19 19 5M10 5h9v9" /></svg>
    case 'pen': return <svg {...props}><path {...common} d="m12 3 7 7-9.5 9.5L4 20l.5-5.5Z" /><path {...common} d="m12 3 2.5 2.5L8 12" /><path {...common} d="M4 20l5.5-.5" /></svg>
    case 'picker': return <svg {...props}><path {...common} d="m14.5 4.5 5 5M12 7l5 5M5 19l2.5-2.5M8 16l8-8a2.8 2.8 0 0 1 4 4l-8 8H8Z" /><circle {...common} cx="5" cy="19" r="2" /></svg>
    case 'fill': return <svg {...props}><path {...common} d="m5 11 6-6 8 8-6 6H7Z" /><path {...common} d="M13 19h6c1.1 0 2-.9 2-2v-1M16 21h.1" /></svg>
    case 'gradient-fill': return <svg {...props}><rect {...common} x="4" y="5" width="16" height="14" rx="2" /><path d="M6 17 18 7" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity=".3" /><path d="M6 17 18 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
    case 'pan': return <svg {...props}><path {...common} d="M8 11V6.5a1.5 1.5 0 0 1 3 0V10M11 9V5a1.5 1.5 0 0 1 3 0v5M14 10V6.5a1.5 1.5 0 0 1 3 0v6M17 12v-2a1.5 1.5 0 0 1 3 0v5c0 4-2 6-6 6h-2c-2.2 0-3.6-1.1-4.5-2.5L5 16a1.5 1.5 0 0 1 2.6-1.5L8 15V11" /></svg>
    case 'zoom': return <svg {...props}><circle {...common} cx="10.5" cy="10.5" r="6" /><path {...common} d="m15 15 5 5M10.5 7.5v6M7.5 10.5h6" /></svg>
    case 'rotate': return <svg {...props}><path {...common} d="M5 10a7 7 0 1 1 2 7" /><path {...common} d="M5 5v5h5" /></svg>
    default: return <svg {...props}><circle {...common} cx="12" cy="12" r="7" /><path {...common} d="M12 8v8M8 12h8" /></svg>
  }
}
