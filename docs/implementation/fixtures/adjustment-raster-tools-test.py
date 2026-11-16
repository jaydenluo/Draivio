#!/usr/bin/env python3
"""Decoder self-check with independently encoded PNG row filters 0…4."""
import binascii,importlib.util,pathlib,struct,tempfile,unittest,zlib
spec=importlib.util.spec_from_file_location('raster',pathlib.Path(__file__).with_name('adjustment-raster-tools.py'));raster=importlib.util.module_from_spec(spec);spec.loader.exec_module(raster)
class DecoderTests(unittest.TestCase):
 def test_all_filters_against_known_rgba(self):
  width,height=3,5;pixels=bytes((i*47+17)%256 for i in range(width*height*4));rows=[];previous=bytes(width*4)
  for y in range(height):
   row=pixels[y*width*4:(y+1)*width*4];encoded=[]
   for i,value in enumerate(row):
    left=row[i-4] if i>=4 else 0;up=previous[i];upperleft=previous[i-4] if i>=4 else 0
    if y==0: predict=0
    elif y==1: predict=left
    elif y==2: predict=up
    elif y==3: predict=(left+up)//2
    else:
     p=left+up-upperleft;distances=[abs(p-left),abs(p-up),abs(p-upperleft)];predict=[left,up,upperleft][distances.index(min(distances))]
    encoded.append((value-predict)%256)
   rows.append(bytes([y])+bytes(encoded));previous=row
  def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',binascii.crc32(kind+data)&0xffffffff)
  png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',width,height,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows)))+chunk(b'IEND',b'')
  with tempfile.TemporaryDirectory() as folder:
   path=pathlib.Path(folder)/'all-filters.png';path.write_bytes(png);w,h,actual=raster.read_png(path);self.assertEqual((w,h),(width,height));self.assertEqual(actual,pixels)
 def test_white_compositing(self):
  self.assertEqual(raster.composite_white(bytes([200,100,50,0,200,100,50,255,200,100,50,128])),bytes([255,255,255,255,200,100,50,255,227,177,152,255]))
 def test_fixture_and_expected_neutral(self):
  root=pathlib.Path(__file__).parent;w,h,actual=raster.read_png(root/'adjustment-colorcard-64.png');self.assertEqual((w,h),(64,64));self.assertEqual(actual,(root/'adjustment-colorcard-64.rgba').read_bytes());self.assertEqual(actual,(root/'adjustment-expected/neutral.rgba').read_bytes())
if __name__=='__main__':unittest.main()
