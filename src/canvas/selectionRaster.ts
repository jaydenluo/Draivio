import { selectionContains, type Selection, type SelectionPath, type SelectionPoint } from './selectionGeometry'

function validate(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('选区位图尺寸无效')
}

/** Rasterizes any selection expression into an 8-bit alpha mask. */
export function rasterizeSelectionMask(selection: Selection, width: number, height: number): Uint8Array {
  validate(width, height)
  const mask = new Uint8Array(width * height)
  const samples = [.25, .75]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let hits = 0
    for (const sy of samples) for (const sx of samples) hits += selectionAlpha(selection.path, { x: (x + sx) / width * 100, y: (y + sy) / height * 100 })
    mask[y * width + x] = Math.round(hits / 4 * 255)
  }
  const radius = Math.max(0, Math.round(selection.feather))
  if (!radius) return mask
  return blurMask(mask, width, height, radius)
}

export function blurMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  validate(width, height)
  if (mask.length !== width * height) throw new Error('选区位图长度与尺寸不匹配')
  if (!Number.isInteger(radius) || radius < 0) throw new Error('选区羽化半径无效')
  if (!radius) return new Uint8Array(mask)
  const horizontal = new Uint8Array(mask.length)
  const output = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dx = -radius; dx <= radius; dx++) { const px = x + dx; if (px >= 0 && px < width) { sum += mask[y * width + px]; count++ } }
    horizontal[y * width + x] = Math.round(sum / count)
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dy = -radius; dy <= radius; dy++) { const py = y + dy; if (py >= 0 && py < height) { sum += horizontal[py * width + x]; count++ } }
    output[y * width + x] = Math.round(sum / count)
  }
  return output
}

/** Continuous raster alpha survives boolean and affine selection expressions. */
export function selectionAlpha(path:SelectionPath,point:SelectionPoint):number {
 if(point.x<0||point.x>100||point.y<0||point.y>100)return 0
 if(path.type==='raster' && path.alpha){const w=path.alphaWidth??path.rows[0].length,h=path.alphaHeight??path.rows.length;return (path.alpha[Math.min(h-1,Math.floor(point.y/100*h))*w+Math.min(w-1,Math.floor(point.x/100*w))]??0)/255}
 if(path.type==='boolean'){const a=selectionAlpha(path.left,point),b=selectionAlpha(path.right,point);return path.mode==='add'?Math.max(a,b):path.mode==='subtract'?a*(1-b):Math.min(a,b)}
 if(path.type==='inverse')return 1-selectionAlpha(path.source,point)
 if(path.type==='transform')return selectionAlpha(path.source,{x:path.from.x+(point.x-path.to.x)/path.to.width*path.from.width,y:path.from.y+(point.y-path.to.y)/path.to.height*path.from.height})
 if(path.type==='affine'){const [a,b,c,d,e,f]=path.matrix,det=a*d-b*c;if(Math.abs(det)<1e-8)return 0;return selectionAlpha(path.source,{x:(d*(point.x-e)-c*(point.y-f))/det,y:(a*(point.y-f)-b*(point.x-e))/det})}
 return selectionContains(path,point)?1:0
}
