import json,pathlib,unittest,urllib.request
import cv2,numpy as np
from gateway import Restorer,ROOT
class RealInferenceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.backend=Restorer(ROOT)
 def fixture(self):
  image=np.zeros((48,64,4),np.uint8);image[:,:,:3]=230;image[:,:,3]=255
  cv2.putText(image,'AI 24',(2,15),cv2.FONT_HERSHEY_SIMPLEX,.35,(20,40,60,255),1)
  for x in range(0,64,4):image[18:30,x:x+2,:3]=[20,120,210]
  cv2.circle(image,(32,39),8,(230,170,130,255),-1);cv2.circle(image,(29,37),1,(10,10,10,255),-1);cv2.circle(image,(35,37),1,(10,10,10,255),-1)
  image[0:4,0:4]=0;image[4:8,0:4,3]=128
  return image
 def request(self,image,scale):return {'protocol':'draivio-restoration-v1','model':'espcn','mode':'size','scale':scale,'image':{'width':image.shape[1],'height':image.shape[0],'data':image.flatten().tolist()}}
 def test_actual_models_2x_4x_pixels_alpha_and_artifacts(self):
  image=self.fixture();root=pathlib.Path('docs/implementation/fixtures/restoration');root.mkdir(parents=True,exist_ok=True);cv2.imwrite(str(root/'synthetic-input.png'),cv2.cvtColor(image,cv2.COLOR_RGBA2BGRA));records=[]
  for scale in (2,4):
   request=self.request(image,scale)
   # Exercise the running real HTTP backend, not a substitute inference function.
   raw=urllib.request.urlopen(urllib.request.Request('http://127.0.0.1:8767/restore',data=json.dumps(request).encode(),headers={'Content-Type':'application/json'}),timeout=30)
   result=json.load(raw);out=np.array(result['data'],np.uint8).reshape((48*scale,64*scale,4));self.assertEqual(result['width'],64*scale);self.assertEqual(result['height'],48*scale)
   self.assertTrue(np.array_equal(out[:,:,3],cv2.resize(image[:,:,3],None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST)))
   nearest=cv2.resize(image,None,fx=scale,fy=scale,interpolation=cv2.INTER_NEAREST);difference=float(np.abs(out[:,:,:3].astype(float)-nearest[:,:,:3]).mean());self.assertGreater(difference,.1)
   cv2.imwrite(str(root/f'espcn-{scale}x.png'),cv2.cvtColor(out,cv2.COLOR_RGBA2BGRA));records.append({'scale':scale,'width':result['width'],'height':result['height'],'meanDifferenceFromNearest':difference,'model':'ESPCN','cost':0,'runtime':'OpenCV CPU','fixture':'self-authored synthetic text, repeated texture, stylized face, transparency; not real face quality evidence'})
  (root/'real-inference.json').write_text(json.dumps(records,indent=2))
 def test_no_deblur_or_hallucination_fallback(self):
  request=self.request(self.fixture(),2);request['mode']='deblur'
  with self.assertRaisesRegex(ValueError,'仅支持'):self.backend.run(request)
 def test_rejects_bad_pixels(self):
  request=self.request(self.fixture(),2);request['image']['data']=[-1]
  with self.assertRaisesRegex(ValueError,'像素'):self.backend.run(request)
if __name__=='__main__':unittest.main()
