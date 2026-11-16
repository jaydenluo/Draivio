#!/usr/bin/env python3
"""Decode an actual downloaded image with Pillow and check analytic probe pixels."""
import argparse
import json
from pathlib import Path
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('file', type=Path)
    parser.add_argument('--scenario', choices=['blocks-canvas','blocks-selection','effects-canvas','effects-layer'], required=True)
    parser.add_argument('--format', choices=['png','jpeg','webp'], required=True)
    parser.add_argument('--mime', help='Actual browser Blob/response MIME, if independently captured; optional for filesystem downloads')
    parser.add_argument('--width', type=int, help='Requested output width, defaults to scenario native size')
    parser.add_argument('--height', type=int, help='Requested output height, defaults to scenario native size')
    parser.add_argument('--background', help='Specified opaque export background, e.g. ffffff (required for JPEG)')
    parser.add_argument('--tolerance', type=int, help='RGB tolerance; default PNG=2, JPEG/WebP=18. Alpha tolerance is 2.')
    args = parser.parse_args()
    scenario = json.loads((ROOT/'manifest.json').read_text())['scenarios'][args.scenario]
    errors = []
    expected_format = {'png':'PNG','jpeg':'JPEG','webp':'WEBP'}[args.format]
    expected_mime = {'png':'image/png','jpeg':'image/jpeg','webp':'image/webp'}[args.format]
    if args.mime and args.mime != expected_mime:
        errors.append(f'captured MIME {args.mime!r} != {expected_mime!r}')
    raw = args.file.read_bytes()
    signature_ok = {'png':raw.startswith(b'\x89PNG\r\n\x1a\n'), 'jpeg':raw.startswith(b'\xff\xd8\xff') and raw.endswith(b'\xff\xd9'), 'webp':raw.startswith(b'RIFF') and raw[8:12]==b'WEBP' and int.from_bytes(raw[4:8],'little')+8==len(raw)}[args.format]
    if not signature_ok:
        errors.append('file magic/container length does not match requested format')
    bg = None
    if args.background:
        value = args.background.lstrip('#')
        if len(value)!=6:
            parser.error('--background must contain six hexadecimal digits')
        try: bg = [int(value[i:i+2],16) for i in (0,2,4)]
        except ValueError: parser.error('--background must contain six hexadecimal digits')
    if args.format=='jpeg' and bg is None:
        parser.error('JPEG requires --background with the color selected in the export dialog')
    width = args.width or scenario['size'][0]
    height = args.height or scenario['size'][1]
    if min(width,height)<1:
        parser.error('width and height must be positive')
    tolerance = args.tolerance if args.tolerance is not None else (2 if args.format=='png' else 18)
    with Image.open(args.file) as image:
        image.load()  # Force a complete independent decode, not just a header read.
        decoded_format = image.format
        decoded_mime = Image.MIME.get(decoded_format)
        if decoded_format != expected_format or decoded_mime != expected_mime:
            errors.append(f'decoded format/MIME {decoded_format}/{decoded_mime} != {expected_format}/{expected_mime}')
        if image.size != (width,height):
            errors.append(f'dimensions {image.size} != {(width,height)}')
        rgba = image.convert('RGBA')
        results=[]
        if image.size == (width,height):
            for probe in scenario['probes']:
                # Probe the center of the corresponding native pixel; all probes avoid boundaries.
                x = min(width-1,int((probe['x']+.5)*width/scenario['size'][0]))
                y = min(height-1,int((probe['y']+.5)*height/scenario['size'][1]))
                wanted = probe['rgba'].copy()
                if bg is not None:
                    alpha = wanted[3]/255
                    wanted = [round(wanted[c]*alpha+bg[c]*(1-alpha)) for c in range(3)]+[255]
                actual = list(rgba.getpixel((x,y)))
                # RGB underneath fully transparent pixels is unspecified.
                checks = [3] if wanted[3]==0 else [0,1,2,3]
                passed = all(abs(actual[c]-wanted[c]) <= (2 if c==3 else tolerance) for c in checks)
                results.append(dict(label=probe['label'],xy=[x,y],expected=wanted,actual=actual,passed=passed))
                if not passed: errors.append(f"{probe['label']} at {(x,y)}: {actual} != {wanted}")
            if bg is None:
                for region in scenario.get('inkRegions',[]):
                    x,y,w,h=region['rect']
                    rect=(int(x*width/scenario['size'][0]),int(y*height/scenario['size'][1]),int((x+w)*width/scenario['size'][0]),int((y+h)*height/scenario['size'][1]))
                    ink=sum(1 for pixel in rgba.crop(rect).getdata() if pixel[3]>32)
                    minimum=max(1,round(region['minAlphaPixels']*width*height/(scenario['size'][0]*scenario['size'][1])))
                    if ink<minimum: errors.append(f"{region['label']}: only {ink} nontransparent pixels; expected >= {minimum}")
    print(json.dumps(dict(file=str(args.file.resolve()),scenario=args.scenario,passed=not errors,requestedFormat=args.format,decodedFormat=decoded_format,decodedMime=decoded_mime,capturedMime=args.mime,capturedMimeChecked=args.mime is not None,size=[width,height],bytes=len(raw),probes=results,errors=errors),indent=2))
    return 1 if errors else 0

if __name__=='__main__':
    try: sys.exit(main())
    except (OSError,ValueError) as error:
        print(json.dumps(dict(passed=False,error=str(error))),file=sys.stderr)
        sys.exit(1)
