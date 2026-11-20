import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const worker=resolve('src-tauri/image-worker/bin/draivio-image-worker');
const fixtures='/tmp/draivio-large-images';
function run(...args){const r=spawnSync(worker,args,{encoding:'utf8',timeout:10000});assert.ifError(r.error);return r;}
test('version handshake identifies protocol and bounded editing precision',()=>{const r=run('capabilities');assert.equal(r.status,0);const c=JSON.parse(r.stdout);assert.equal(c.protocolVersion,1);assert.equal(c.workingSampleType,'u8');assert.deepEqual(c.formats,['jpeg','png','tiff']);assert.match(c.runtimeVersion,/^8\./);assert.equal(c.decodersAvailable,true);});
test('three real formats return bounded raw metadata and precision',()=>{for(const file of ['baseline-icc-exif.jpg','odd-alpha.png','striped-small.tiff','gray16.png']){const d=mkdtempSync(join(tmpdir(),'li03-'));try{const r=run('probe',join(fixtures,file),join(d,'profile'));assert.equal(r.status,0,r.stderr);assert.ok(r.stdout.length<4096);const m=JSON.parse(r.stdout);assert.ok(m.width>0&&m.height>0);assert.equal(m.pages,1);assert.ok(['u8','u16','f32'].includes(m.sampleType));if(file.endsWith('jpg')){assert.equal(m.orientation,6);assert.equal(m.profileHash.length,64);assert.ok(readFileSync(join(d,'profile')).length>0);}}finally{rmSync(d,{recursive:true,force:true});}}});
test('strictly rejects numeric injection, bad decode and unsupported precision',()=>{const d=mkdtempSync(join(tmpdir(),'li03-'));try{for(const edge of ['0','4097','10junk','-1','4294967296'])assert.notEqual(run('preview',join(fixtures,'odd-alpha.png'),join(d,'out'),edge).status,0);assert.notEqual(run('preview',join(fixtures,'truncated.png'),join(d,'out'),'512').status,0);assert.equal(run('cache',join(fixtures,'gray16.png'),join(d,'out')).status,66);}finally{rmSync(d,{recursive:true,force:true});}});
test('preview is PNG in display orientation; cache preserves raw dimensions',()=>{const d=mkdtempSync(join(tmpdir(),'li03-'));try{const result=run('preview',join(fixtures,'baseline-icc-exif.jpg'),join(d,'preview'),'512');assert.equal(result.status,0);const size=JSON.parse(result.stdout);assert.ok(size.height>size.width);assert.equal(size.height,512);const b=readFileSync(join(d,'preview'));assert.equal(b.readUInt32BE(16)<=512,true);assert.ok(b.readUInt32BE(20)>b.readUInt32BE(16));assert.equal(run('cache',join(fixtures,'odd-alpha.png'),join(d,'cache')).status,0);}finally{rmSync(d,{recursive:true,force:true});}});
test('independent Pillow verifies raw cache pixels, alpha and exact ICC bytes',()=>{const d=mkdtempSync(join(tmpdir(),'li03-'));try{for(const name of ['odd-alpha.png','baseline-icc-exif.jpg']){const out=join(d,'cache.tif');const r=run('cache',join(fixtures,name),out);assert.equal(r.status,0,r.stderr);const result=spawnSync('python3',['-c',`from PIL import Image,ImageOps,ImageChops
import sys
source=Image.open(sys.argv[1]);cache=Image.open(sys.argv[2])
assert source.size == (cache.tag_v2[256],cache.tag_v2[257])
assert cache.tag_v2.get(274,1) == source.getexif().get(274,1)
if source.format == "JPEG":
    expected=ImageOps.exif_transpose(source)
    assert cache.size == expected.size
    assert max(hi for lo,hi in ImageChops.difference(expected,cache).getextrema()) <= 4
else:
    assert source.tobytes() == cache.tobytes()
assert source.info.get('icc_profile') == cache.info.get('icc_profile')
`,join(fixtures,name),out],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);}}finally{rmSync(d,{recursive:true,force:true});}});
test('display P3 preview converts once to sRGB with straight alpha',()=>{const d=mkdtempSync(join(tmpdir(),'li03-colour-'));try{const source=join(d,'p3.png');const prep=spawnSync('python3',['-c',`from PIL import Image
import sys
im=Image.new('RGBA',(23,17))
im.putdata([((x*11)%256,(y*17)%256,((x+y)*29)%256,64+(x%4)*60) for y in range(17) for x in range(23)])
im.save(sys.argv[1],icc_profile=open('/System/Library/ColorSync/Profiles/Display P3.icc','rb').read())
`,source],{encoding:'utf8'});assert.equal(prep.status,0,prep.stderr);const out=join(d,'display.png');const r=run('preview',source,out,'512');assert.equal(r.status,0,r.stderr);const check=spawnSync('python3',['-c',`from PIL import Image,ImageCms,ImageChops
from io import BytesIO
import sys
source=Image.open(sys.argv[1]);out=Image.open(sys.argv[2])
expected=ImageCms.profileToProfile(source,ImageCms.ImageCmsProfile(BytesIO(source.info['icc_profile'])),ImageCms.createProfile('sRGB'),outputMode='RGBA',renderingIntent=1)
assert source.size == out.size
assert source.getchannel('A').tobytes() == out.getchannel('A').tobytes()
error=max(hi for lo,hi in ImageChops.difference(expected,out).getextrema())
assert error <= 2,error
`,source,out],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);}finally{rmSync(d,{recursive:true,force:true});}});
