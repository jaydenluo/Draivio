import { describe, expect, it } from 'vitest'
import { chooseOcrCandidate, quadBounds, type OcrCandidate } from './ocr'
const candidate = (id='one', text='¥99'): OcrCandidate => ({ id, text, confidence: .96, quad: [{x:10,y:20},{x:110,y:20},{x:110,y:60},{x:10,y:60}], fontFamily:'sans-serif', fontAvailable:true })
describe('OCR candidate safety', () => {
 it('selects one high confidence candidate and derives rotated-safe bounds', () => { const c=chooseOcrCandidate([candidate()], '¥99'); expect(c.id).toBe('one'); expect(quadBounds(c.quad)).toEqual({x:10,y:20,width:100,height:40}) })
 it('requires explicit location for duplicate or low confidence text', () => { expect(()=>chooseOcrCandidate([candidate('a'),candidate('b')],'¥99')).toThrow('多个'); const low={...candidate(),confidence:.5}; expect(()=>chooseOcrCandidate([low],'¥99')).toThrow('置信度') })
 it('rejects missing fonts and malformed coordinates', () => { expect(()=>chooseOcrCandidate([{...candidate(),fontAvailable:false}],'¥99')).toThrow('字体'); expect(()=>chooseOcrCandidate([{...candidate(),quad:[{x:NaN,y:0},{x:1,y:1},{x:2,y:2},{x:3,y:3}]}],'¥99')).toThrow('坐标') })
})
