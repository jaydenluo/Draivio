#!/usr/bin/env python3
"""Isolated real Pillow header/decode probes, never a WebView first-paint proxy."""
import argparse,json,resource,sys,time
from PIL import Image, UnidentifiedImageError
p=argparse.ArgumentParser();p.add_argument('stage',choices=['inspect','decode']);p.add_argument('path');p.add_argument('--max-pixels',type=int,default=33554432);a=p.parse_args()
start=time.perf_counter()
accessing_file=True
try:
    Image.MAX_IMAGE_PIXELS=None # Read headers, then enforce our own explicit budget before load.
    # Opening/OS errno failures are resource IO, never evidence of malformed content.
    # Read through the already-open descriptor so access errors precede Pillow parsing.
    stream=open(a.path,'rb')
    accessing_file=False
    with stream, Image.open(stream) as im:
        meta={'width':im.width,'height':im.height,'format':im.format,'mode':im.mode}
        if a.stage=='decode':
            if im.width*im.height>a.max_pixels:
                print(json.dumps({'outcome':'not_run','reason':'decode exceeds explicit 32MP baseline budget','metadata':meta}));sys.exit(0)
            im.load()
        print(json.dumps({'outcome':'passed','operationMs':(time.perf_counter()-start)*1000,'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=='darwin' else 1024),'metadata':meta}))
except Exception as e:
    print(json.dumps({'outcome':'failed','errorKind':'resource_io_error' if accessing_file or (isinstance(e,OSError) and e.errno is not None) else 'decode_rejected' if isinstance(e,(UnidentifiedImageError,OSError)) else 'probe_error','error':type(e).__name__+': '+str(e),'operationMs':(time.perf_counter()-start)*1000}));sys.exit(2)
