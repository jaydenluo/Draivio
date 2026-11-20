import tempfile, unittest, sys
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).parent))
class FixturesTest(unittest.TestCase):
    def test_streamed_formats_have_real_pixels_and_odd_edges(self):
        import fixtures
        with tempfile.TemporaryDirectory() as d:
            for fmt in ['png','tiff']:
                p=Path(d)/('pixels.'+fmt)
                getattr(fixtures,'write_'+fmt)(p,257,129,4 if fmt=='png' else 3)
                with Image.open(p) as im:
                    im.load()
                    self.assertEqual(im.size,(257,129))
                    self.assertEqual(im.getpixel((256,128))[:3],fixtures.pixel(256,128)[:3])
                    if fmt=='png':self.assertEqual(im.getpixel((0,0))[3],0)

class ProbeTest(unittest.TestCase):
    def probe(self,path):
        import subprocess,json
        r=subprocess.run([sys.executable,str(Path(__file__).with_name('probe.py')),'decode',str(path)],capture_output=True,text=True)
        return r.returncode,json.loads(r.stdout)
    def test_missing_file_is_io_failure_not_decode_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            code,result=self.probe(Path(d)/'missing.png')
            self.assertNotEqual(code,0)
            self.assertEqual(result['errorKind'],'resource_io_error')
    def test_permission_denied_is_io_failure_not_decode_rejection(self):
        import os
        if os.geteuid()==0:self.skipTest('root bypasses Unix file permissions')
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'denied.png';p.write_bytes(b'bad');p.chmod(0)
            try:
                code,result=self.probe(p)
                self.assertNotEqual(code,0)
                self.assertEqual(result['errorKind'],'resource_io_error')
            finally:p.chmod(0o600)
    def test_corrupt_content_is_explicit_decode_rejection(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.png';p.write_bytes(b'not an image')
            code,result=self.probe(p)
            self.assertEqual(code,2)
            self.assertEqual(result['errorKind'],'decode_rejected')
