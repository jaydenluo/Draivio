#!/usr/bin/env python3
"""Local CPU ESPCN inference using Apache-2.0 TF-ESPCN weights. No fallback."""
import argparse,base64,hashlib,json,pathlib,threading,urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
HASH={2:'59f77351e1d7c0057bf6fe088b4a8a07e42c468c8c8aebb674a6b4ea1823221d',4:'e403f06309229cf36009cd8fb0da032ba7643fae9f15cf94fe562e8edf8fef47'}
ROOT=pathlib.Path.home()/'.cache/draivio/espcn'
def install(root):
 root.mkdir(parents=True,exist_ok=True)
 for scale,digest in HASH.items():
  url=f'https://api.github.com/repos/fannymonori/TF-ESPCN/contents/export/ESPCN_x{scale}.pb'
  value=json.load(urllib.request.urlopen(url,timeout=30));data=base64.b64decode(value['content'])
  if hashlib.sha256(data).hexdigest()!=digest:raise ValueError('模型 SHA256 校验失败')
  path=root/f'ESPCN_x{scale}.pb';path.write_bytes(data)
class Restorer:
 def __init__(self,root):
  import cv2
  cv2.setNumThreads(2);self.models={};self.lock=threading.Lock()
  for scale,digest in HASH.items():
   path=root/f'ESPCN_x{scale}.pb'
   if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise ValueError('模型缺失或 SHA256 不匹配；运行 --install-model')
   model=cv2.dnn_superres.DnnSuperResImpl_create();model.readModel(str(path));model.setModel('espcn',scale);self.models[scale]=model
 def run(self,value):
  import cv2,numpy as np
  if value.get('protocol')!='draivio-restoration-v1' or value.get('model')!='espcn':raise ValueError('未知模型或协议')
  if value.get('mode')!='size':raise ValueError('ESPCN 仅支持学习型尺寸增强，不提供去模糊或生成式细节补全')
  scale=value.get('scale');image=value.get('image',{});w=image.get('width');h=image.get('height');data=image.get('data')
  if scale not in self.models or type(w) is not int or type(h) is not int or min(w,h)<1 or max(w,h)>512 or not isinstance(data,list) or len(data)!=w*h*4 or any(type(v) is not int or not 0<=v<=255 for v in data):raise ValueError('像素或分块范围无效')
  source=np.array(data,dtype=np.uint8).reshape((h,w,4));bgr=cv2.cvtColor(source[:,:,:3],cv2.COLOR_RGB2BGR)
  with self.lock:output=self.models[scale].upsample(bgr)
  output=cv2.cvtColor(output,cv2.COLOR_BGR2RGB);alpha=cv2.resize(source[:,:,3],(w*scale,h*scale),interpolation=cv2.INTER_NEAREST)
  rgba=np.dstack((output,alpha));rgba[alpha==0,:3]=0
  return {'width':w*scale,'height':h*scale,'data':rgba.flatten().tolist(),'model':'espcn','scale':scale}
def handler(restorer):
 class Handler(BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def reply_headers(self,status):
   self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Content-Type');self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS');self.end_headers()
  def do_OPTIONS(self):self.reply_headers(204)
  def do_GET(self):self.reply_headers(200);self.wfile.write(b'{"model":"espcn","scales":[2,4],"modes":["size"]}')
  def do_POST(self):
   try:
    if self.path!='/restore':raise ValueError('未知路径')
    length=int(self.headers.get('Content-Length',0))
    if not 0<length<=8*1024*1024:raise ValueError('请求过大')
    result=restorer.run(json.loads(self.rfile.read(length)));self.reply_headers(200);self.wfile.write(json.dumps(result,separators=(',',':')).encode())
   except (ValueError,KeyError,TypeError) as error:self.reply_headers(422);self.wfile.write(json.dumps({'error':str(error)}).encode())
   except MemoryError:self.reply_headers(507);self.wfile.write(b'{}')
   except (BrokenPipeError,ConnectionResetError):pass
   except Exception:self.reply_headers(500);self.wfile.write(b'{"error":"Inference failed"}')
 return Handler
def main():
 p=argparse.ArgumentParser();p.add_argument('--model-dir',type=pathlib.Path,default=ROOT);p.add_argument('--install-model',action='store_true');p.add_argument('--port',type=int,default=8767);args=p.parse_args()
 if args.install_model:install(args.model_dir);print('Verified ESPCN 2x/4x installed');return
 restorer=Restorer(args.model_dir);print(f'ESPCN ready at http://127.0.0.1:{args.port}/restore',flush=True);ThreadingHTTPServer(('127.0.0.1',args.port),handler(restorer)).serve_forever()
if __name__=='__main__':main()
