import importlib.util,pathlib,unittest,io,base64,json,threading,urllib.request,urllib.error
from PIL import Image
spec=importlib.util.spec_from_file_location('gateway',pathlib.Path(__file__).with_name('gateway.py'));gateway=importlib.util.module_from_spec(spec);spec.loader.exec_module(gateway)
class GatewayTests(unittest.TestCase):
 def test_missing_model_is_error(self):
  with self.assertRaisesRegex(ValueError,'未安装'):gateway.Segmenter(pathlib.Path('/tmp/draivio-no-such-model.onnx'))
 def test_pytorch_or_corrupt_model_is_rejected(self):
  import tempfile
  with tempfile.TemporaryDirectory() as folder:
   path=pathlib.Path(folder)/'model.bin';path.write_bytes(b'not onnx')
   with self.assertRaisesRegex(ValueError,'校验失败'):gateway.Segmenter(path)
 def test_object_mode_is_explicitly_unsupported(self):
  model=gateway.Segmenter(gateway.model_path())
  with self.assertRaisesRegex(ValueError,'不支持指定物体'):model.run(b'',target='object')
 def test_live_http_real_u2netp_inference(self):
  import os
  path=pathlib.Path(os.environ['SEMANTIC_TEST_IMAGE'])
  model=gateway.Segmenter(gateway.model_path());server=gateway.ThreadingHTTPServer(('127.0.0.1',0),gateway.handler(model));thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
  try:
   source=path.read_bytes();image='data:image/png;base64,'+base64.b64encode(source).decode();body=json.dumps({'image':image,'target':'subject','output':'alpha-candidates-v1'}).encode();request=urllib.request.Request(f'http://127.0.0.1:{server.server_port}/segment',data=body,headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(request,timeout=30) as response:result=json.load(response)
   self.assertEqual(result['model'],'u2netp-onnx');self.assertEqual((result['width'],result['height']),Image.open(io.BytesIO(source)).size)
   alpha=result['candidates'][0]['alpha'];self.assertEqual(len(alpha),result['width']*result['height']);self.assertEqual(min(alpha),0);self.assertEqual(max(alpha),255);self.assertTrue(any(0<v<255 for v in alpha));self.assertEqual(result['candidates'][0]['confidence'],.5)
  finally:server.shutdown();server.server_close()
if __name__=='__main__':unittest.main()
