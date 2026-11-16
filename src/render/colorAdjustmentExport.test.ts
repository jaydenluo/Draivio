import { describe, it, expect } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { materializeColorAdjustments, type DecodedSvg } from './exportImage'
import { neutralAdjustments } from '../state/editor'
import { defaultHsl } from '../adjustments/hsl'

function raster(source: string) { return new Resvg(source).render() }
function dependencies() {
  let pixels = new Uint8ClampedArray(), width = 0, height = 0
  return {
    decodeSvg: async (source: string): Promise<DecodedSvg> => {
      const out = raster(source); pixels = new Uint8ClampedArray(out.pixels); width = out.width; height = out.height
      return { image: {} as CanvasImageSource, width, height }
    },
    createCanvas: () => ({ width, height, getContext: () => ({ drawImage() {}, getImageData: () => ({ data: pixels }), putImageData(image: ImageData) { pixels = new Uint8ClampedArray(image.data) } }), toDataURL: () => {
      let body = ''
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; body += `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${pixels[i]},${pixels[i+1]},${pixels[i+2]})" opacity="${pixels[i+3]/255}"/>` }
      return `data:image/png;base64,${Buffer.from(raster(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`).asPng()).toString('base64')}`
    } }) as unknown as HTMLCanvasElement
  }
}
const hsl = defaultHsl(); hsl.global.hue = 120
const settings = { ...neutralAdjustments, hsl }
const filter = `<defs><filter id="adjust" data-adjustments='${JSON.stringify(settings)}'/><mask id="half"><rect width="4" height="4" fill="white"/><rect width="2" height="4" fill="black"/></mask></defs>`
describe('HSL SVG materialization', () => {
  it('bakes a fixed six color card and gray through real Resvg decoding', async () => {
    const colors = ['red', '#ff8000', 'yellow', 'lime', 'cyan', 'blue', '#808080']
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 7 1">${filter}<g filter="url(#adjust)">${colors.map((c,i)=>`<rect x="${i}" width="1" height="1" fill="${c}"/>`).join('')}</g></svg>`
    const out = raster(await materializeColorAdjustments(source, dependencies()))
    const expected = [[0,255,0],[0,255,128],[0,255,255],[0,0,255],[255,0,255],[255,0,0],[128,128,128]].flatMap(rgb=>[...rgb,255])
    expect([...out.pixels]).toEqual(expected)
  })
  it('preserves nested affine geometry, opacity, mask and sibling blending without double filtering', async () => {
    const body = (color: string, filtered: boolean) => `<rect width="4" height="4" fill="white"/><g transform="translate(1 0)"><g opacity="0.5" style="mix-blend-mode:multiply" ${filtered?'filter="url(#adjust)"':''}><g transform="scale(1 1)" mask="url(#half)"><rect width="4" height="4" fill="${color}"/></g></g></g>`
    const wrap = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4">${filter}${body}</svg>`
    const materialized = await materializeColorAdjustments(wrap(body('red',true)), dependencies())
    expect([...raster(materialized).pixels]).toEqual([...raster(wrap(body('lime',false))).pixels])
    expect(materialized).not.toContain('filter="url(#adjust)"')
  })
  it('bakes ancestor-translated content outside the root local viewport without clipping it away', async () => {
    const wrap = (color: string, filtered: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4">${filter}<g transform="translate(-4 0)"><g ${filtered?'filter="url(#adjust)"':''}><rect x="4" width="4" height="4" fill="${color}"/></g></g></svg>`
    expect([...raster(await materializeColorAdjustments(wrap('red',true),dependencies())).pixels]).toEqual([...raster(wrap('lime',false)).pixels])
  })
  it('retains an adjusted layer own transform and mask once under a scaled ancestor', async () => {
    const wrap = (color: string, filtered: boolean) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4">${filter}<g transform="scale(2)"><g transform="translate(-2 0)" opacity="0.5" mask="url(#half)" ${filtered?'filter="url(#adjust)"':''}><rect x="2" width="2" height="2" fill="${color}"/></g></g></svg>`
    expect([...raster(await materializeColorAdjustments(wrap('red',true),dependencies())).pixels]).toEqual([...raster(wrap('lime',false)).pixels])
  })
})
