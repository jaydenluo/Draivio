#!/usr/bin/env python3
"""Offline PNG RGBA fixture/decoder/comparison; Python standard library only."""
import argparse,base64,binascii,json,math,pathlib,struct,zlib
ROOT=pathlib.Path(__file__).resolve().parent

def write_png(path,width,height,rgba):
 def chunk(kind,data): return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
 rows=b''.join(b'\0'+bytes(rgba[y*width*4:(y+1)*width*4]) for y in range(height))
 pathlib.Path(path).write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(rows))+chunk(b'IEND',b''))

def read_png(path):
 data=pathlib.Path(path).read_bytes()
 if data[:8]!=b'\x89PNG\r\n\x1a\n': raise ValueError('Not a PNG')
 offset=8; compressed=b''; palette=b''; transparency=b''
 while offset<len(data):
  length=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];body=data[offset+8:offset+8+length]
  if binascii.crc32(kind+body)&0xffffffff != struct.unpack('>I',data[offset+8+length:offset+12+length])[0]: raise ValueError('PNG CRC mismatch')
  if kind==b'IHDR': width,height,depth,color,comp,filt,interlace=struct.unpack('>IIBBBBB',body)
  elif kind==b'IDAT': compressed+=body
  elif kind==b'PLTE': palette=body
  elif kind==b'tRNS': transparency=body
  offset+=length+12
 if depth!=8 or interlace!=0 or color not in (0,2,3,4,6): raise ValueError('Supports non-interlaced 8-bit PNG only')
 bpp={0:1,2:3,3:1,4:2,6:4}[color];stride=width*bpp;raw=zlib.decompress(compressed);previous=bytearray(stride);rgba=bytearray()
 if len(raw)!=(stride+1)*height: raise ValueError('Unexpected decompressed size')
 for y in range(height):
  start=y*(stride+1);mode=raw[start];row=bytearray(raw[start+1:start+1+stride])
  for i in range(stride):
   a=row[i-bpp] if i>=bpp else 0;b=previous[i];c=previous[i-bpp] if i>=bpp else 0
   if mode==0: predictor=0
   elif mode==1: predictor=a
   elif mode==2: predictor=b
   elif mode==3: predictor=(a+b)//2
   elif mode==4:
    p=a+b-c;pa,pb,pc=abs(p-a),abs(p-b),abs(p-c);predictor=a if pa<=pb and pa<=pc else b if pb<=pc else c
   else: raise ValueError('Unknown PNG filter')
   row[i]=(row[i]+predictor)&255
  for i in range(0,stride,bpp):
   v=row[i:i+bpp]
   if color==6: rgba.extend(v)
   elif color==2: rgba.extend((*v,0 if transparency==bytes((0,v[0],0,v[1],0,v[2])) else 255))
   elif color==0: rgba.extend((v[0],v[0],v[0],0 if transparency==bytes((0,v[0])) else 255))
   elif color==4: rgba.extend((v[0],v[0],v[0],v[1]))
   else:
    rgb=palette[v[0]*3:v[0]*3+3]
    if len(rgb)!=3: raise ValueError('Invalid palette index')
    rgba.extend((*rgb,transparency[v[0]] if v[0]<len(transparency) else 255))
  previous=row
 return width,height,rgba

