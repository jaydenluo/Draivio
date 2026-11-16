import { useEffect, useId, useRef, type ReactNode } from 'react'
import { TOOL_CANCEL_EVENT } from '../tools/useToolShortcuts'
import { moveSelection, resizeSelection, selectionContains, type Selection, type SelectionPath, type SelectionPoint } from './selectionGeometry'

type Props = {
  selection: Selection
  clientPoint: (x: number, y: number) => SelectionPoint
  onPreview: (selection: Selection) => void
  onCommit: (selection: Selection) => void
  onCancel: () => void
  interactive?: boolean
  movable?: boolean
}

/** Each expression node gets a luminance mask. Boolean operations never flatten to bounds. */
export function maskDefinitions(path: SelectionPath, id: string): ReactNode {
  let body: ReactNode
  let children: ReactNode = null
  const full = (fill: string, mask?: string) => <rect x="0" y="0" width="100" height="100" fill={fill} mask={mask ? `url(#${mask})` : undefined} />
  if (path.type === 'shape') {
    const r = path.rect
    body = path.kind === 'ellipse' ? <ellipse cx={r.x + r.width / 2} cy={r.y + r.height / 2} rx={r.width / 2} ry={r.height / 2} fill="white" /> : <rect {...r} fill="white" />
  } else if (path.type === 'raster' && path.alpha) {
    const width=path.alphaWidth??path.rows[0].length,height=path.alphaHeight??path.rows.length
    const runs:ReactNode[]=[]
    for(let y=0;y<height;y++)for(let x=0;x<width;){
      const value=path.alpha[y*width+x]??0,start=x
      while(x<width&&(path.alpha[y*width+x]??0)===value)x++
      if(value)runs.push(<rect key={`${y}-${start}`} x={start/width*100} y={y/height*100} width={(x-start)/width*100} height={100/height} fill={`rgb(${value},${value},${value})`}/>)
    }
    body=<g shapeRendering="crispEdges">{runs}</g>
  } else if ((path.type === 'raster' || path.type === 'path')) body = <path d={path.d} fill="white" />
  else if (path.type === 'boolean') {
    children = <>{maskDefinitions(path.left, `${id}-l`)}{maskDefinitions(path.right, `${id}-r`)}</>
    body = path.mode === 'intersect' ? <g mask={`url(#${id}-l)`}>{full('white', `${id}-r`)}</g> : <>{full('white', `${id}-l`)}{full(path.mode === 'subtract' ? 'black' : 'white', `${id}-r`)}</>
  } else if (path.type === 'inverse') {
    children = maskDefinitions(path.source, `${id}-s`)
    body = <>{full('white')}{full('black', `${id}-s`)}</>
  } else if (path.type === 'affine') {
    children = maskDefinitions(path.source, `${id}-s`)
    body = <g transform={`matrix(${path.matrix.join(' ')})`}>{full('white', `${id}-s`)}</g>
  } else {
    children = maskDefinitions(path.source, `${id}-s`)
    const sx = path.to.width / path.from.width; const sy = path.to.height / path.from.height
    body = <g transform={`matrix(${sx} 0 0 ${sy} ${path.to.x - path.from.x * sx} ${path.to.y - path.from.y * sy})`}>{full('white', `${id}-s`)}</g>
  }
  return <>{children}<mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style={{ maskType: 'luminance' }}>{full('black')}{body}</mask></>
}

export function SelectionOverlay({ selection, clientPoint, onPreview, onCommit, onCancel, interactive = true, movable = true }: Props) {
  const id = `selection-${useId().replace(/:/g, '')}`
  const gesture = useRef<{ handle: string; point: SelectionPoint; selection: Selection; draft: Selection; moved: boolean; target: HTMLElement; pointerId: number } | null>(null)
  useEffect(() => {
    const cancel = (event: Event) => {
      if (!gesture.current) return
      const current = gesture.current
      gesture.current = null
      current.target.releasePointerCapture?.(current.pointerId)
      event.preventDefault()
      onCancel()
    }
    window.addEventListener(TOOL_CANCEL_EVENT, cancel)
    return () => window.removeEventListener(TOOL_CANCEL_EVENT, cancel)
  }, [onCancel])
  const down = (handle: string) => (event: React.PointerEvent<HTMLElement>) => {
    if (!interactive || (event.button !== 0 && event.button !== undefined)) return
    const point = clientPoint(event.clientX, event.clientY)
    if (handle === 'move' && !selectionContains(selection.path, point)) return
    event.stopPropagation()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    gesture.current = { handle, point, selection, draft: selection, moved: false, target: event.currentTarget, pointerId: event.pointerId }
  }
  const move = (event: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return
    event.stopPropagation()
    const start = gesture.current
    const point = clientPoint(event.clientX, event.clientY)
    const delta = { x: point.x - start.point.x, y: point.y - start.point.y }
    start.moved = Math.abs(delta.x) + Math.abs(delta.y) > .01
    start.draft = start.handle === 'move' ? moveSelection(start.selection, delta.x, delta.y) : resizeSelection(start.selection, start.handle, delta)
    onPreview(start.draft)
  }
  const up = (event: React.PointerEvent<HTMLElement>) => {
    if (!gesture.current) return
    event.stopPropagation()
    const start = gesture.current
    gesture.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (start.moved) onCommit(start.draft)
    else onCancel()
  }
  const pointerProps = { onPointerMove: move, onPointerUp: up, onPointerCancel: () => { gesture.current = null; onCancel() } }
  const r = selection.rect
  return <>
    <svg className="selection-geometry" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>
        {maskDefinitions(selection.path, id)}
        <filter id={`${id}-feather`} x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation={`${selection.feather / 5} ${selection.feather / 6.25}`} /></filter>
        <filter id={`${id}-outline`} x="-10%" y="-10%" width="120%" height="120%"><feMorphology in="SourceAlpha" operator="dilate" radius=".15 .12" result="outer" /><feMorphology in="SourceAlpha" operator="erode" radius=".15 .12" result="inner" /><feComposite in="outer" in2="inner" operator="out" result="edge" /><feFlood floodColor="#a9dcff" /><feComposite in2="edge" operator="in" /></filter>
      </defs>
      <g filter={selection.feather ? `url(#${id}-feather)` : undefined} opacity=".18"><rect width="100" height="100" fill="#8bceff" mask={`url(#${id})`} /></g>
      <g filter={`url(#${id}-outline)`}><rect width="100" height="100" fill="white" mask={`url(#${id})`} /></g>
    </svg>
    <div className="selection-overlay" aria-label="局部选区" tabIndex={interactive ? 0 : -1} data-selection-kind={selection.kind} style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.width}%`, height: `${r.height}%` }}>
      {interactive && r.width > 0 && r.height > 0 ? <>
        {movable ? <div className="selection-move" role="button" tabIndex={-1} aria-label="移动选区" onPointerDown={down('move')} {...pointerProps} /> : null}
        {['n', 'e', 's', 'w'].map((edge) => <button key={`edge-${edge}`} type="button" className={`selection-edge edge-${edge}`} aria-label={`调整选区边${edge}`} onPointerDown={down(edge)} {...pointerProps} />)}
        {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button key={handle} type="button" className={`selection-handle handle-${handle}`} aria-label={`调整选区${handle}`} onPointerDown={down(handle)} {...pointerProps} />)}
      </> : null}
    </div>
  </>
}
