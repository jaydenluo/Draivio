"""Optional desktop CMYK backend. JSON stdin/stdout only; profiles stay local.
Requires Python 3 + Pillow built with LittleCMS2 and libtiff.
"""
import base64
import io
import json
import os
import sys
MAX_PIXELS = 4_000_000
MAX_BYTES = 32 * 1024 * 1024
DEFAULT_PROFILE = '/System/Library/ColorSync/Profiles/Generic CMYK Profile.icc'

def decode(value, limit=MAX_BYTES):
    if not isinstance(value, str) or len(value) > (limit * 4 // 3 + 8):
        raise ValueError('资源超出传输预算')
    data = base64.b64decode(value, validate=True)
    if len(data) > limit:
        raise ValueError('资源超出传输预算')
    return data

def encode(value):
    return base64.b64encode(value).decode('ascii')

def process(request):
    from PIL import Image, ImageCms, features
    if not features.check('littlecms2') or not features.check('libtiff'):
        raise ValueError('本机 Pillow 缺少 LittleCMS2 或 libtiff')
    operation = request.get('operation')
    intent_map = {'perceptual':0, 'relative-colorimetric':1, 'saturation':2, 'absolute-colorimetric':3}
    rendering_intent = intent_map.get(request.get('renderingIntent','relative-colorimetric'), 1)
    flags = 8192 if request.get('blackPointCompensation', True) else 0
    if operation == 'capabilities':
        return {'available': True, 'systemProfile': os.path.isfile(DEFAULT_PROFILE), 'backend': 'Pillow LittleCMS2 / libtiff'}
    width, height = request.get('width'), request.get('height')
    if type(width) is not int or type(height) is not int or width <= 0 or height <= 0 or width * height > MAX_PIXELS:
        raise ValueError('CMYK 图像必须为正整数尺寸，最多 400 万像素')
    pixels = decode(request.get('data'))
    if len(pixels) != width * height * 4:
        raise ValueError('四通道像素长度不匹配')
    supplied = request.get('profile')
    if supplied:
        profile_bytes = decode(supplied, 4 * 1024 * 1024)
    elif os.path.isfile(DEFAULT_PROFILE):
        with open(DEFAULT_PROFILE, 'rb') as f:
            profile_bytes = f.read()
    else:
        raise ValueError('请选择用户提供的 CMYK ICC 配置文件')
    if len(profile_bytes) < 132 or profile_bytes[36:40] != b'acsp' or profile_bytes[16:20] != b'CMYK':
        raise ValueError('需要真实 CMYK ICC 配置文件')
    cmyk_profile = ImageCms.ImageCmsProfile(io.BytesIO(profile_bytes))
    srgb = ImageCms.createProfile('sRGB')
    if operation == 'convert':
        image = Image.frombytes('RGBA', (width, height), pixels)
        # CMYK TIFF has no alpha: explicit white matte is part of the conversion UI.
        rgb = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
        source = ImageCms.ImageCmsProfile(io.BytesIO(decode(request['sourceProfile'], 4 * 1024 * 1024))) if request.get('sourceProfile') else srgb
        cmyk = ImageCms.profileToProfile(rgb, source, cmyk_profile, outputMode='CMYK', renderingIntent=rendering_intent, flags=flags)
    elif operation in ('render', 'export'):
        cmyk = Image.frombytes('CMYK', (width, height), pixels)
    else:
        raise ValueError('不支持的 CMYK 操作')
    preview = ImageCms.profileToProfile(cmyk, cmyk_profile, srgb, outputMode='RGB', renderingIntent=rendering_intent, flags=flags).convert('RGBA')
    if request.get('simulatePaperWhite'):
        # Paper-white simulation is a display overlay only; device samples remain unchanged.
        overlay = Image.new('RGBA', preview.size, (255,255,255,255)); preview = Image.blend(preview, overlay, 0.12)
    if request.get('simulateBlackInk'):
        preview = Image.blend(preview, Image.new('RGBA', preview.size, (0,0,0,255)), 0.04)
    png = io.BytesIO()
    preview.save(png, format='PNG', icc_profile=ImageCms.ImageCmsProfile(srgb).tobytes())
    samples = cmyk.tobytes()
    maximum_ink = max(sum(samples[i:i + 4]) / 255 for i in range(0, len(samples), 4))
    result = {'width': width, 'height': height, 'data': encode(samples), 'profile': encode(profile_bytes), 'profileName': ImageCms.getProfileName(cmyk_profile).strip(), 'previewPng': 'data:image/png;base64,' + encode(png.getvalue()), 'rgb': encode(preview.tobytes()), 'maximumInk': maximum_ink}
    if operation == 'convert':
        original = io.BytesIO()
        rgb.save(original, format='PNG')
        result['sourcePreviewPng'] = 'data:image/png;base64,' + encode(original.getvalue())
    if operation == 'export':
        output = io.BytesIO()
        cmyk.save(output, format='TIFF', compression='tiff_lzw', icc_profile=profile_bytes)
        encoded = output.getvalue()
        # Reopen from the file, never trust only in-memory mode.
        independent = Image.open(io.BytesIO(encoded))
        independent.load()
        if independent.mode != 'CMYK' or independent.tobytes() != samples or independent.info.get('icc_profile') != profile_bytes:
            raise ValueError('CMYK TIFF 独立解码校验失败')
        result['tiff'] = encode(encoded)
        result['verifiedChannels'] = len(independent.getbands())
    return result

if __name__ == '__main__':
    try:
        body = sys.stdin.buffer.read(MAX_BYTES * 3 + 1)
        if len(body) > MAX_BYTES * 3:
            raise ValueError('请求超出内存预算')
        print(json.dumps(process(json.loads(body))))
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        sys.exit(1)
