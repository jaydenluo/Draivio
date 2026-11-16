// Original authored fixtures; no customer images or model downloads.
import { createCanvas, GlobalFonts } from 'batch-test-canvas'
import { mkdirSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import assert from 'node:assert/strict'
const dir = process.argv[2] || '/tmp/draivio-ocr-evidence'
mkdirSync(dir, {recursive:true})
GlobalFonts.registerFromPath('/System/Library/Fonts/PingFang.ttc', 'PingFang SC')
const canvas=createCanvas(900,440),c=canvas.getContext('2d')
c.fillStyle='#faf7ed';c.fillRect(0,0,900,440)
if(process.argv.includes('--complex')){
 const gradient=c.createLinearGradient(0,0,250,160);gradient.addColorStop(0,'#e0f0ea');gradient.addColorStop(1,'#f4e5d3');c.fillStyle=gradient;c.fillRect(20,95,210,80)
 c.strokeStyle='#cee1da';c.lineWidth=1;for(let x=20;x<230;x+=13){c.beginPath();c.moveTo(x,95);c.lineTo(x+24,175);c.stroke()}
 c.fillStyle='#16473d';c.beginPath();c.arc(760,320,55,0,Math.PI*2);c.fill();c.fillStyle='#ffffff';c.font='22px sans-serif';c.fillText('LOGO',727,327)
}
c.fillStyle='#182429';c.font='40px "PingFang SC"';c.fillText('夏日优惠',40,70);c.fillText('¥99',40,150);c.fillText('¥99',480,150);c.font='26px sans-serif';c.fillText('Original poster 2026',40,230)
c.save();c.translate(440,330);c.rotate(-.13);c.font='38px "PingFang SC"';c.fillText('倾斜中文',0,0);c.restore()
writeFileSync(`${dir}/before.png`,canvas.toBuffer('image/png'))
const helper=`${dir}/ocr-helper`
execFileSync('xcrun',['swiftc','src-tauri/native/ocr.swift','-O','-o',helper])
const output=execFileSync(helper,[],{input:canvas.toBuffer('image/png'),timeout:30000}).toString()
writeFileSync(`${dir}/recognition.json`,output)
const result=JSON.parse(output)
assert.equal(result.width,900);assert.equal(result.height,440)
assert(result.candidates.some(x=>x.text.includes('夏日')))
assert(result.candidates.filter(x=>x.text.includes('99')).length>=2)
assert(result.candidates.some(x=>x.text.includes('倾斜')))
for(const x of result.candidates){assert(x.confidence>=0&&x.confidence<=1);assert(x.quad.every(p=>p.x>=0&&p.x<=900&&p.y>=0&&p.y<=440))}
console.log(JSON.stringify(result,null,2))
