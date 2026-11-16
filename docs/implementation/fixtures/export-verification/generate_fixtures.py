#!/usr/bin/env python3
"""Generate public, mathematical test inputs. Does not call Draivio's exporter."""
import base64
import io
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent

def selection(kind, x, y, width, height):
    rect = dict(x=x, y=y, width=width, height=height)
    return dict(kind=kind, mode='new', rect=rect, path=dict(type='shape', kind=kind, rect=rect), feather=0, fixedRatio=None)

def layer(id, **kwargs):
    return dict(id=id, name=id, className='layer-art', visible=True, opacity=100, blendMode='正常', **kwargs)

def project(name, layers, assets=None):
    sel = selection('ellipse', 12.5, 12.5, 75, 75)
    return dict(format='draivio', schemaVersion=2, metadata=dict(id=name, name=name), assets=assets or {}, document=dict(documentWidth=128, documentHeight=128, documentBackground='transparent', layers=layers, selectedLayerId=layers[-1]['id'], selectedLayerIds=[layers[-1]['id']], canvasTexts=[], canvasShapes=[], brushStrokes=[], layerMasks={}, aiResults=[], selection=sel, selectionRect=sel['rect'], selectionVisible=True, cropRect=None, sceneOrder=[], prompt='', composerMode='edit', composerSourceId='draivio-cloud', composerParameters=dict(model='fixture', size='128 × 128', ratio='1:1', count='1 张', strength='48%'), history=[]))

def write(name, value):
    (ROOT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n')

image = Image.new('RGBA', (128,128))
draw = ImageDraw.Draw(image)
for rect, color in [((16,16,47,47),(255,0,0,255)), ((80,16,111,47),(0,255,0,255)), ((16,80,47,111),(0,0,255,255)), ((80,80,111,111),(255,255,0,128))]:
    draw.rectangle(rect, fill=color)
image.save(ROOT / 'color-blocks-input.png')
data = io.BytesIO(); image.save(data, format='PNG')
base = project('F03 independent color blocks', [layer('blocks', source='asset:image-1', thumbnail='asset:image-1')], {'image-1':'data:image/png;base64,'+base64.b64encode(data.getvalue()).decode()})
write('color-blocks.draivio', base)

complex_project = project('F03 independent effects', [layer('text'), dict(id='half-opacity-group', name='half-opacity-group', className='layer-group', visible=True, opacity=50, blendMode='正常', children=['effect']), dict(id='effect', name='effect', className='layer-art', visible=True, opacity=50, blendMode='正常', groupId='half-opacity-group', transform=dict(kind='transform', rect=dict(x=0,y=0,width=100,height=100), rotation=90, flipX=True, flipY=False), adjustments=dict(brightness=100, contrast=0, saturation=0, temperature=0, sharpness=0, blur=0, shadows=0, highlights=0))])
doc = complex_project['document']
doc['canvasShapes']=[dict(id='effect-square', layerId='effect', kind='rectangle', rect=dict(x=12.5,y=12.5,width=25,height=25), color='#204060', strokeWidth=0)]
doc['canvasTexts']=[dict(id='label', layerId='text', x=5,y=5,text='F03',fontFamily='sans-serif',fontSize=16,fontWeight='400',align='left',color='#ff00ff')]
doc['sceneOrder']=['effect-square','label']
doc['layerMasks']={'effect':dict(selection=selection('rectangle',25,0,75,100),strokes=[],inverted=False,applied=True)}
write('effects.draivio',complex_project)

write('manifest.json', dict(schemaVersion=1, provenance='Analytic coordinates and colors; no product-export output used as an oracle.', scenarios={
 'blocks-canvas':dict(project='color-blocks.draivio', size=[128,128], probes=[dict(x=x,y=y,rgba=list(c),label=label) for x,y,c,label in [(4,4,(0,0,0,0),'transparent corner'),(32,32,(255,0,0,255),'red'),(96,32,(0,255,0,255),'green'),(32,96,(0,0,255,255),'blue'),(96,96,(255,255,0,128),'half alpha yellow'),(64,64,(0,0,0,0),'transparent center')]]),
 'blocks-selection':dict(project='color-blocks.draivio', size=[96,96], cropOrigin=[16,16], probes=[dict(x=x,y=y,rgba=list(c),label=label) for x,y,c,label in [(4,4,(0,0,0,0),'red exists here before elliptical clip; must become transparent'),(16,16,(255,0,0,255),'red inside ellipse'),(79,16,(0,255,0,255),'green inside ellipse'),(16,79,(0,0,255,255),'blue inside ellipse'),(79,79,(255,255,0,128),'yellow inside ellipse'),(48,48,(0,0,0,0),'transparent center'),(91,91,(0,0,0,0),'transparent elliptical corner')]]),
 'effects-canvas':dict(project='effects.draivio', size=[128,128], probes=[dict(x=x,y=y,rgba=list(c),label=label) for x,y,c,label in [(90,88,(64,128,192,64),'brightness doubled; child .5 × parent .5 alpha'),(90,104,(0,0,0,0),'masked half after flip and rotation'),(32,32,(0,0,0,0),'original square position cleared by transform'),(120,120,(0,0,0,0),'transparent background')]], inkRegions=[dict(rect=[4,4,48,28],minAlphaPixels=30,label='font-independent nonempty magenta F03 text')]),
 'effects-layer':dict(project='effects.draivio', size=[128,128], probes=[dict(x=x,y=y,rgba=list(c),label=label) for x,y,c,label in [(90,88,(64,128,192,64),'selected effect with parent group opacity included'),(90,104,(0,0,0,0),'selected layer retains applied mask'),(12,12,(0,0,0,0),'text sibling excluded')]])
}))
print('Generated 2 projects, 1 public PNG input and analytic manifest.')
