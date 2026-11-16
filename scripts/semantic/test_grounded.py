"""Real model tests opt in to explicit local artifacts; never fabricate inference."""
import io,json,os,pathlib,unittest
from PIL import Image
from grounded import GroundedSegmenter,artifact_hash,normalize_query

class ContractTests(unittest.TestCase):
 def test_text_query_is_bounded_and_does_not_invent_missing_targets(self):
  self.assertEqual(normalize_query(' 衣服 '),'clothing .')
  self.assertEqual(normalize_query('red shirt'),'red shirt .')
  for query in ('',' '*3,'a'*129):
   with self.assertRaises(ValueError):normalize_query(query)
 def test_missing_or_bad_artifacts_fail_closed(self):
  with self.assertRaisesRegex(ValueError,'模型|artifact'):artifact_hash(pathlib.Path('/tmp/no-semantic-model'), 'a'*64)

class HttpContractTests(unittest.TestCase):
 def test_server_passes_object_query_and_reports_backend_capabilities(self):
  import base64,threading,urllib.request
  from gateway import handler,ThreadingHTTPServer
  class Backend:
   model_name='grounded-test-contract';targets=['subject','background','object'];calls=[]
   def run(self,image,target,query=None):
    self.calls.append((image,target,query));raise ValueError('模型未发现指定物体')
  backend=Backend();server=ThreadingHTTPServer(('127.0.0.1',0),handler(backend));threading.Thread(target=server.serve_forever,daemon=True).start()
  try:
   root=f'http://127.0.0.1:{server.server_port}'
   with urllib.request.urlopen(root) as response:status=json.load(response)
   self.assertTrue(status['objectSupported']);self.assertEqual(status['model'],backend.model_name)
   request=urllib.request.Request(root+'/segment',data=json.dumps({'image':'data:image/png;base64,'+base64.b64encode(b'actual-upload').decode(),'target':'object','query':'shirt'}).encode(),headers={'Content-Type':'application/json'})
   with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(request)
   self.assertEqual(caught.exception.code,422);self.assertEqual(backend.calls,[(b'actual-upload','object','shirt')])
  finally:server.shutdown();server.server_close()

@unittest.skipUnless(os.environ.get('SEMANTIC_GROUNDED_CONFIG'),'explicit actual model configuration required')
class RealInferenceTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.engine=GroundedSegmenter.from_config(pathlib.Path(os.environ['SEMANTIC_GROUNDED_CONFIG']))
  cls.raw=pathlib.Path(os.environ['SEMANTIC_CLOTHING_IMAGE']).read_bytes()
 def test_two_real_clothing_instances_and_empty_unrelated_target(self):
  result=self.engine.run(self.raw,'object','衣服')
  self.assertGreaterEqual(len(result['candidates']),2)
  self.assertEqual((result['width'],result['height']),Image.open(io.BytesIO(self.raw)).size)
  for candidate in result['candidates']:
   self.assertEqual(len(candidate['alpha']),result['width']*result['height'])
   self.assertGreater(sum(candidate['alpha']),0)
   self.assertLess(sum(candidate['alpha']),255*result['width']*result['height'])
  with self.assertRaisesRegex(ValueError,'未发现'):self.engine.run(self.raw,'object','elephant')
if __name__=='__main__':unittest.main()
