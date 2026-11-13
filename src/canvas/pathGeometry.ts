export type PathPoint = { x: number; y: number }
export type PathAnchor = PathPoint & { in?: PathPoint; out?: PathPoint }
export type EditorPath = { kind: 'freehand' | 'polygon' | 'bezier'; anchors: PathAnchor[]; closed: boolean }

export function addAnchor(path: EditorPath, point: PathPoint, handle?: PathPoint): EditorPath {
  if (path.closed) return path
  const anchor: PathAnchor = { ...point }
  if (handle && path.kind === 'bezier') {
    anchor.out = { ...handle }
    anchor.in = { x: 2 * point.x - handle.x, y: 2 * point.y - handle.y }
  }
  return { ...path, anchors: [...path.anchors, anchor] }
}

export function closePath(path: EditorPath): EditorPath {
  return path.anchors.length >= 3 ? { ...path, closed: true } : path
}

export function moveAnchor(path: EditorPath, index: number, point: PathPoint): EditorPath {
  const anchor = path.anchors[index]
  if (!anchor) return path
  const dx = point.x - anchor.x, dy = point.y - anchor.y
  const translate = (value?: PathPoint) => value ? { x: value.x + dx, y: value.y + dy } : undefined
  return { ...path, anchors: path.anchors.map((value, i) => i === index ? { ...point, in: translate(anchor.in), out: translate(anchor.out) } : value) }
}

export function moveControl(path: EditorPath, index: number, side: 'in' | 'out', point: PathPoint): EditorPath {
  if (!path.anchors[index]) return path
  return { ...path, anchors: path.anchors.map((value, i) => i === index ? { ...value, [side]: point } : value) }
}

export function pathToSvg(path: EditorPath): string {
  if (!path.anchors.length) return ''
  const format = (value: number) => Number(value.toFixed(3))
  const pair = (point: PathPoint) => `${format(point.x)} ${format(point.y)}`
  const first = path.anchors[0]
  let result = `M ${pair(first)}`
  const segment = (previous: PathAnchor, current: PathAnchor) => path.kind === 'bezier'
    ? ` C ${pair(previous.out ?? previous)} ${pair(current.in ?? current)} ${pair(current)}`
    : ` L ${pair(current)}`
  for (let index = 1; index < path.anchors.length; index++) result += segment(path.anchors[index - 1], path.anchors[index])
  if (path.closed) {
    if (path.kind === 'bezier') result += segment(path.anchors.at(-1)!, first)
    result += ' Z'
  }
  return result
}

export function pathBounds(path: EditorPath) {
  if (!path.anchors.length) return null
  // Include control handles so the interaction frame never clips a curve.
  const points = path.anchors.flatMap((point) => [point, ...(point.in ? [point.in] : []), ...(point.out ? [point.out] : [])])
  const x = Math.min(...points.map((p) => p.x)), y = Math.min(...points.map((p) => p.y))
  return { x, y, width: Math.max(...points.map((p) => p.x)) - x, height: Math.max(...points.map((p) => p.y)) - y }
}