def generate():
 rgba=bytearray()
 colors=[(200,60,40),(40,170,70),(40,80,210),(200,170,30),(170,50,180),(30,180,180),(120,80,40),(210,140,100)]
 for y in range(64):
  for x in range(64):
   if y<16: value=round(x*255/63);pixel=(value,value,value,255)
   elif y<32: pixel=(*colors[x//8],255)
   elif y<48:
    # Alpha ramp includes fully transparent boundary plus partially covered saturated colors.
    alpha=0 if x<4 or x>=60 else round((x-4)*255/55);pixel=(200,100,50,alpha)
   else:
    # Broad plateau + narrow texture distinguish local clarity from edge sharpening.
    value=(160 if 22<=x<=42 else 100) if y<56 else (70 if (x//2+y//2)%2 else 180);pixel=(value,value,value,255)
   rgba.extend(pixel)
 write_png(ROOT/'adjustment-colorcard-64.png',64,64,rgba);(ROOT/'adjustment-colorcard-64.rgba').write_bytes(rgba)
 template=json.loads((ROOT/'editable-project-v2.draivio').read_text());doc=template['document']
 doc.update(documentWidth=64,documentHeight=64,documentBackground='transparent',layers=[dict(id='card',name='64px 调整像素验收色卡',className='layer-art',visible=True,opacity=100,blendMode='正常',source='asset:image-1',contentWidth=64,contentHeight=64,adjustmentsEnabled=True,adjustments=dict.fromkeys(['brightness','contrast','saturation','temperature','sharpness','blur','shadows','highlights'],0))],selectedLayerId='card',selectedLayerIds=['card'],canvasTexts=[],canvasShapes=[],brushStrokes=[],layerMasks={},aiResults=[],sceneOrder=[],selectionVisible=False,cropRect=None,history=[])
 template.update(metadata=dict(id='adjustment-colorcard-64',name='64px 调整像素验收色卡'),assets={'image-1':'data:image/png;base64,'+base64.b64encode((ROOT/'adjustment-colorcard-64.png').read_bytes()).decode()})
 (ROOT/'adjustment-colorcard-64.draivio').write_text(json.dumps(template,ensure_ascii=False,indent=2)+'\n')
 print('Generated',ROOT/'adjustment-colorcard-64.draivio')

def stats(values): return dict(max=max(values,default=0),mean=sum(values)/len(values) if values else 0,count=len(values),nonzero=sum(v!=0 for v in values))
def composite_white(rgba):
 output=bytearray(rgba)
 for i in range(0,len(output),4):
  alpha=rgba[i+3]/255
  for c in range(3): output[i+c]=round(rgba[i+c]*alpha+255*(1-alpha))
  output[i+3]=255
 return output

def compare(actual,case,white=False):
 manifest=json.loads((ROOT/'adjustment-expected/manifest.json').read_text());entry=manifest['cases'][case];width,height,rgba=read_png(actual)
 if (width,height)!=(64,64): raise ValueError(f'Expected 64×64, got {width}×{height}')
 expected=(ROOT/'adjustment-expected'/entry['rgba']).read_bytes()
 if white: expected=composite_white(expected)
 diff=[abs(a-b) for a,b in zip(rgba,expected)];visible=[diff[i+c] for i in range(0,len(diff),4) if rgba[i+3]>0 and expected[i+3]>0 for c in range(3)];opaque=[diff[i+c] for i in range(0,len(diff),4) if rgba[i+3]==255 and expected[i+3]==255 for c in range(3)]
 result=dict(actual=str(pathlib.Path(actual).resolve()),case=case,parameters=entry['parameters'],expectedBackground='white' if white else 'transparent',dimensions=[width,height],all_rgba=stats(diff),visible_rgb=stats(visible),opaque_rgb=stats(opaque),alpha=stats(diff[3::4]),note='Measured deltas only; no automatic acceptance tolerance. Fully transparent RGB excluded from visible_rgb.')
 print(json.dumps(result,indent=2));return result
if __name__=='__main__':
 p=argparse.ArgumentParser();sub=p.add_subparsers(dest='command',required=True);sub.add_parser('generate');sub.add_parser('previews');d=sub.add_parser('decode');d.add_argument('png');d.add_argument('raw');c=sub.add_parser('compare');c.add_argument('png');c.add_argument('case');c.add_argument('--white-background',action='store_true');args=p.parse_args()
 if args.command=='generate': generate()
 elif args.command=='previews':
  for path in (ROOT/'adjustment-expected').glob('*.rgba'): write_png(path.with_suffix('.png'),64,64,path.read_bytes())
 elif args.command=='decode':
  w,h,rgba=read_png(args.png);pathlib.Path(args.raw).write_bytes(rgba);print(json.dumps(dict(width=w,height=h,bytes=len(rgba))))
 else: compare(args.png,args.case,args.white_background)
