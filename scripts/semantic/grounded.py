"""Optional actual GroundingDINO + MobileSAM instance segmentation.
Explicit local verified artifacts only. Never substitutes boxes or saliency for instances.
"""
import hashlib,io,json,pathlib,re,sys,threading

def artifact_hash(path,expected):
 path=pathlib.Path(path)
 if not path.is_file():raise ValueError(f'模型 artifact 未安装: {path}')
 if not re.fullmatch('[0-9a-f]{64}',expected):raise ValueError('artifact SHA256 配置无效')
 digest=hashlib.file_digest(path.open('rb'),'sha256').hexdigest()
 if digest!=expected:raise ValueError(f'模型 artifact SHA256 校验失败: {path.name}')
 return path

def normalize_query(query):
 query=str(query).strip()
 if not query or len(query)>128:raise ValueError('指定物体描述须为1–128字符')
 # Vocabulary translation only; boxes/masks still come solely from model inference.
 query={'衣服':'clothing','衬衫':'shirt','外套':'jacket','裤子':'pants','人':'person'}.get(query,query)
 return query.lower().rstrip(' .')+' .'

class GroundedSegmenter:
 targets=['subject','background','object']
 model_name='groundingdino-swint+mobilesam-vitt+u2netp'
 @classmethod
 def from_config(cls,path):
  config=json.loads(pathlib.Path(path).read_text())
  for name in ('dino','sam','vocab'):artifact_hash(config[name]['path'],config[name]['sha256'])
  for name in ('dino_source','sam_source'):
   source=pathlib.Path(config[name]);
   if not source.is_dir():raise ValueError(f'模型源码未安装: {source}')
   sys.path.insert(0,str(source))
  return cls(config)
 def __init__(self,config):
  import torch
  from transformers import BertConfig,BertModel,BertTokenizer
  from groundingdino.util import get_tokenlizer
  from groundingdino.util.slconfig import SLConfig
  from groundingdino.util.utils import clean_state_dict
  from groundingdino.models import build_model
  from mobile_sam import sam_model_registry,SamPredictor
  from gateway import Segmenter,model_path
  self.torch=torch;torch.set_num_threads(2);torch.set_num_interop_threads(1)
  self.lock=threading.Lock();self.box_threshold=float(config.get('box_threshold',.30));self.nms_threshold=.5
  if not .1<=self.box_threshold<=.9:raise ValueError('检测阈值配置无效')
  args=SLConfig.fromfile(str(pathlib.Path(config['dino_source'])/'groundingdino/config/GroundingDINO_SwinT_OGC.py'));args.device='cpu';args.use_checkpoint=False;args.use_transformer_ckpt=False
  # The official detection checkpoint embeds the full BERT encoder. Instantiate
  # its known architecture offline, then require every trainable model parameter
  # to be supplied by the checkpoint. No random text encoder is used at inference.
  original_tokenizer=get_tokenlizer.get_tokenlizer;original_bert=get_tokenlizer.get_pretrained_language_model
  get_tokenlizer.get_tokenlizer=lambda _:BertTokenizer(vocab_file=config['vocab']['path'],do_lower_case=True)
  get_tokenlizer.get_pretrained_language_model=lambda _:BertModel(BertConfig())
  try:self.dino=build_model(args)
  finally:get_tokenlizer.get_tokenlizer=original_tokenizer;get_tokenlizer.get_pretrained_language_model=original_bert
  state=clean_state_dict(torch.load(config['dino']['path'],map_location='cpu',weights_only=True)['model'])
  missing,unexpected=self.dino.load_state_dict(state,strict=False)
  parameters=dict(self.dino.named_parameters());missing_parameters=[name for name in missing if name in parameters]
  if missing_parameters:raise ValueError(f'模型参数不完整，拒绝随机参数推理: {missing_parameters[:8]}')
  if any(name.startswith('bert.') and name not in ('bert.embeddings.position_ids','bert.embeddings.token_type_ids') for name in unexpected):raise ValueError(f'BERT 参数不兼容: {unexpected}')
  self.load_evidence={'missingBuffers':missing,'unexpectedKeys':unexpected,'bertParameterCount':sum(name.startswith('bert.') for name in parameters),'randomParameters':missing_parameters}
  self.dino.eval();sam=sam_model_registry['vit_t'](checkpoint=None)
  sam.load_state_dict(torch.load(config['sam']['path'],map_location='cpu',weights_only=True),strict=True);sam.eval();self.sam=SamPredictor(sam)
  self.subject=Segmenter(pathlib.Path(config.get('u2netp',str(model_path()))))
 def run(self,image,target='subject',query=None):
  if target in ('subject','background'):return self.subject.run(image,target)
  if target!='object':raise ValueError('未知目标类型')
  caption=normalize_query(query or '')
  from PIL import Image,ImageOps
  import numpy as np
  import groundingdino.datasets.transforms as T
  from torchvision.ops import nms
  source=ImageOps.exif_transpose(Image.open(io.BytesIO(image))).convert('RGB');width,height=source.size
  if width*height>4_194_304 or max(width,height)>4096:raise ValueError('图像超过4096边长或4MP限制')
  transform=T.Compose([T.RandomResize([600],max_size=1000),T.ToTensor(),T.Normalize([.485,.456,.406],[.229,.224,.225])]);tensor,_=transform(source,None)
  with self.lock,self.torch.inference_mode():
   output=self.dino(tensor[None],captions=[caption]);logits=output['pred_logits'].sigmoid()[0].cpu();boxes=output['pred_boxes'][0].cpu();scores=logits.max(dim=1).values;keep=scores>self.box_threshold;boxes=boxes[keep];scores=scores[keep]
   if not len(boxes):raise ValueError('模型未发现指定物体，未生成蒙版')
   boxes=boxes*self.torch.tensor([width,height,width,height]);boxes[:,:2]-=boxes[:,2:]/2;boxes[:,2:]+=boxes[:,:2];boxes[:,0::2].clamp_(0,width);boxes[:,1::2].clamp_(0,height)
   keep=nms(boxes,scores,self.nms_threshold)
   if len(keep)>16:raise ValueError('候选超过16个，请缩小目标范围')
   boxes=boxes[keep];scores=scores[keep];self.sam.set_image(np.asarray(source));candidates=[]
   for index,(box,score) in enumerate(zip(boxes,scores)):
    masks,qualities,_=self.sam.predict(box=box.numpy(),multimask_output=False)
    alpha=(masks[0].astype(np.uint8)*255)
    if not alpha.any():continue
    candidates.append({'id':f'instance-{index+1}','label':str(query).strip(),'confidence':float(score),'alpha':alpha.ravel().tolist(),'box':box.tolist(),'maskQuality':float(qualities[0])})
   self.sam.reset_image()
  if not candidates:raise ValueError('模型未发现有效实例蒙版')
  return {'width':width,'height':height,'model':self.model_name,'query':caption,'candidates':candidates}
