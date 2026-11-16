#!/usr/bin/env python3
"""Actual U2Netp ONNX inference. Apache-2.0 architecture/weights; see README.
No model inference is substituted by a geometric/background-color heuristic.
"""
import argparse, base64, hashlib, io, json, os, pathlib, sys, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
MODEL_URL='https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx'
MODEL_SHA256='309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8'
def model_path():
    if sys.platform=='darwin': root=pathlib.Path.home()/'Library/Application Support/com.draivio.app'
    elif sys.platform=='win32': root=pathlib.Path(os.environ.get('APPDATA',pathlib.Path.home()))/'com.draivio.app'
    else: root=pathlib.Path(os.environ.get('XDG_DATA_HOME',pathlib.Path.home()/'.local/share'))/'com.draivio.app'
    return root/'models/u2netp/model.bin'
def verify(path):
    if not path.is_file(): raise ValueError('U2Netp ONNX 模型未安装；运行 gateway.py --install-model')
    if hashlib.sha256(path.read_bytes()).hexdigest()!=MODEL_SHA256: raise ValueError('U2Netp 模型校验失败；不能将旧 PyTorch 权重用于 ONNX 推理')
def install(path):
    path.parent.mkdir(parents=True,exist_ok=True)
    with urllib.request.urlopen(MODEL_URL,timeout=60) as r: data=r.read(6_000_001)
    if len(data)>6_000_000 or hashlib.sha256(data).hexdigest()!=MODEL_SHA256: raise ValueError('下载模型大小或 SHA256 无效')
    temp=path.with_suffix('.part');temp.write_bytes(data);temp.replace(path)
class Segmenter:
    model_name='u2netp-onnx'
    targets=['subject','background']
    def __init__(self,path):
        verify(path)
        import onnxruntime as ort
        options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
        self.session=ort.InferenceSession(str(path),sess_options=options,providers=['CPUExecutionProvider'])
    def run(self,image,target='subject',query=None):
        if target not in ('subject','background'): raise ValueError('U2Netp 仅支持显著主体/背景，不支持指定物体语义；请使用已部署的实例分割服务')
        import numpy as np
        from PIL import Image,ImageOps
        source=ImageOps.exif_transpose(Image.open(io.BytesIO(image))).convert('RGB')
        if source.width*source.height>16_777_216: raise ValueError('图像过大')
        resized=source.resize((320,320),Image.Resampling.LANCZOS)
        array=np.asarray(resized,dtype=np.float32); maximum=float(array.max())
        if maximum<=0: raise ValueError('输入图像没有可分析内容')
        array=array/maximum;array=(array-np.array([.485,.456,.406],dtype=np.float32))/np.array([.229,.224,.225],dtype=np.float32)
        tensor=np.transpose(array,(2,0,1))[None,...].astype(np.float32)
        prediction=self.session.run(None,{self.session.get_inputs()[0].name:tensor})[0][0,0]
        lo,hi=float(prediction.min()),float(prediction.max())
        if not np.isfinite(prediction).all() or hi-lo<1e-8: raise ValueError('模型未产生有效分割，不生成替代蒙版')
        mask=Image.fromarray(np.rint((prediction-lo)/(hi-lo)*255).astype(np.uint8)).resize(source.size,Image.Resampling.LANCZOS)
        alpha=np.asarray(mask,dtype=np.uint8)
        if not alpha.any(): raise ValueError('模型未发现主体')
        # U2Netp has no calibrated object confidence: force explicit user confirmation.
        return {'width':source.width,'height':source.height,'model':'u2netp-onnx','candidates':[{'id':'salient-subject','label':'显著主体（需确认）','confidence':.5,'alpha':alpha.flatten().tolist()}]}
def handler(segmenter):
 class Handler(BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def reply_headers(self,status):
        self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','POST, GET, OPTIONS');self.end_headers()
    def do_OPTIONS(self): self.reply_headers(204)
    def do_GET(self):
        self.reply_headers(200);self.wfile.write(json.dumps({'ready':segmenter is not None,'model':segmenter.model_name,'targets':segmenter.targets,'objectSupported':'object' in segmenter.targets}).encode())
    def do_POST(self):
        try:
            if self.path!='/segment': raise ValueError('未知分割路径')
            length=int(self.headers.get('Content-Length',0))
            if length<1 or length>16*1024*1024: raise ValueError('输入大小无效')
            data=json.loads(self.rfile.read(length));image=data.get('image','')
            if not image.startswith('data:image/') or ';base64,' not in image: raise ValueError('仅接受内联图像')
            raw=base64.b64decode(image.split(',',1)[1],validate=True)
            result=segmenter.run(raw,data.get('target','subject'),data.get('query'));self.reply_headers(200);self.wfile.write(json.dumps(result,separators=(',',':')).encode())
        except (ValueError,KeyError,TypeError) as error:
            self.reply_headers(422);self.wfile.write(json.dumps({'error':str(error)},ensure_ascii=False).encode())
        except (BrokenPipeError,ConnectionResetError): pass
        except Exception:
            self.reply_headers(500);self.wfile.write(b'{"error":"Local inference failed"}')
 return Handler
def main():
    p=argparse.ArgumentParser();p.add_argument('--grounded-config',type=pathlib.Path);p.add_argument('--model',type=pathlib.Path,default=model_path());p.add_argument('--install-model',action='store_true');p.add_argument('--port',type=int,default=8766);p.add_argument('--target',choices=['subject','background','object'],default='subject');p.add_argument('--query');p.add_argument('--input',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path);args=p.parse_args()
    if args.install_model: install(args.model);print(f'Installed verified U2Netp: {args.model}');return
    if args.grounded_config:
        from grounded import GroundedSegmenter
        segmenter=GroundedSegmenter.from_config(args.grounded_config)
    else: segmenter=Segmenter(args.model)
    if args.input:
        result=segmenter.run(args.input.read_bytes(),args.target,args.query);args.output.write_text(json.dumps(result));print(json.dumps({'model':result['model'],'width':result['width'],'height':result['height'],'candidates':len(result['candidates']),'min':min(result['candidates'][0]['alpha']),'max':max(result['candidates'][0]['alpha'])}));return
    print(f'{segmenter.model_name} ready at http://127.0.0.1:{args.port}/segment',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),handler(segmenter)).serve_forever()
if __name__=='__main__': main()
