import { Resvg } from '@resvg/resvg-js'
import { initialEditorState, type EditorState, type Layer } from '../../state/editor'

export const fixtureIds = ['subject', 'title', 'logo', 'decoration', 'caption', 'badge']
const names = ['主体', '标题', '徽标', '装饰', '说明', '角标']
const positions = [5, 20, 40, 60, 75, 90]
/** Original geometric images authored for this test suite, CC0. No third-party photos. */
export function evaluationFixture(): EditorState {
  const layers: Layer[] = fixtureIds.map((id, index) => {
    const image = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="${['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff', '#ff00ff'][index]}"/><rect x="5" y="5" width="30" height="20" fill="white"/></svg>`, { font: { loadSystemFonts: false } }).render().asPng()
    return { id, name: names[index], kind: 'image', className: 'evaluation-layer', source: `data:image/png;base64,${Buffer.from(image).toString('base64')}`, visible: true, opacity: 100, blendMode: '正常', transform: { kind: 'transform', rect: { x: positions[index], y: positions[index], width: 5, height: 5 }, rotation: 0, flipX: false, flipY: false } }
  })
  layers.push({ id: 'protected', name: '保护底图', className: 'evaluation-background', kind: 'image', visible: true, locked: true, opacity: 100, blendMode: '正常' })
  return { ...structuredClone(initialEditorState), documentWidth: 100, documentHeight: 100, documentBackground: '#223344', layers, selectedLayerId: 'subject', selectedLayerIds: fixtureIds, undoStack: [], redoStack: [], brushStrokes: [], canvasShapes: [], canvasTexts: [], layerMasks: {}, selectionVisible: false }
}
