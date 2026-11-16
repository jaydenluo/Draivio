import { describe,it,expect } from 'vitest'
import { defaultProfile } from './iccPipeline'
import { analyzeCmyk,defaultSoftProofSettings,validateSoftProofSettings } from './softProof'
describe('soft proof',()=>{it('reports target-profile CMYK ink instead of RGB thresholds',()=>{const p=defaultProfile();const r=analyzeCmyk(new Uint8Array([0,0,0,255,255,255,255,0]),p,3);expect(r.maxInkPercent).toBe(300);expect(r.outOfGamutPixels).toBe(0);expect(r.profileChecksum).toBe(p.checksum)});it('validates settings and preserves explicit toggles',()=>{const s=defaultSoftProofSettings();s.enabled=true;s.simulatePaperWhite=true;validateSoftProofSettings(s);expect(s.simulatePaperWhite).toBe(true);expect(()=>validateSoftProofSettings({...s,totalInkLimit:0})).toThrow()})})
import { stripSoftProofOverlay } from '../canvas/CanvasScene'
it('removes an existing proof overlay before rerender',()=>{expect(stripSoftProofOverlay('<svg><image data-soft-proof="true"/><rect data-layer-id="a"/></svg>')).not.toContain('data-soft-proof')})
