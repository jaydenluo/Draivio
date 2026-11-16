"""Real-codec evidence; licensed originals stay external. Orientation mutation is an explicit contract fixture."""
import base64,hashlib,json,subprocess,sys,pathlib,os,struct
import numpy as np
manifest=json.load(open('docs/raw/samples.json')); evidence=[]
def decode(data,ev=0,wb=(1,1,1),hl=0):
 request={'data':base64.b64encode(data).decode(),'settings':{'exposureEV':ev,'whiteBalance':dict(zip('rgb',wb)),'highlightRecovery':hl}}
 p=subprocess.run([sys.executable,'scripts/raw/decode.py'],input=json.dumps(request),capture_output=True,text=True,env={**os.environ,'OMP_NUM_THREADS':'1'},timeout=90)
 result=json.loads(p.stdout);assert p.returncode==0,result
 a=np.frombuffer(base64.b64decode(result['asset']['data']),dtype='<u2').reshape(result['asset']['height'],result['asset']['width'],4)
 return result,a
for sample in manifest:
 data=pathlib.Path(sample['path']).read_bytes();assert hashlib.sha256(data).hexdigest()==sample['sha256']
 r,baseline=decode(data);_,ev=decode(data,ev=1);_,wb=decode(data,wb=(1.2,1,.8));_,bright=decode(data,ev=4);rh,highlights=decode(data,ev=4,hl=1)
 assert r['checksum']==sample['sha256'];assert np.all(baseline[:,:,3]==65535)
 changes={'exposure':int(np.count_nonzero(baseline!=ev)),'whiteBalance':int(np.count_nonzero(baseline!=wb)),'highlightRecoveryAt4EV':int(np.count_nonzero(bright!=highlights))}
 assert all(changes.values()),changes
 evidence.append({'sample':sample,'backend':r['backend'],'width':r['asset']['width'],'height':r['asset']['height'],'orientation':r['orientation'],'cameraWhiteBalance':r['cameraWhiteBalance'],'changedSamplesPerParameter':changes,'pixelSha256':{k:hashlib.sha256(a.tobytes()).hexdigest() for k,a in [('baseline',baseline),('exposure',ev),('whiteBalance',wb),('brightClip',bright),('highlightReconstruct',highlights)]},'peakRssBytes':max(r['peakRss'],rh['peakRss']),'originalHashUnchanged':hashlib.sha256(data).hexdigest()==sample['sha256']})
 # Keep the exact decoded samples consumed by the RAW/ICC export regression.
 evidence[-1]['iccExportFixture']={'description':'two exact pixels extracted at center and quarter from real decoded original','rgba16':np.concatenate([baseline[baseline.shape[0]//2,baseline.shape[1]//2],baseline[baseline.shape[0]//4,baseline.shape[1]//4]]).tolist()}
 if sample['id']==5227:
  # Nikon TIFF orientation SHORT inline, tagged variant is not claimed to be an original camera sample.
  tagged=bytearray(data);order='<' if data[:2]==b'II' else '>';offset=struct.unpack_from(order+'I',data,4)[0];n=struct.unpack_from(order+'H',data,offset)[0]
  for i in range(n):
   entry=offset+2+i*12;tag,typ,count=struct.unpack_from(order+'HHI',data,entry)
   if tag==274:
    assert typ==3 and count==1;struct.pack_into(order+'H',tagged,entry+8,6);break
  else:raise AssertionError('orientation tag missing')
  rotated,actual=decode(bytes(tagged));assert rotated['orientation']==6
  assert actual.shape[:2]==baseline.shape[:2][::-1]
  expected=np.rot90(baseline,k=3);assert np.array_equal(expected,actual)
  evidence[-1]['orientationTag6Contract']={'fixture':'explicit modified TIFF orientation tag; not original camera evidence','pixelMatch':'exact 90-degree clockwise rotation','mutatedSha256':hashlib.sha256(tagged).hexdigest()}
 print(sample['id'],'passed',changes,flush=True)
json.dump(evidence,open('docs/raw/real-sample-evidence.json','w'),indent=2)
