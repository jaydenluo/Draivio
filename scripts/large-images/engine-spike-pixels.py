"""Independent Pillow pixel oracle for native lossless region/cache/export outputs."""
import json, os, hashlib, subprocess, tempfile
from PIL import Image, ImageChops
Image.MAX_IMAGE_PIXELS=None
root=os.environ.get('LI_FIXTURES','/tmp/draivio-large-images')
report=json.load(open('docs/verification/large-images/engine-spike-results.json'))
assert report['completed'], 'benchmark incomplete'
manifest=json.load(open(os.path.join(root,'manifest.json')))
files={f['id']:os.path.join(root,f['path']) for f in manifest['fixtures']}
native_references={}
native_directory=tempfile.TemporaryDirectory(prefix='li02-native-reference-')
checks=[]
for result in report['results']:
    if 'status' in result:
        assert result['status'] in result['expectedStatuses'],result
        if result['status']=='failed': assert result.get('code') in (1,65),result
assert all(result['status']=='ready' for result in report['results'] if result['op'] in ('region','cache','export'))
for r in report['results']:
    if r['op']=='cache' and r['status']=='ready': files[r['assetId']+'-'+str(r['tileSize'])]=r['path']
for r in report['results']:
    if r.get('status')!='ready' or r['op'] not in ('region','export','thumbnail'): continue
    source_id=r['assetId']; base=source_id
    for suffix in ('-256','-512','-1024'):
        if base.endswith(suffix): base=base[:-len(suffix)]
    original=Image.open(files[base]); out=Image.open(r['path'])
    if r['op']=='thumbnail':
        orientation=original.getexif().get(274,1)
        assert out.info.get('icc_profile')==original.info.get('icc_profile'),(r['id'],'ICC bytes differ')
        assert max(out.size)<=r['edge']
        if orientation==6: assert out.height>out.width
        checks.append({'id':r['id'],'check':'thumbnail dimensions/orientation','size':out.size,'iccExactBytes':True});continue
    if r['op']=='region':
        q=r['region']
        if base not in ('baseline-icc-exif','progressive','gray16'):
            channels=len(original.getbands())
            expected=Image.frombytes(original.mode,(q['width'],q['height']),bytes(v for y in range(q['y'],q['y']+q['height']) for x in range(q['x'],q['x']+q['width']) for v in (x%256,y%256,(x+y)%256,(x+y)%256)[:channels]))
        else: expected=original.crop((q['x'],q['y'],q['x']+q['width'],q['y']+q['height']))
    else: expected=original
    assert out.size==expected.size,(r['id'],out.size,expected.size)
    # Pillow/libjpeg can differ slightly from libvips/libjpeg-turbo, even though caches are lossless.
    if base in ('baseline-icc-exif','progressive'):
        max_error=max(high for low,high in ImageChops.difference(out.convert('RGB'),expected.convert('RGB')).getextrema());assert max_error<=4,(r['id'],max_error)
        check={'maxChannelError':max_error,'tolerance':4}
        if source_id!=base and r['op']=='region':
            key=(base,tuple(r['region'].values()))
            if key not in native_references:
                reference=os.path.join(native_directory.name,str(len(native_references))+'.png')
                q=r['region']
                result=subprocess.run([os.environ.get('LI_ENGINE','/tmp/draivio-engine-spike'),'region',files[base],reference,*[str(q[k]) for k in ('x','y','width','height')]],capture_output=True)
                assert result.returncode==0,result.stderr
                native_references[key]=Image.open(reference).tobytes()
            assert out.tobytes()==native_references[key],(r['id'],'cache differs from native original pixels')
            check['cacheExactNativeDecodedPixels']=True
    else:
        assert out.tobytes()==expected.tobytes(),r['id'];check={'exactPixelBytes':True,'sha256':hashlib.sha256(out.tobytes()).hexdigest()}
    checks.append({'id':r['id'],'assetId':source_id,'op':r['op'],**check})
for f in manifest['fixtures']:
    digest=hashlib.sha256()
    with open(files[f['id']],'rb') as source:
        for chunk in iter(lambda:source.read(1024*1024),b''): digest.update(chunk)
    assert digest.hexdigest()==f['sha256'],f['id']
output={'oracle':'Pillow '+Image.__version__,'checks':checks,'sourceHashesUnchanged':True}
json.dump(output,open('docs/verification/large-images/engine-spike-pixels.json','w'),indent=2)
print('PASS',len(checks),'pixel/dimension checks; all source hashes unchanged')
