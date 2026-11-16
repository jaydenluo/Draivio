"""Local optional RAW backend: rawpy (MIT), LibRaw (LGPL-2.1/CDDL-1.0).
No network, shell, embedded-thumbnail fallback or user-provided executable code.
"""
import base64, hashlib, io, json, math, resource, sys

def process(req):
    import rawpy
    import numpy as np
    from PIL import Image
    if req.get('operation') == 'capabilities':
        return {'available': True, 'rawpy': rawpy.__version__, 'libraw': list(rawpy.libraw_version)}
    data = base64.b64decode(req['data'], validate=True)
    if not 16 <= len(data) <= 16*1024*1024 or data[:2] == b'\xff\xd8':
        raise ValueError('不支持/损坏的RAW或超过16MiB原始资源预算')
    s=req['settings']; ev=s['exposureEV']; recovery=s['highlightRecovery']; wb=[s['whiteBalance'][c] for c in 'rgb']
    if not all(math.isfinite(v) for v in [ev,recovery,*wb]) or not -8<=ev<=8 or not 0<=recovery<=1 or not all(0<v<=16 for v in wb): raise ValueError('显影参数无效')
    with rawpy.imread(io.BytesIO(data)) as raw:
        sizes=raw.sizes
        if sizes.raw_width*sizes.raw_height>60_000_000: raise ValueError('RAW传感器超过6000万像素预算')
        camera=list(raw.camera_whitebalance)
        gains=[camera[i]*wb[i if i<3 else 1] for i in range(4)]
        if not all(math.isfinite(v) and v>0 for v in gains[:3]): gains=[wb[0],wb[1],wb[2],wb[1]]
        # Full demosaic, camera WB multiplied by user controls; LibRaw applies flip.
        rgb=raw.postprocess(output_bps=16, output_color=rawpy.ColorSpace.sRGB, gamma=(2.222,4.5), no_auto_bright=True, user_wb=gains, exp_shift=2**ev, highlight_mode=rawpy.HighlightMode.ReconstructDefault if recovery>=.5 else rawpy.HighlightMode.Clip, half_size=True)
        h,w=rgb.shape[:2]
        if w*h*8>32*1024*1024: raise ValueError('显影输出超过32MiB高精度预算')
        rgba=np.empty((h,w,4),dtype='<u2');rgba[:,:,:3]=rgb;rgba[:,:,3]=65535
        preview=io.BytesIO();Image.fromarray((rgb>>8).astype('uint8')).save(preview,format='PNG')
        return {'asset':{'width':w,'height':h,'format':'rgba16','encoding':'srgb','data':base64.b64encode(rgba.tobytes()).decode()},'preview':'data:image/png;base64,'+base64.b64encode(preview.getvalue()).decode(),'orientation':{0:1,3:3,5:8,6:6}.get(sizes.flip,1),'sensorWidth':sizes.raw_width,'sensorHeight':sizes.raw_height,'cameraWhiteBalance':camera,'checksum':hashlib.sha256(data).hexdigest(),'backend':f'rawpy {rawpy.__version__} / LibRaw {rawpy.libraw_version}','peakRss':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,'resolution':'half-size sensor demosaic'}

if __name__=='__main__':
    try:
        # Limit process address space, independent of UI. The parent also enforces timeout/cancel.
        if sys.platform != 'darwin':
            soft,hard=resource.getrlimit(resource.RLIMIT_AS)
            cap=min(2*1024**3,hard) if hard>0 else 2*1024**3
            resource.setrlimit(resource.RLIMIT_AS,(cap,hard))
        payload=sys.stdin.buffer.read(24*1024*1024+1)
        if len(payload)>24*1024*1024: raise ValueError('RAW请求超过预算')
        print(json.dumps(process(json.loads(payload))))
    except Exception as e:
        print(json.dumps({'error':'RAW解码失败：'+str(e)+'；需要本地 Python 3、rawpy 0.28 和 Pillow'}));sys.exit(1)
