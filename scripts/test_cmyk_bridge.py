import base64
import io
import os
import unittest
from PIL import Image
from cmyk_bridge import process, DEFAULT_PROFILE
class CmykBridgeTests(unittest.TestCase):
    def test_real_icc_and_four_channel_tiff(self):
        source = bytes([0,0,0,255,255,0,0,255,0,255,0,255,255,255,255,255])
        converted = process({'operation':'convert','width':4,'height':1,'data':base64.b64encode(source).decode()})
        self.assertGreater(len(base64.b64decode(converted['profile'])),132)
        samples=base64.b64decode(converted['data'])
        self.assertEqual(len(samples),16)
        self.assertGreater(samples[3],0) # ICC black generation includes K.
        self.assertLessEqual(converted['maximumInk'],4)
        output=process({'operation':'export',**{k:converted[k] for k in ['width','height','data','profile']}})
        independent=Image.open(io.BytesIO(base64.b64decode(output['tiff'])))
        self.assertEqual(independent.mode,'CMYK')
        self.assertEqual(independent.tag_v2[262],5) # Separated / CMYK photometric interpretation.
        self.assertEqual(tuple(independent.tag_v2[258]),(8,8,8,8))
        self.assertEqual(independent.tobytes(),samples)
        self.assertEqual(independent.info['icc_profile'],base64.b64decode(converted['profile']))
        # Export and render never transform device CMYK samples again.
        self.assertEqual(output['data'],converted['data'])
    def test_explicit_k_only_input_preserved(self):
        result=process({'operation':'export','width':1,'height':1,'data':base64.b64encode(bytes([0,0,0,255])).decode()})
        self.assertEqual(base64.b64decode(result['data']),bytes([0,0,0,255]))
        self.assertEqual(result['maximumInk'],1)
    def test_reject_invalid_profile_and_dimensions(self):
        with self.assertRaises(ValueError): process({'operation':'convert','width':0,'height':1,'data':''})
        with self.assertRaises(ValueError): process({'operation':'render','width':1,'height':1,'data':'AAAAAA==','profile':'AAAA'})
if __name__=='__main__': unittest.main()
