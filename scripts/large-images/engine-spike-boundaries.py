"""Additional LI02 precision fixtures, kept outside the LI01 frozen corpus."""
import hashlib,json,os,subprocess
from PIL import Image
root='/tmp/draivio-engine-boundaries';os.makedirs(root,exist_ok=True)
p=os.path.join(root,'float32.tiff')
image=Image.new('F',(37,19));image.putdata([(x-300)/77 for x in range(37*19)]);image.save(p)
binary=os.environ.get('LI_ENGINE','/tmp/draivio-engine-spike')
results=[]
for op,args in [('metadata',[]),('cache',[os.path.join(root,'float-cache.tiff'),'512']),('export',[os.path.join(root,'float-export.png')]),('region',[os.path.join(root,'float-region.png'),'0','0','10','10'])]:
    r=subprocess.run([binary,op,p,*args],capture_output=True,text=True)
    results.append(dict(op=op,exitCode=r.returncode,stdout=r.stdout,stderr=r.stderr))
    assert r.returncode==(1 if op in ('export','region') else 0)
assert Image.open(os.path.join(root,'float-cache.tiff')).tobytes()==image.tobytes()
result=dict(source=p,sourceSha256=hashlib.sha256(open(p,'rb').read()).hexdigest(),precision='float32 lossless TIFF cache exact pixel bytes; implicit PNG downgrade rejected',results=results)
json.dump(result,open('docs/verification/large-images/engine-spike-boundaries.json','w'),indent=2)
print('PASS float32 cache exact; implicit PNG precision loss rejected')
