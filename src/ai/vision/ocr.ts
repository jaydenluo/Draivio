export type OcrPoint = { x: number; y: number }
export type OcrCandidate = {
  id: string
  text: string
  quad: [OcrPoint, OcrPoint, OcrPoint, OcrPoint]
  confidence: number
  fontFamily?: string
  fontAvailable?: boolean
  sourceLayerId?: string
}

export function validateOcrCandidate(candidate: OcrCandidate): void {
  if (!candidate.id || !candidate.text.trim() || !Array.isArray(candidate.quad) || candidate.quad.length !== 4) throw new Error('OCR 候选缺少文字或四边形')
  if (!Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) throw new Error('OCR 置信度无效')
  if (candidate.fontAvailable === false) throw new Error(`字体不可用：${candidate.fontFamily ?? '未知字体'}`)
  for (const point of candidate.quad) if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error('OCR 四边形坐标无效')
}

export function chooseOcrCandidate(candidates: readonly OcrCandidate[], query: string, id?: string, minimumConfidence = 0.8): OcrCandidate {
  const matches = candidates.filter(candidate => candidate.text === query)
  if (id) {
    const selected = matches.find(candidate => candidate.id === id)
    if (!selected) throw new Error('找不到指定 OCR 候选')
    validateOcrCandidate(selected)
    if (selected.confidence < minimumConfidence) throw new Error('OCR 置信度不足，需要用户确认')
    return selected
  }
  if (matches.length !== 1) throw new Error(matches.length > 1 ? '发现多个相同文字，请明确选择位置' : '找不到 OCR 文字')
  validateOcrCandidate(matches[0])
  if (matches[0].confidence < minimumConfidence) throw new Error('OCR 置信度不足，需要用户确认')
  return matches[0]
}

export function quadBounds(quad: readonly OcrPoint[]) {
  if (quad.length !== 4) throw new Error('OCR 四边形无效')
  const xs = quad.map(point => point.x), ys = quad.map(point => point.y)
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
}
